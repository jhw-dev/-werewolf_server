/**
 * Created by yuanfei on 15/8/14.
 */


var WebSocketServer = require('ws').Server
    , wss = new WebSocketServer({ port: 8080 });

var server_msg = new Messages(wss);
var gameMain = new Game(1);

//-------------Message
function Messages(wss)
{
    this.wss_ = wss;
    this.command_=new Object();
}

Messages.prototype.decode = function(data,ws)
{


        var decodeMsg=eval ("(" + data + ")");

        var cmd = decodeMsg.cmd;
        var data = decodeMsg.data;

        var fun=this.command_[cmd];
        if(fun){
            fun.call(null,data,ws);
        }


}


Messages.prototype.register=function(cmd,fun)
{
    this.command_[cmd] = fun;
}

Messages.prototype.send = function(cmd,data,ws)
{
    var send_data=new Object();
    send_data.cmd = cmd;
    send_data.data = (data)?data:new Object();;
    var d=JSON.stringify(send_data);
    console.log("Send Data:%s",d);
    ws.send(d)
}


//-----角色类------
function Role(ws)
{
    this._ws=ws;
    this.id=null;
    this.type=null;
    this.isDead = false;
    this.num= null;
    //是否为警长
    this.sheriff = false;
    //是否投票
    this.isVote = false;


    //是否准备
    this.isReady = false;
    //是否被守卫保护
    this.protection = false;
    //狼人是否杀过人
    this.killed = false;
}

//--平民,守卫,预言家,女巫,狼人
Role.TYPE = {"PM":1,"SW":2,"YY":3,"NW":4,"LR":5};
//神的列表
Role.GOD=[Role.TYPE.YY,Role.TYPE.SW,Role.TYPE.NW];
Role.prototype.setData = function(value)
{
    this.id = value.id;
    this.type = value.type;
    this.num = value.num;
}

Role.prototype.getData = function()
{
    return {id:this.id,
            type:this.type,
            num:this.num};
}

Role.prototype.getSocket= function () {
    return this._ws
}

//重置状态
Role.prototype.resetState=function()
{
    this.isDead=false;
    this.isReady=false;
    this.protection = false;
}


//----------游戏逻辑-----
function Game(num)
{
    this.isStartGame=false
    //初始化游戏角色人数
    this.role_num = num;
    this.client = new Array();
    this._clientKey = new Object();
    //是否选过警长
    this.isChoosePoilceman = false;
    this.wolfList = new Array();
    //被杀死角色列表
    this.roleDeadList = new Array();
    //游戏中角色的ID
    this.gameRoleId=new Array();
    //投票结果
    this.voteResult=new Object();
    //已经投票了的角色
    this.hasVoteRole = new Array();
    //死亡角色类型列表
    this.deadRoleTypelist = new Array();

    this.Rounds=0;
    this.prototypeRoleList= new Object()

}

Game.prototype.isStart = function()
{
    return this.isStartGame;
}

Game.prototype.cleanVote=function()
{
    this.voteResult=null;
    this.voteResult=new Object();
    this.hasVoteRole.length=0;
}

//新游戏开始清除数据
Game.prototype.cleanAll=function()
{
    for(var key in this.client)
    {
        this.client[key]=null;
    }

    this.client.length=0
    this._clientKey=null;
    this._clientKey=new Object();
    this.isChoosePoilceman=false;
    this.wolfList.length=0;
    this.roleDeadList.length=0;
    this.gameRoleId.length=0;
    this.deadRoleTypelist.length=0;
    this.prototypeRoleList = null;
    this.prototypeRoleList = new Object();
}
//--主动关闭客户端的成员删除
Game.prototype.closeRole = function(ws)
{
    var index=0;
    for(var key in this.client)
    {
        var role = this.client[key];
        if(role.getSocket()==ws)
        {
            this.client[key]=null;
            this.client.splice(index,1);
            break;
        }
        index++;
    }

    if(this.client.length==0)
    {
        this.cleanAll();
        this.isStartGame=false;
    }

}

Game.prototype.pushRole=function(role)
{

    this.client.push(role)
    var role_num =  this.getRoleSize();

    if(role_num==this.role_num && !this.isStartGame)
    {
        this.isStartGame = true;
        this.startGame();
    }
}

Game.prototype.getRoleSize=function()
{
    var role_num = this.client.length;
    console.log("当前请求开始游戏人数:%s",role_num);
    return role_num
}

Game.prototype.getRoleById=function(roleId)
{
    return this._clientKey[roleId];
}

Game.prototype.startGame=function()
{
    console.log("startGame..");
    var type_list = [Role.TYPE.SW,Role.TYPE.LR,Role.TYPE.NW,Role.TYPE.YY,Role.TYPE.LR];
    var pm_num = 0;
    //插入平民到队列
    for(var i=(type_list.length<this.role_num)?(this.role_num-type_list.length):0;i<this.role_num;i++)
    {
        type_list.push(Role.TYPE.PM);
        pm_num++;
    }
    this.deadRoleTypelist[0] =pm_num;//平民数量
    this.deadRoleTypelist[1] = Role.GOD.length;//神的数量
    this.deadRoleTypelist[2] = 2;//狼人数量
    this.Rounds=0;
    //角色分配数据
    var index_num=1;
    var sendData =new Array();

    for(var key in this.client)
    {
        var role = this.client[key];
        var data=new Object();
        var index = parseInt(Math.random()*type_list.length);

        data.id = parseInt(index_num+1000);
        data.type = type_list[index];
        data.num = parseInt(index_num);
        type_list.splice(index,1);
        role.setData(data);
        sendData.push(role.getData());
        this._clientKey[data.id]=role;
        this.gameRoleId.push(role.id);
        index_num++;
    }

    this.client.forEach(function(role){
        var data = role.getData();
        data.roleList = sendData;
        server_msg.send(1002,data,role.getSocket());
    })


}
//判断客户都准备好了则开始天黑
Game.prototype.startNight = function()
{
    //判断所有客户端都准备好了
    for(var key in this.client)
    {
        var role = this.client[key];
        if(!role.isReady)
        {
            return false;
        }

    }

    //重置角色的状态
    this.client.forEach(function(role){
        role.resetState();
    });
    this.Rounds+=1;
    //开始播放守卫信息
    this.broadcast(1003,{});
}
//广播消息
Game.prototype.broadcast=function(cmd,data)
{
    this.client.forEach(function(role){
        server_msg.send(cmd,data,role.getSocket());
    });
}

Game.prototype.gameOver=function(value)
{
    this.broadcast(1014,{result:value});
    gameMain.cleanAll();
    gameMain.isStartGame=false;
}

//获取死亡列表
Game.prototype.getDeadRoles=function()
{
    var roles=[];


    var roles_type=new Object();
    this.client.forEach(function(role)
    {
        if(role.isDead)
        {
            roles.push(role.getData());
            //移除死亡角色
            var index = 0;
            for(var roleId in this.gameRoleId)
            {
                if(roleId==role.id)
                {
                    this.gameRoleId.splice(index,1)
                }
                index++;
            }
            this.gameRoleId.push(role.id);

            var type=role.getData().type
            if(type==Role.TYPE.PM)
            {
                this.deadRoleTypelist[0] -=1;
            }else if(Role.GOD.indexOf(type)>-1){
                this.deadRoleTypelist[1]-=1;
            }else if(type==Role.TYPE.LR){
                this.deadRoleTypelist[2]-=1;
            }
        }
    });

    this.roleDeadList=roles;

    return roles;
}
//投票选警长
Game.prototype.vote = function()
{
    if(!this.isChoosePoilceman)
    {
        this.broadcast(1011,{});
        this.isChoosePoilceman = true;
    }
}

//统计结果
Game.prototype.hasVote=function(roleID)
{
    this.hasVoteRole.push(roleID);
    if(this.hasVoteRole.length==this.gameRoleId.length)
    {

        var result_id = 0;
        var tmpVoteNum=0;
        for(var key in this.voteResult)
        {
            var role_vote_num = this.voteResult[key];
            if(role_vote_num>tmpVoteNum)
            {
                result_id=key;
            }
        }

        //清理投票结果
        this.cleanVote();
        return result_id;

    }
    return -1;
}

//---请求登录
server_msg.register(1001,function(data,ws){
    //游戏没有开始则加入角色到游戏队列
    if(!gameMain.isStart())
    {
        var role = new Role(ws)
        gameMain.pushRole(role);
    }

});
//－－－－点击准备
server_msg.register(1003,function(data,ws){
   var role= gameMain.getRoleById(data.id);
    role.isReady = true;

    gameMain.startNight();

})
//--接收到守卫的请求
server_msg.register(1004,function(data,ws){
    var role= gameMain.getRoleById(data.id);
    var round=this.prototypeRoleList[role.id]
    if(round && (round+1)==this.Rounds)
    {
        console.log("已经被守卫守过的人!!!!");
        return false;
    }

    role.protection=true;
    this.prototypeRoleList[role.id]=this.Rounds;
    //--广播守卫完成
    gameMain.broadcast(1004,{});
});
//--预言家验证角色
server_msg.register(1005,function(data,ws){
    var role= gameMain.getRoleById(data.id);
    server_msg.send(1005,role.getData(),ws);
});
//--预言家确认,广播下一步
server_msg.register(1006,function(data,ws){
    gameMain.broadcast(1006,{});
});
//--狼人开始杀人--
server_msg.register(1007,function(data,ws){
    var role= gameMain.getRoleById(data.id);
    if(!role.protection)
    {
        role.isDead = true;
    }
    //只要一个狼人点击后则开始进入下一个回合:TODO
    gameMain.broadcast(1007,{});
});
//--女巫环节
server_msg.register(1008,function(data,ws){
    var role = gameMain.getRoleById(data.id);
    //毒人判断
    if(data.type==1 && !role.isDead)
    {
        role.isDead = true;
    }
    //救人判断
    if(data.type==2 && role.isDead)
    {
        role.isDead = false;
    }

    //判断女巫使用解药和守卫守卫是否对同一个人
    if(data.type==2 && role.protection)
    {
        role.isDead=true;
    }

    //返回死亡列表,不为空则不需要留遗言
    var roles_dead=gameMain.getDeadRoles();
    if(roles_dead)
    {
        //广播被死亡角色列表
        gameMain.broadcast(1009,{roles:roles_dead});

        //判断角色类型抱团的是否都被杀死了,然后游戏结束了
        for(var key in this.deadRoleTypelist){
            var val = this.deadRoleTypelist[key];
            if(val<1){
                //根据类型返回游戏结果
                this.gameOver((key==2)?2:1);
                return false;
            }

        }
    }

     //执行其他命令 选警长 或投票
    this.vote();

});
//--遗言确认,所有死亡人确认后在接下来游戏
server_msg.register(1010,function(data,ws){
   var role_id = data.id;
    var index=0;

    for(var key in gameMain.roleDeadList)
    {
        var role = gameMain.roleDeadList[key];
        if(role.id==role_id)
        {
            gameMain.roleDeadList.splice(index,1);
            break;
        }
        index++;
    }

    if(gameMain.roleDeadList.length<1)
    {
        //--投票选警长还是投票杀人
        gameMain.vote();
    }

});
//投票选警长
server_msg.register(1012,function(data,ws){
    var roleVote = gameMain.voteResult[data.id];
    var vote_num=(roleVote==null)?0:roleVote+=1;
    gameMain.voteResult[data.id]=vote_num;

    var roleId = data.roleId;
    var result_roleId=gameMain.hasVote(roleId);
    if(result_roleId>-1)
    {
        this.broadcast(1012,{roleID:result_roleId});
    }
});

//投票杀人
server_msg.register(1013,function(data,ws){
    var roleVote = gameMain.voteResult[data.id];
    var vote_num=(roleVote==null)?0:roleVote+=1;
    //警长多0.5票
    var roleId = data.roleId;
    var role=this.getRoleById(roleId);
    if(role.sheriff)
    {
        vote_num+=0.5;
    }
    gameMain.voteResult[data.id]=vote_num;
   var result_id= gameMain.hasVote(roleId);
    if(result_id>-1)
    {
        this.broadcast(10013,{roleID:result_id});
    }



});
//移交警长
server_msg.register(1015,function(data,ws){
    var role=gameMain.getRoleById(data.id);
    role.sheriff=true;
});


wss.on('connection', function connection(ws) {
    console.log("Has Client conn");
    gameMain.getRoleSize();
    ws.on('message', function incoming(message) {
        try{
            console.log('received: %s', message);
            server_msg.decode(message,ws);
        }catch(e){
            console.log("runing error:%s", e.toString());
        }


    });

    ws.on('close',function close(){
        console.log("客户端离开");
        gameMain.closeRole(ws);
        gameMain.getRoleSize();
    });

});



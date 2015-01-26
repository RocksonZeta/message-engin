/**
@module Server
*/

'use strict';
var 
co  = require('co'),
amqpUtils = require('./amqpUtils');

function isGenerator(obj) {
  return obj && 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
ref:https://github.com/postwait/node-amqp

1.用户发送消息队列 message -> queue -> out , queue name : conf.messageQueue , default:messageQueue
2.接受消息队列 out -> queue -> message ; exchange name : conf.receiveExchange , default:receiveExchange --> receiveQueue
3.连接状态队列 status -> queue -> message ; exchange name : conf statusExchange , default: statusExchange
@constructor
*/
function MqManager(conf){
	this.conf = conf;
	this.messageCb = null;
	this.conf.receiveExchange = this.conf.receiveExchange || 'receiveExchange';
	this.conf.receiveQueue = this.conf.receiveQueue || 'receiveQueue';
	this.conf.statusExchange = this.conf.statusExchange || 'statusExchange';
	this.conf.statusQueue = this.conf.statusQueue || 'statusQueue';
	this.conf.messageQueue = this.conf.messageQueue || 'messageQueue';
	this.conf.messageExchange = this.conf.messageExchange || 'messageExchange';
}
MqManager.prototype.init = function*(){
	this.client = yield amqpUtils.createMqClient(this.conf);
	this.receiveExchange = yield amqpUtils.createExchange(this.client , this.conf.receiveExchange, {type:'direct'});
	this.statusExchange = yield amqpUtils.createExchange(this.client , this.conf.statusExchange ,{type:'direct'});
	var messageExchange = yield amqpUtils.createExchange(this.client , this.conf.messageExchange ,{type:'fanout'});
	this.messageQueue = yield amqpUtils.createQueue(this.client ,this.conf.messageQueue);
	yield amqpUtils.queueBind(this.messageQueue ,messageExchange, this.conf.messageQueue);
	// this.messageQueue.bind(this.conf.messageExchange, this.conf.messageQueue);
	var _this = this;
	this.messageQueue.subscribe(function (message, headers, deliveryInfo) {
		_this.fireMessage(message,headers);
	});
	console.log('init mq over')
};

MqManager.prototype.fireMessage = function(message,headers){
	if(this.messageCb){
		 this.messageCb(message,headers);
	}else{
		console.warn('no message callback ' , message);
	}
};



/**
	put message to the send queue
*/
MqManager.prototype.send = function(message, headers){
	this.receiveExchange.publish(this.conf.receiveQueue, message ,{contentType:'application/json' , headers:headers||{}});
};
/**
	put connection status change message to the send status queue
*/
MqManager.prototype.sendStatusMessage = function(message,headers){
	this.statusExchange.publish(this.conf.statusQueue, message ,{contentType:'application/json',headers:headers||{}});

};
/**
	receive a new message from message queue
*/
MqManager.prototype.onMessage = function(cb){
	this.messageCb = cb;
};

/**
ref: https://github.com/Worlize/WebSocket-Node
WebSocket manager
manager the connections
1.send message 

@constructor
@param {object} conf - WsMangaer config ref https://github.com/Worlize/WebSocket-Node/wiki/Documentation
@param {function} conf.keyFn - function*(request) , give key for the new connection;
@param {function} conf.messageKeyFn - function*(message) , give key from new message , the message is sended from client, 
*/
function WsManager(conf){
	if(!conf.keyFn){
		throw new Error('WsManager conf must have a keyFn.');
	}
	if(!conf.messageKeyFn){
		throw new Error('WsManager conf must have a messageKeyFn.');
	}
	this.conf = conf;
	this.conf.autoAcceptConnections = this.conf.autoAcceptConnections || false;
	this.server = new (require('websocket').server)(this.conf);
	this.connections = {};
	this.server.on('request' , this._onRequest.bind(this));
	this.onMessageCb = null;
	this.onConnectionStatusChangeCb = null;
	this.onSendFailedCb = null;
	this.connectionCount =0;
}

WsManager.prototype._onRequest = function(request){
	co(function*(){
		var key ;
		try{
			key = yield this.conf.keyFn(request,this);
			if(!key){
				return request.reject(404,'bad request');
			}
		}catch(e){
			return request.reject(e.status||404, e.reason);
		}
		if(this.connections[key] && -1 == this.connections[key].closeReasonCode){
			this.connections[key].old=true;
			this.connections[key].drop();
		//	this.onConnectionStatusChangeCb({status:0,key:key , reasonCode:1002,description:"OldConnection"},this.connections[key].request.httpRequest.headers);
		}
		var connection = request.accept(this.conf.protocol,this.conf.origin||request.origin );
		connection.request = request;
		this.connections[key] = connection;
		this.connectionCount +=1;
		connection.__key__ = key;
		if(this.onConnectionStatusChangeCb){
        	this.onConnectionStatusChangeCb({status:1,key:key},request.httpRequest.headers);
        }
		var _this = this;
		connection.on('message' , function(message){
			// _this.doBeforeAddToMq(message, this , function(e,message){
				// if(e){
				// 	return;
				// }
				if (message.type === 'utf8') {
					if(_this.onMessageCb){
						_this.onMessageCb(message.utf8Data,this.request.httpRequest.headers);
					}else{
						console.warn('new message not handled' , message);
					}
		        }
			// });
		});
		connection.on('close', function(reasonCode, description) {
			if(this.old) {
				return;
			}
	        if(_this.onConnectionStatusChangeCb){
	        	_this.onConnectionStatusChangeCb({status:0,key:this.__key__ , reasonCode:reasonCode,description:description},this.request.httpRequest.headers);
	        }
	        delete _this.connections[this.__key__];
	        // if(1000 != reasonCode){
	        // 	
	        // }
	        _this.connectionCount -=1;
	    });
	}).call(this);
};


WsManager.prototype.send = function(message,headers){
	var key = this.conf.messageKeyFn(message,headers);
	var connection = this.connections[key];
	if(connection){
		if('string' != typeof message){
			message = JSON.stringify(message);
		}
		try{
			connection.sendUTF(message);
		}catch(e){
			console.error("send message failed" , message);
			console.error(e);
			if(this.onSendFailedCb){
				this.onSendFailedCb(e,message,headers);
			}
		}
	}
};

WsManager.prototype.onSendFailed = function(cb){
	this.onSendFailedCb = cb;
};
WsManager.prototype.onMessage = function(cb){
	this.onMessageCb = cb;
};

WsManager.prototype.onConnectionStatusChange = function(cb){
	this.onConnectionStatusChangeCb = cb;
};

/**
wcConf -> for websocket
mqConf -> for rabbitmq
con    -> for Server
*/
exports.start = function*(mqConf,wsConf){
	var mqManager = new MqManager(mqConf);
	yield mqManager.init();
	var wsManager = new WsManager(wsConf);
	//queue -> message -> ws
	mqManager.onMessage(function(message,headers){
		wsManager.send(message,headers);
	});
	wsManager.onMessage(function(message,headers){
		mqManager.send(message,headers);
	});
	wsManager.onConnectionStatusChange(function(message,headers){
		mqManager.sendStatusMessage(message,headers);
	});
	// return new Server(mqManager , wsManager, conf);
};


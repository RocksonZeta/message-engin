/**
@module Server
*/

'use strict';
var 
co  = require('co'),
amqpUtils = require('./amqpUtils'),
debug = require('debug')('message-server:Server')
;

// require('co-punch')('amqp');




// function exchangePublish(exchange ,routingKey, message, options){
// 	return function(done){
// 		exchange.publish(routingKey, message, options , function(b){
// 			done(null , b);
// 		});
// 	};
// }

/**
ref:https://github.com/postwait/node-amqp

1.用户发送消息队列 message -> queue -> out , queue name : conf.messageQueue , default:messageQueue
2.接受消息队列 out -> queue -> message ; exchange name : conf.receiveExchange , default:receiveExchange --> receiveQueue
3.连接状态队列 status -> queue -> message ; exchange name : conf statusExchange , default: statusExchange
@constructor
*/
function MqManager(conf){
	debug('new MqManager');
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
	debug('init MqManager');
	this.client = yield amqpUtils.createMqClient(this.conf);
	this.receiveExchange = yield amqpUtils.createExchange(this.client , this.conf.receiveExchange, {type:'direct'});
	this.statusExchange = yield amqpUtils.createExchange(this.client , this.conf.statusExchange ,{type:'direct'});
	var messageExchange = yield amqpUtils.createExchange(this.client , this.conf.messageExchange ,{type:'fanout'});
	this.messageQueue = yield amqpUtils.createQueue(this.client ,this.conf.messageQueue);
	yield amqpUtils.queueBind(this.messageQueue ,messageExchange, this.conf.messageQueue);
	// this.messageQueue.bind(this.conf.messageExchange, this.conf.messageQueue);
	var _this = this;
	this.messageQueue.subscribe(function (message, headers, deliveryInfo) {
		debug('Got a message with routing key ' + deliveryInfo.routingKey);
		_this.fireMessage(message);
	});
};

MqManager.prototype.fireMessage = function(message){
	debug('MqManager fireMessage');
	if(this.messageCb){
		 this.messageCb(message);
	}else{
		console.warn('no message callback ' , message);
	}
};



/**
	put message to the send queue
*/
MqManager.prototype.send = function(message){
	debug('MqManager send message');
	this.receiveExchange.publish(this.conf.receiveQueue, message ,{contentType:'application/json'});
};
/**
	put connection status change message to the send status queue
*/
MqManager.prototype.sendStatusMessage = function(message){
	debug('MqManager send StatusMessage');
	this.statusExchange.publish(this.conf.statusQueue, message ,{contentType:'application/json'});

};
/**
	receive a new message from message queue
*/
MqManager.prototype.onMessage = function(cb){
	debug('MqManager onMessage');
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
	debug('new WsManager');
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
	debug("a new connection request,origin:%s,protocol:%s" , request.origin, request.protocol);
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
		if(this.connections[key]){
			this.connections[key].close();
		}
		debug('connection key:%s' , key);
		var connection = request.accept(this.conf.protocol,this.conf.origin||request.origin );
		// var connection = request.accept();
		debug("accept ws connection");
		this.connections[key] = connection;
		this.connectionCount +=1;
		connection.__key__ = key;
		if(this.onConnectionStatusChangeCb){
        	this.onConnectionStatusChangeCb({status:1,key:key});
        }
		var _this = this;
		connection.on('message' , function(message){
			debug('a new message received');
			if (message.type === 'utf8') {
				if(_this.onMessageCb){
					_this.onMessageCb(message.utf8Data);
				}else{
					console.warn('new message not handled' , message);
				}
	        }
		});
		connection.on('close', function(reasonCode, description) {
	        debug('connection '+this.__key__+' disconnected ,reasonCode:%s , description:%s', reasonCode , description);
	        if(_this.onConnectionStatusChangeCb){
	        	_this.onConnectionStatusChangeCb({status:0,key:connection.__key__ , reasonCode:reasonCode,description:description});
	        }
	        if(1000 != reasonCode){
	        	delete _this.connections[this.__key__];
	        }
	        this.connectionCount -=1;
	    });
	}).call(this);
};

WsManager.prototype.send = function(message){
	debug('WsManager send a message');
	var key = this.conf.messageKeyFn(message);
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
				this.onSendFailedCb(e,message);
			}
		}
	}
};

WsManager.prototype.onSendFailed = function(cb){
	debug('WsManager onSendFailed');
	this.onSendFailedCb = cb;
};
WsManager.prototype.onMessage = function(cb){
	debug('WsManager onMessage');
	this.onMessageCb = cb;
};

WsManager.prototype.onConnectionStatusChange = function(cb){
	debug('WsManager onConnectionStatusChange');
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
	mqManager.onMessage(function(message){
		wsManager.send(message);
	});
	wsManager.onMessage(function(message){
		mqManager.send(message);
	});
	wsManager.onConnectionStatusChange(function(message){
		mqManager.sendStatusMessage(message);
	});
	// return new Server(mqManager , wsManager, conf);
};


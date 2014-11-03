/**

@module Client
*/
'use strict';
var 
util = require('util'),
events = require('events'),
amqpUtils = require('./amqpUtils');

/**

@constructor
*/
function Client(conf){
	events.EventEmitter.call(this);
	this.conf = conf;
	this.conf.receiveExchange = this.conf.receiveExchange || 'receiveExchange';
	this.conf.receiveQueue = this.conf.receiveQueue || 'receiveQueue';
	this.conf.statusExchange = this.conf.statusExchange || 'statusExchange';
	this.conf.statusQueue = this.conf.statusQueue || 'statusQueue';
	this.conf.messageQueue = this.conf.messageQueue || 'messageQueue';
	this.conf.messageExchange = this.conf.messageExchange || 'messageExchange';
}
util.inherits(Client, events.EventEmitter);
module.exports = Client;

Client.prototype.init = function*(){
	this.client = yield amqpUtils.createMqClient(this.conf);
	this.messageExchange = yield amqpUtils.createExchange(this.client , this.conf.messageExchange ,{type:'fanout'});
	this.receiveExchange = yield amqpUtils.createExchange(this.client , this.conf.receiveExchange ,{type:'direct'});
	this.receiveQueue = yield amqpUtils.createQueue(this.client ,this.conf.receiveQueue);
	yield amqpUtils.queueBind(this.receiveQueue ,this.conf.receiveExchange, this.conf.receiveQueue);
	this.statusExchange = yield amqpUtils.createExchange(this.client , this.conf.statusExchange ,{type:'direct'});
	this.statusQueue = yield amqpUtils.createQueue(this.client ,this.conf.statusQueue);
	yield amqpUtils.queueBind(this.statusQueue ,this.statusExchange, this.conf.statusQueue);
	var _this = this;
	this.receiveQueue.subscribe(function (message, headers, deliveryInfo) {
		_this.emit('message',message,headers);
	});
	/**
	message: {
	status int - 1:new connection accepted , 0:connection disconnected
	key string - the key of the connection create by keyFn or messageKeyFn
	}
	*/
	this.statusQueue.subscribe(function (message, headers, deliveryInfo) {
		_this.emit('status',message,headers);
	});
};

/**
send message
@param {object} message  - 
@params {optional} opt  - eg.{headers:{appId:"1"}}ref:https://github.com/postwait/node-amqp#exchangepublishroutingkey-message-options-callback
we can you use opt.headers to be routing key;
*/
Client.prototype.send = function(message,opt){
	this.messageExchange.publish(this.conf.receiveQueue, message ,{headers:opt});
};

Client.prototype.$send = function(message,opt){
	opt = opt;
	return function(done){
		this.messageExchange.publish(this.conf.receiveQueue, message ,{headers:opt} , function(b){
			done(null ,b);
		});
	};
};
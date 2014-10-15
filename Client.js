/**

@module Client
*/
'use strict';
var 
util = require('util'),
events = require('events'),
debug = require('debug')('message-server:Client'),
amqpUtils = require('./amqpUtils')
;

/**

@constructor
*/
function Client(conf){
	debug('new Client');
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
	debug('init client');
	debug('create mq client host:%s' , this.conf.host);
	this.client = yield amqpUtils.createMqClient(this.conf);
	debug('create message exchange:%s' , this.conf.messageExchange);
	//exchange for sending messages
	this.messageExchange = yield amqpUtils.createExchange(this.client , this.conf.messageExchange ,{type:'fanout'});
	this.receiveExchange = yield amqpUtils.createExchange(this.client , this.conf.receiveExchange ,{type:'direct'});
	this.receiveQueue = yield amqpUtils.createQueue(this.client ,this.conf.receiveQueue);
	yield amqpUtils.queueBind(this.receiveQueue ,this.conf.receiveExchange, this.conf.receiveQueue);
	this.statusExchange = yield amqpUtils.createExchange(this.client , this.conf.statusExchange ,{type:'direct'});
	this.statusQueue = yield amqpUtils.createQueue(this.client ,this.conf.statusQueue);
	yield amqpUtils.queueBind(this.statusQueue ,this.statusExchange, this.conf.statusQueue);
	var _this = this;
	this.receiveQueue.subscribe(function (message, headers, deliveryInfo) {
		debug('Got a message from receiveQueue with routing key ' + deliveryInfo.routingKey);
		// var msg ;
		// try{
		// 	msg = JSON.parse(message);
		// }catch(e){
		// 	console.error('parse message error' , message);
		// }
		_this.emit('message',message);
	});
	/**
	message: {
	status int - 1:new connection accepted , 0:connection disconnected
	key string - the key of the connection create by keyFn or messageKeyFn
	}
	*/
	this.statusQueue.subscribe(function (message, headers, deliveryInfo) {
		debug('Got a message from statusQueue with routing key ' + deliveryInfo.routingKey);
		// var msg ;
		// try{
		// 	msg = JSON.parse(message);
		// }catch(e){
		// 	console.error('parse message error' , message);
		// }
		_this.emit('status',message);
	});
};

/**
send message
@param {object} message  - 
@params {optional} opt  - ref:https://github.com/postwait/node-amqp#exchangepublishroutingkey-message-options-callback
*/
Client.prototype.send = function(message,opt){
	debug('send message');
	this.messageExchange.publish(this.conf.receiveQueue, message ,opt);
};

Client.prototype.$send = function(message,opt){
	debug('$send message');
	opt = opt;
	return function(done){
		this.messageExchange.publish(this.conf.receiveQueue, message ,opt , function(b){
			done(null ,b);
		});
	};
};
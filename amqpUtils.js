'use strict';

//AMPQ help functions
exports.createMqClient=function(conf){
	return function(done){
		var client = require('amqp').createConnection(conf);
		client.on('ready', function() {
			done(null , client);
		});
		client.on('error', function(e) {
		    done(e);
		});
	};
};
exports.createExchange=function(client , name ,opt){
	return function(done){
		client.exchange(name ,opt , function(ex){
			done(null , ex);
		});
	};
};
exports.createQueue=function(client , name){
	return function(done){
		client.queue(name, function(queue){
			done(null , queue);
		});
	};
};
exports.queueBind=function(queue,exchange ,routing){
	return function(done){
		queue.bind(exchange,routing, function(){
			done();
		});
	};
};
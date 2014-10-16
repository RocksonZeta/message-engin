'use strict';

var 
co = require('co');

var Client  = require('../').Client;


co(function*(){
	var conf = {host: '192.168.13.184'};
	var client = new Client(conf);
	yield client.init();
	client.on('message' , function(message){
		console.log(message);
		//echo client
		client.send(message);
	});
	client.on('status' , function(message){
		console.log('status change',message);
	});
})();

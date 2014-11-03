'use strict';
var co = require('co');
var Client  = require('../').Client;
co(function*(){
	var conf = {host: '192.168.13.184'};
	var client = new Client(conf);
	yield client.init();
	client.on('message' , function(message,headers){
		console.log(message,headers);
		//echo client
		client.send(message,headers);
	});
	client.on('status' , function(message,headers){
		console.log('status change',message,headers);
	});
})();

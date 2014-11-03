'use strict';
var co = require('co'),
http = require('http');

var server  = require('../').server;

function genKey(obj){
	console.log(obj);
	return obj.dn+":"+obj.appid;
}

/**
give the key to the connection
*/
function* keyFn(request){
	//request.cookies  // you can get cookie
	var httpRequest = request.httpRequest;
	console.log("key:",genKey(httpRequest.headers),httpRequest.headers);
	return genKey(httpRequest.headers);
}

/*
calc the connetion key from the message
*/
function messageKeyFn(message , headers){
	console.log('message key' , message,headers);
	return genKey(headers);
}

function createHttpServer(){
	var httpServer = http.createServer(function(request, response) {
	    console.log((new Date()) + ' Received request for ' + request.url);
	    response.writeHead(404);
	    response.end();
	});
	httpServer.listen(8080, function() {
	    console.log('Server is listening on port 8080');
	});
	return httpServer;
}
co(function*(){
	//message queue config
	var mqConf = {host: '192.168.13.184'};
	//websocket config
	var wsConf ={httpServer:createHttpServer() , keyFn:keyFn,messageKeyFn:messageKeyFn,keepaliveInterval:60000 };
	yield server.start(mqConf , wsConf);
})();
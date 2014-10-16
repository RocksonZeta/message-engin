'use strict';
var co = require('co'),
http = require('http');

var server  = require('../').server;

function genKey(obj){
	return obj.dn+":"+obj.appid;
}

function* keyFn(request ){
	var httpRequest = request.httpRequest;
	console.log("key:",genKey(httpRequest.headers),httpRequest.headers);
	return genKey(httpRequest.headers);
}


function messageKeyFn(message){
	console.log('message key' , message);
	return genKey(message);
}


co(function*(){

	var mqConf = {host: '192.168.13.184'};

	var httpServer = http.createServer(function(request, response) {
	    console.log((new Date()) + ' Received request for ' + request.url);
	    response.writeHead(404);
	    response.end();
	});
	httpServer.listen(8080, function() {
	    console.log((new Date()) + ' Server is listening on port 8080');
	});
	var wsConf ={httpServer:httpServer , keyFn:keyFn,messageKeyFn:messageKeyFn };
	yield server.start(mqConf , wsConf);

})();
message-engin
=============

message engin!

##installation
```
$ npm install message-engin --save
```

##Design
<pre>
client1						server1 
client2 -> messageQueue -> 	server2 ->LVS ---> websocket client
client3						server3
</pre>

We can define our own message protocol.

##Basic useage:

###server
```js
'use strict';
var co = require('co'),
http = require('http');

var server  = require('message-engin').server;

function genKey(obj){
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
	var mqConf = {host: 'localhost'};
	//websocket config
	var wsConf ={httpServer:createHttpServer() , keyFn:keyFn,messageKeyFn:messageKeyFn };
	yield server.start(mqConf , wsConf);
})();
```
###client
```js
'use strict';
var co = require('co');
var Client  = require('message-engin').Client;
co(function*(){
	var conf = {host: 'localhost'};
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

```
### ws client
```js
'use strict';
var WebSocketClient = require('websocket').client;
var client = new WebSocketClient();
client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});
client.on('connect', function(connection) {
    console.log('WebSocket client connected');
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('Connection Closed');
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            var msg = JSON.parse(message.utf8Data);
            console.log("Received: " + msg.content,"+"+(Date.now()-msg.ct+'ms'));
        }
    });
    function sendMessage() {
        if (connection.connected) {
            var number = Math.round(Math.random() * 0xFFFFFF);
            connection.sendUTF(JSON.stringify({dn:'dn1' , appid:"appid1", ct:Date.now() ,content:number.toString()}));
            setTimeout(sendMessage, 1000);
        }
    }
    sendMessage();
});
client.connect('ws://localhost:8080' , null , null , {dn:"dn1",appId:"appid1"});
```

##API

Server
======
var server  = require('message-engin').server;

Methods
-------
### function* start(mqConf , wsConf)
 we must `yield server.start(mqConf , wsConf)` to start server.`mqConf` ref:[node-amqp](https://github.com/postwait/node-amqp). 
 ####wsConf propperties
 `wsConf` ref:[WebSocket-Node](https://github.com/Worlize/WebSocket-Node). `wsConf` has two extra items:
 - **function* keyFn(request)** -  `function `, `keyFn` give the connection key to identify a connection. `request.httpRequest` is the http request at websocket handshake.so we can use `request.httpRequest.headers` to get http headers.
 - **messageKeyFn(message,headers)**  - give the connection key from message to determine which connection we will send the message. the `headers` is come from `client.send(message,headers)`.

Client
======

Constructor
-----------

###Client(mqConf)
`var Client  = require('message-engin').Client`
Create a message engin client. `mqConf` ref:[node-amqp](https://github.com/postwait/node-amqp)

Methods
-------
### function* init()
We must `yield client.init()` to init client;

Messages
--------
### message
we get a new message , `client.on('message' , function(message,headers){})`. the `header` is come from a websocket http request at handsake.
###status
connnection status change,such as a new connection established or a connection disconneted.
`client.on('message' , function(message,headers){})`.the `header` is come from a websocket http request at handsake.When server accept a new connection ,we will receive `{status:1,key:"connection key"}`.when connection disconnect ,we will receive `{status:0 , key:"connection key"}`




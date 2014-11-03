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
            connection.sendUTF(JSON.stringify({ct:Date.now() ,content:number.toString()}));
            setTimeout(sendMessage, 1000);
        }
    }
    sendMessage();
});
client.connect('ws://localhost:8080' , null , null , {Dn:"dn1",appId:"appid1"});
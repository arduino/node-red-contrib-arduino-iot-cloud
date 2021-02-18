/*
* Copyright 2019 ARDUINO SA (http://www.arduino.cc/)
* This file is part of node-red-contrib-arduino-iot-cloud.
* Copyright (c) 2019
*
* This software is released under:
* The GNU General Public License, which covers the main part of
* node-red-contrib-arduino-iot-cloud
* The terms of this license can be found at:
* https://www.gnu.org/licenses/gpl-3.0.en.html
*
* You can be released from the requirements of the above licenses by purchasing
* a commercial license. Buying such a license is mandatory if you want to modify or
* otherwise use the software for commercial activities involving the Arduino
* software without disclosing the source code of your own applications. To purchase
* a commercial license, send an email to license@arduino.cc.
*
*/

const superagent = require('superagent');
const ArduinoClientHttp = require('./arduino-iot-cloud-api-wrapper');
const ArduinoClientMqtt = require('../arduino-iot-client-mqtt/arduino-iot-client-mqtt');
const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://api2.arduino.cc/iot/v1/clients/token';
const accessTokenAudience = process.env.NODE_RED_ACCESS_TOKEN_AUDIENCE || 'https://api2.arduino.cc/iot';
const arduinoIotCloudHost = process.env.NODE_RED_MQTT_HOST || 'wss.iot.arduino.cc';
const Mutex = require('async-mutex').Mutex;
/** Connections elem struct
 * {
 *  clientId: clientId,
 *  connectionConfig: connectionConfig,
 *  token: token,
 *  expires_token_ts: ts,
 *  clientMqtt: clientMqttobj,
 *  clientHttp: clientHttpobj,
 *  timeoutUpdateToken: timeout
 * }
 */
var connections = [];
const getClientMutex = new Mutex();
var numRetry=0;


async function getToken(connectionConfig) {
  const dataToSend = {
      grant_type: 'client_credentials',
      client_id: connectionConfig.credentials.clientid,
      client_secret: connectionConfig.credentials.clientsecret,
      audience: accessTokenAudience
  };

  try {

    var res = await superagent
              .post(accessTokenUri)
              .set('content-type', 'application/x-www-form-urlencoded')
              .set('accept', 'json')
              .send(dataToSend);
    var token = res.body.access_token;
    var expires_in = res.body.expires_in * 0.8; // needed to change the token before it expires
    if (token !== undefined) {
      return { token: token, expires_in: expires_in };
    }
  } catch (err) {
    if(err.response && err.response.res && err.response.request){
      console.log('statusCode: '+ err.response.res.statusCode +'\r'+
      'statusMessage: ' + err.response.res.statusMessage + '\r' +
      'text: ' + err.response.res.text + '\r'+
      'HTTP method: ' + err.response.request.method + '\r' +
      'URL request: ' + err.response.request.url
      );
    }else{
      console.log(err);
    }

  }
}

function getMqttOptions(clientId,token,RED){
  return {
    host: arduinoIotCloudHost,
    token: token,
    onDisconnect: async () => {
      console.log(`connection lost for ${clientId}`);
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.connection-error" });
        }
      });

      await reconnectMqtt(clientId);

    },
    onOffline: async () => {
      console.log(`connection lost for ${clientId}`);
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.offline" });
        }
      });
    },
    onConnected: () =>{
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({});
        }
      });
    },
    useCloudProtocolV2: true
  };
}

async function getClientMqtt(connectionConfig, RED) {

  if (!connectionConfig || !connectionConfig.credentials) {
    throw new Error("Cannot find cooonection config or credentials.");
  }
  const releaseMutex = await getClientMutex.acquire();
  try {
    let user = findUser(connectionConfig.credentials.clientid);
    let clientMqtt;
    if (user === -1) {
      clientMqtt = new ArduinoClientMqtt.ArduinoClientMqtt();
      const tokenInfo = await getToken(connectionConfig);
      if (tokenInfo !== undefined) {
        const ArduinoIotCloudOptions = getMqttOptions(connectionConfig.credentials.clientid,tokenInfo.token,RED)
        const timeout = setTimeout(() => { updateToken(connectionConfig) }, tokenInfo.expires_in * 1000);
        connections.push({
          clientId: connectionConfig.credentials.clientid,
          connectionConfig: connectionConfig,
          token: tokenInfo.token,
          expires_token_ts: tokenInfo.expires_in,
          clientMqtt: clientMqtt,
          clientHttp: null,
          timeoutUpdateToken: timeout
        });
        await clientMqtt.connect(ArduinoIotCloudOptions);
      } else {
        clientMqtt = undefined;
      }
    } else {
      if (connections[user].clientMqtt !== null) {
        clientMqtt = connections[user].clientMqtt;
      } else {
        clientMqtt = new ArduinoClientMqtt.ArduinoClientMqtt();
        const ArduinoIotCloudOptions = getMqttOptions(connectionConfig.credentials.clientid,connections[user].token,RED)
        connections[user].clientMqtt = clientMqtt;
        await clientMqtt.connect(ArduinoIotCloudOptions);

      }
    }
    releaseMutex();

    return clientMqtt;
  } catch (err) {
    console.log(err);
    releaseMutex();
  }

}

async function getClientHttp(connectionConfig) {

  if (!connectionConfig || !connectionConfig.credentials) {
    throw new Error("Cannot find cooonection config or credentials.");
  }
  const releaseMutex = await getClientMutex.acquire();
  try {
    var user = findUser(connectionConfig.credentials.clientid);
    var clientHttp;
    if (user === -1) {

      var tokenInfo = await getToken(connectionConfig);
      if (tokenInfo !== undefined) {
        clientHttp = new ArduinoClientHttp.ArduinoClientHttp(tokenInfo.token);

        var timeout = setTimeout(() => { updateToken(connectionConfig) }, tokenInfo.expires_in * 1000);
        connections.push({
          clientId: connectionConfig.credentials.clientid,
          connectionConfig: connectionConfig,
          token: tokenInfo.token,
          expires_token_ts: tokenInfo.expires_in,
          clientMqtt: null,
          clientHttp: clientHttp,
          timeoutUpdateToken: timeout
        });

      }

    } else {
      if (connections[user].clientHttp !== null) {
        clientHttp = connections[user].clientHttp;
      } else {
        clientHttp = new ArduinoClientHttp.ArduinoClientHttp(connections[user].token);

        connections[user].clientHttp = clientHttp;
      }
    }

    releaseMutex();
    return clientHttp;
  } catch (err) {
    if(err.response && err.response.res && err.response.request){
      console.log('statusCode: '+ err.response.res.statusCode +'\r'+
      'statusMessage: ' + err.response.res.statusMessage + '\r' +
      'text: ' + err.response.res.text + '\r'+
      'HTTP method: ' + err.response.request.method + '\r' +
      'URL request: ' + err.response.request.url
      );
    }else{
      console.log(err);
    }

    releaseMutex();

  }

}

function findUser(clientId) {
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].clientId === clientId) {
      return i;
    }
  }
  return -1;

}

async function updateToken(connectionConfig) {
  try {
    var user = findUser(connectionConfig.credentials.clientid);
    if (user !== -1) {
      var tokenInfo = await getToken(connectionConfig);
      if (tokenInfo !== undefined) {
        numRetry=0;
        connections[user].token = tokenInfo.token;
        connections[user].expires_token_ts = tokenInfo.expires_in;
        if(connections[user].clientMqtt){
          connections[user].clientMqtt.updateToken(tokenInfo.token);
        }
        if(connections[user].clientHttp){
          connections[user].clientHttp.updateToken(tokenInfo.token);
        }
        connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, tokenInfo.expires_in * 1000);
      } else {
        /*Avoid too many requests addressed to server*/
        if(numRetry < 3){
          connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, 5000);
        }
        else{
          connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, 60000);
        }

        numRetry++;
      }
    }
  } catch (err) {
    console.log(err);
  }
}

async function deleteClientMqtt(clientId, thing, propertyName, nodeId) {
  const releaseMutex = await getClientMutex.acquire();
  var user = findUser(clientId);
  if (user !== -1) {
    if (connections[user].clientMqtt !== null) {
      var ret = await connections[user].clientMqtt.removePropertyValueCallback(thing, propertyName,nodeId);

      if (ret === 0) {
        await connections[user].clientMqtt.disconnect();
        delete connections[user].clientMqtt;
        connections[user].clientMqtt = null;
        if (connections[user].clientHttp === null) {
          if (connections[user].timeoutUpdateToken)
            clearTimeout(connections[user].timeoutUpdateToken);
          connections.splice(user, 1);
        }
      }
    }
  }
  releaseMutex();
}

async function deleteClientHttp(clientId) {
  const releaseMutex = await getClientMutex.acquire();
  var user = findUser(clientId);
  if (user !== -1) {
    if (connections[user].clientHttp !== null) {
      connections[user].clientHttp.openConnections--;
      if (connections[user].clientHttp.openConnections === 0) {
        connections[user].clientHttp = null;
      }
    }
    if (connections[user].clientMqtt === null) {
      if (connections[user].timeoutUpdateToken)
        clearTimeout(connections[user].timeoutUpdateToken);
      connections.splice(user, 1);
    }
  }
  releaseMutex();
}

async function reconnectMqtt(clientId) {
  var user = findUser(clientId);
  if (user !== -1) {
    if(connections[user].clientMqtt){
      await connections[user].clientMqtt.reconnect();
    }
  }
}

exports.getClientMqtt = getClientMqtt;
exports.getClientHttp = getClientHttp;
exports.deleteClientMqtt = deleteClientMqtt;
exports.deleteClientHttp = deleteClientHttp;

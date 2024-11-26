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

const mqttMutex = new Mutex();
/** mqttConnections elem struct
 * {
 *  clientId: clientId,
 *  connectionConfig: connectionConfig,
 *  clientMqtt: clientMqttobj,
 * }
 */
var mqttConnections = [];
const httpMutex = new Mutex();
/** httpConnections elem struct
 * {
 *  clientId: clientId,
 *  connectionConfig: connectionConfig,
 *  clientHttp: clientHttpobj,
 * }
 */
var httpConnections = [];

function getMqttOptions(clientId, token, RED){
   async function reconnect() {
    const releaseMutex = await mqttMutex.acquire();
    let id = findUser(mqttConnections, clientId);
    if (id !== -1) {
      let token = await getToken(mqttConnections[id].connectionConfig);
      await mqttConnections[id].clientMqtt.updateToken(token);
    }
    releaseMutex();
  }

  return {
    host: arduinoIotCloudHost,
    token: token,
    onDisconnect: async () => {
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.connection-error" });
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await reconnect();
    },
    onOffline: async () => {
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.offline" });
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await reconnect();
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
    throw new Error("Cannot find connection config or credentials.");
  }
  const releaseMutex = await mqttMutex.acquire();
  try {
    let clientMqtt;
    let id = findUser(mqttConnections, connectionConfig.credentials.clientid);
    if (id === -1) {
      let token = await getToken(connectionConfig);
      clientMqtt = new ArduinoClientMqtt.ArduinoClientMqtt();
      mqttConnections.push({
        clientId: connectionConfig.credentials.clientid,
        connectionConfig: connectionConfig,
        clientMqtt: clientMqtt,
      });
      await clientMqtt.connect(
        getMqttOptions(connectionConfig.credentials.clientid, token, RED),
      ); 
    } else {
      clientMqtt = mqttConnections[id].clientMqtt;
    }
    releaseMutex();

    return clientMqtt;
  } catch (err) {
    console.log(err);
    releaseMutex();
  }
}

async function getClientHttp(connectionConfig, organizationID) {
  if (!connectionConfig || !connectionConfig.credentials) {
    throw new Error("Cannot find cooonection config or credentials.");
  }
  const releaseMutex = await httpMutex.acquire();
  try {
    var id = findUser(httpConnections, connectionConfig.credentials.clientid);
    var clientHttp;
    if (id === -1) {
      clientHttp = new ArduinoClientHttp.ArduinoClientHttp(async () => await getToken(connectionConfig, organizationID));
      httpConnections.push({
        clientId: connectionConfig.credentials.clientid,
        connectionConfig: connectionConfig,
        clientHttp: clientHttp,
      });
    } else {
      clientHttp = httpConnections[id].clientHttp;
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

async function deleteClientMqtt(clientId, thing, propertyName, nodeId) {
  const releaseMutex = await mqttMutex.acquire();
  var id = findUser(mqttConnections, clientId);
  if (id !== -1) {
    var ret = await mqttConnections[id].clientMqtt.removePropertyValueCallback(thing, propertyName, nodeId);
    if (ret === 0) {
      await mqttConnections[id].clientMqtt.disconnect();
      delete mqttConnections[id].clientMqtt;
      mqttConnections[id].clientMqtt = null;
      mqttConnections.splice(id, 1);
    }
  }
  releaseMutex();
}

async function deleteClientHttp(clientId) {
  const releaseMutex = await httpMutex.acquire();
  var id = findUser(httpConnections, clientId);
  if (id !== -1) {
    if (httpConnections[id].clientHttp !== null) {
      httpConnections[id].clientHttp.openConnections--;
      if (httpConnections[id].clientHttp.openConnections === 0) {
        httpConnections.splice(id, 1);
      }
    }
  }
  releaseMutex();
}

function findUser(connections, clientId) {
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].clientId === clientId) {
      return i;
    }
  }
  return -1;
}

async function getToken(connectionConfig, organizationID) {
  let delay = 200;
  while (true) {
    let token = await _get();
    if (token) {
      return token.token;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 5000);
  }

  async function _get() {
    const dataToSend = {
        grant_type: 'client_credentials',
        client_id: connectionConfig.credentials.clientid,
        client_secret: connectionConfig.credentials.clientsecret,
        audience: accessTokenAudience
    };

    try {
      var req = superagent
      .post(accessTokenUri)
      .set('content-type', 'application/x-www-form-urlencoded')
      .set('accept', 'json')

      if (organizationID) {
        req.set('X-Organization', organizationID)
      }

      var res = await req.send(dataToSend);
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
}
exports.getClientMqtt = getClientMqtt;
exports.getClientHttp = getClientHttp;
exports.deleteClientMqtt = deleteClientMqtt;
exports.deleteClientHttp = deleteClientHttp;

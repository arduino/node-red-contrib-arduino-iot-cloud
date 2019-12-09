const request = require("async-request");
const ArduinoClientHttp = require('./arduino-cloud-api-wrapper');
const ArduinoClientMqtt = require('../arduino-iot-client-mqtt/arduino-iot-client-mqtt');
const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://login.arduino.cc/oauth/token';
const accessTokenAudience = process.env.NODE_RED_ACCESS_TOKEN_AUDIENCE || 'https://api2.arduino.cc/iot';
const arduinoCloudHost = process.env.NODE_RED_MQTT_HOST || 'wss.iot.arduino.cc';
const Mutex = require('async-mutex').Mutex;
/**
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



async function getToken(connectionConfig) {
  var options = {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: {
      grant_type: 'client_credentials',
      client_id: connectionConfig.credentials.clientid,
      client_secret: connectionConfig.credentials.clientsecret,
      audience: accessTokenAudience
    }
  };

  try {

    var rawdata;
    var data;
    var expires_in;
    rawdata = await request(accessTokenUri, options);
    data = JSON.parse(rawdata.body);
    var token = data.access_token;
    expires_in = data.expires_in;
    if (token !== undefined) {
      return { token: token, expires_in: expires_in };
    }
  } catch (err) {
    console.log(err);
  }
}

function getMqttOptions(clientId,token,RED){
  return {
    host: arduinoCloudHost,
    token: token,
    onDisconnect: async () => {
      console.log(`connection lost for ${clientId}`);
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({ fill: "red", shape: "dot", text: "Connection Error" });
        }
      });

      await reconnectMqtt(clientId);

    },
    onOffline: async () => {
      console.log(`connection lost for ${clientId}`);
      RED.nodes.eachNode((n)=>{
        if(n.type === "property in"){
          const node = RED.nodes.getNode(n.id);
          node.status({ fill: "red", shape: "dot", text: "Offline" });
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
        const ArduinoCloudOptions = getMqttOptions(connectionConfig.credentials.clientid,tokenInfo.token,RED)
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
        await clientMqtt.connect(ArduinoCloudOptions);
      } else {
        clientMqtt = undefined;
      }
    } else {
      if (connections[user].clientMqtt !== null) {
        clientMqtt = connections[user].clientMqtt;
      } else {
        clientMqtt = new ArduinoClientMqtt.ArduinoClientMqtt();
        const ArduinoCloudOptions = getMqttOptions(connectionConfig.credentials.clientid,connections[user].token,RED)
        connections[user].clientMqtt = clientMqtt;
        await clientMqtt.connect(ArduinoCloudOptions);

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
    console.log(err);
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
        connections[user].token = tokenInfo.token;
        connections[user].expires_token_ts = tokenInfo.expires_in;
        connections[user].clientMqtt.updateToken(tokenInfo.token);
        connections[user].clientHttp.updateToken(tokenInfo.token);
        connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, tokenInfo.expires_in * 1000);
      } else {
        connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, 1000);
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
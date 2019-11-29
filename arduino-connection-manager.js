const request = require("async-request");
const arduinClientHttp = require('./arduino-cloud-api');
const ArduinoClientMqtt = require ('./arduino-iot-client-mqtt');
//import { mqttClient } from './arduino-connection-manager_old';
const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://login.arduino.cc/oauth/token';
const accessTokenAudience = process.env.NODE_RED_ACCESS_TOKEN_AUDIENCE || 'https://api2.arduino.cc/iot';

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
var connections=[];

async function getToken(connectionConfig){
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
      return {token: token, expires_in: expires_in };
    }
  } catch (err) {
    console.log(err);
  }
}

async function getClientMqtt(connectionConfig){
  if (!connectionConfig || !connectionConfig.credentials) {
    throw new Error("Cannot find cooonection config or credentials.");
  }
  try{
  var user = findUser(clientId);
  var clientMqtt;
  if(user === -1){

    clientMqtt = new ArduinoClientMqtt();
    var tokenInfo = await getToken(connectionConfig);
    if(tokenInfo !==undefined){
      const ArduinoCloudOptions = {
        host: "wss.iot.oniudra.cc",
        token: tokenInfo.token,
        apiUrl: "https://auth-dev.arduino.cc",
        onDisconnect: () => {
          disconnected(clientId);
          console.log(`connection lost for ${clientId}`);
        },
        useCloudProtocolV2: true
      };
      await clientMqtt.connect(ArduinoCloudOptions);
      var timeout = setTimeout(() => { updateToken(connectionConfig) }, tokenInfo.expires_in * 1000);
      connections.push({
        clientId: connectionConfig.credentials.clientid,
        connectionConfig: connectionConfig,
        token: tokenInfo.token,
        expires_token_ts: tokenInfo.expires_in,
        clientMqtt: clientMqtt,
        clientHttp: null,
        timeoutUpdateToken: timeout
      });
    }

  } else{
    if(connections[user].clientMqtt !== null){
      clientMqtt = connections[user].clientMqtt;
    }else{
      clientMqtt = new ArduinoClientMqtt();
      const ArduinoCloudOptions = {
        host: "wss.iot.oniudra.cc",
        token: connections[user].token,
        apiUrl: "https://auth-dev.arduino.cc",
        onDisconnect: () => {
          disconnected(clientId);
          console.log(`connection lost for ${clientId}`);
        },
        useCloudProtocolV2: true
      };
      await clientMqtt.connect(ArduinoCloudOptions);
      connections[user].clientMqtt=mqttClient;
    }
  }
  return clientMqtt;
  }catch(err){
    console.log(err);
  }

}

async function getClientHttp(connectionConfig){
  if (!connectionConfig || !connectionConfig.credentials) {
    throw new Error("Cannot find cooonection config or credentials.");
  }
  try{
  var user = findUser(clientId);
  var clientHttp;
  if(user === -1){

    var tokenInfo = await getToken(connectionConfig);
    if(tokenInfo !==undefined){
      clientHttp= new arduinClientHttp(tokenInfo.token);
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

  } else{
    if(connections[user].clientHttp !== null){
      clientHttp = connections[user].clientHttp;
    }else{
      clientHttp = new arduinClientHttp(connections[user].token);

      connections[user].clientHttp=clientHttp;
    }
  }
  return clientHttp;
  }catch(err){
    console.log(err);
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

async function updateToken(connectionConfig){
  try{
    var user = findUser(clientId);
    if(user !== -1){
      var tokenInfo= await getToken(connectionConfig);
      if(tokenInfo !==undefined){
        connections[user].token= tokenInfo.token;
        connections[user].expires_token_ts=tokenInfo.expires_in;
        connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, tokenInfo.expires_in * 1000);
      }else{
        connections[user].timeoutUpdateToken = setTimeout(() => { updateToken(connectionConfig) }, 1000);
      }
    }
  }catch(err){
    console.log(err);
  }
}

async function deleteClientMqtt(clientId, propertyName ){
  var user = findUser(clientId);
  if(user !== -1){
    if(connections[user].clientMqtt !== null){
      var ret = await connections[user].clientMqtt.removePropertyValueCallback(clientId, propertyName);
      if(ret === 0){
        await connections[user].clientMqtt.disconnect();
        delete connections[user].clientMqtt;
        connections[user].clientMqtt = null;
        if(connections[user].clientHttp === null){
          if(connections[user].timeoutUpdateToken)
            clearTimeout(connections[user].timeoutUpdateToken);
          connections.splice(user,1);
        }
      }
    }
  }
}

function deleteClientHttp(clientId){
  var user = findUser(clientId);
  if(user !== -1){
    if(connections[user].clientHttp !== null){
      connections[user].clientHttp= null;
    }
    if(connections[user].clientMqtt === null){
      if(connections[user].timeoutUpdateToken)
        clearTimeout(connections[user].timeoutUpdateToken);
      connections.splice(user,1);
    }
  }
}

exports.getClientMqtt = getClientMqtt;
exports.getClientHttp = getClientHttp;
exports.deleteClientMqtt = deleteClientMqtt;
exports.deleteClientHttp = deleteClientHttp;
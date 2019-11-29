import ArduinoClientMqtt from './arduino-iot-client-mqtt';

/**
 * {
 *  user: clientid,
 *  mqttClient: obj,
 *  connected: connected,
 *  numSubscriptions: num
 * }
 */
var connections=[];

async function readProperty(clientId,token, thingId, propertyName, callback){
  var client = findUser(clientId);
  var mqttobj;
  const ArduinoCloudOptions = {
    host: "wss.iot.oniudra.cc",
    token: token,
    apiUrl: "https://auth-dev.arduino.cc",
    onDisconnect: () => {
      disconnected(clientId);
      console.log(`connection lost for ${clientId}`);
    },
    useCloudProtocolV2: true
  };

  if(client === -1){
    mqttobj= new ArduinoClientMqtt();
    await mqttobj.connect(ArduinoCloudOptions);
    connections.push({
      clientId: clientId,
      mqttClient:   mqttobj,
      connected: true,
      numSubscriptions: 0
    });
    client= connections.length -1;
  }else{
    mqttobj=connections[client].mqttClient;

  }
  if(connections[client].connected===false){
    await mqttobj.connect(ArduinoCloudOptions);
    connections[client].connected=true;
  }

  await mqttobj.onPropertyValue(thingId, propertyName, callback);
  connections[client].numSubscriptions++;
}

async function disconnect(clientId, thingId, propertyName){
  var client = findUser(clientId);
  var mqttobj = connections[client].mqttClient;
  await mqttobj.removePropertyValueCallback(thingId, propertyName);
  connections[client].numSubscriptions--;
  if(connections[client].numSubscriptions===0){
    await mqttobj.disconnect();
    connections.splice(client,1);
  }

}

function disconnected(clientId){
  var client = findUser(clientId);
  connections[client].connected=false;

}


function findUser(clientId) {
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].clientId === clientId) {
      return i;
    }
  }
  return -1;

}

exports.readProperty = readProperty;
exports.disconnect = disconnect;
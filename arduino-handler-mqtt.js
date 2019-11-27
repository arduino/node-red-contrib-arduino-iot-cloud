import ArduinoCloud from 'arduino-iot-client-mqtt';

/**
 * {
 *  user: clientid,
 *  mqttClient: obj,
 *  connected: connected
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
      disconnect(clientId);
      console.log(`connection lost for ${clientId}`);
    }
  };

  if(client === -1){
    mqttobj= Object.create(ArduinoCloud);
    await mqttobj.connect(ArduinoCloudOptions);
    connections.push({
      clientId: clientId,
      mqttClient:   mqttobj,
      connected: true
    });
    client= connections.length -1;
  }else{
    mqttobj=connections[client].mqttClient;
  }
  if(connections[client].connected===false){
    await mqttobj.connect(ArduinoCloudOptions);
    connections[client].connected=true;
  }

  await onPropertyValue(thingId, propertyName, callback);

}

function disconnect(clientId){
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
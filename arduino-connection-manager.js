const arduinCloudRestApi = require('./arduino-cloud-api');
const request = require("async-request");

var ArduinoRestClient = new arduinCloudRestApi.ArduinoCloudClient();

const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://login.oniudra.cc/oauth/token';
const accessTokenAudience = process.env.NODE_RED_ACCESS_TOKEN_AUDIENCE || 'https://api.arduino.cc';

async function connect(connectionConfig) {
  var options = {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    data: {
      grant_type: 'client_credentials',
      client_id: connectionConfig.clientid,
      client_secret: connectionConfig.clientsecret,
      audience: accessTokenAudience
    }
  };
  try {
    const data = JSON.parse((await request(accessTokenUri, options)).body);
    const access_token = data.access_token;
    const expires_in = data.expires_in;
    ArduinoRestClient.updateToken(access_token);	
  } catch (err) {
    throw new Error(err);
  }
}

exports.connect = connect;
exports.apiRest = ArduinoRestClient;


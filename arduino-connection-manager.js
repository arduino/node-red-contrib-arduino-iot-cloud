const arduinCloudRestApi = require('./arduino-cloud-api');
const request = require("async-request");

var ArduinoRestClient = new arduinCloudRestApi.ArduinoCloudClient();

const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://login.arduino.cc/oauth/token';
const accessTokenAudience = process.env.NODE_RED_ACCESS_TOKEN_AUDIENCE || 'https://api2.arduino.cc/iot';

var expires_token_ts=0;
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
    var rawdata;
    var data;
    var access_token;
    var expires_in;
    var date = new Date();
    var timestamp = date.getTime();
    if(timestamp>expires_token_ts){
      rawdata = await request(accessTokenUri, options);
      data = JSON.parse(rawdata.body);
      access_token = data.access_token;
      expires_in = data.expires_in;
      if(access_token!==undefined){
      ArduinoRestClient.updateToken(access_token);
      expires_token_ts=timestamp+expires_in;
      }
    }
  } catch (err) {
    console.log(err);
  }
}

exports.connect = connect;
exports.apiRest = ArduinoRestClient;


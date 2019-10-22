const arduinCloudRestApi = require('./arduino-cloud-api');
const request = require("async-request");

var ArduinoRestClient = new arduinCloudRestApi.ArduinoCloudClient();

const accessTokenUri = process.env.NODE_RED_ACCESS_TOKEN_URI || 'https://login.arduino.cc/oauth/token';
const accessTokenAudience = process.env.NODE_RED_ACCESS_TOKEN_AUDIENCE || 'https://api2.arduino.cc/iot';


var ids=[];

async function connect(connectionConfig) {
  var date = new Date();
  var timestamp = date.getTime();
  var user = findUser(connectionConfig.clientid);
  var requiretoken=false;
  var token;
  if(user!==-1){
    if(timestamp > ids[user].expires_token_ts){
      requiretoken=true;
    } else {
      token=ids[user].token;
    }
  }

  if(requiretoken || user===-1){
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
      var expires_in;
      rawdata = await request(accessTokenUri, options);
      data = JSON.parse(rawdata.body);
      token = data.access_token;
      expires_in = data.expires_in;
      if(token!==undefined){
        if(user===-1){
          const newIds={
            clientId: connectionConfig.clientid,
            token: token,
            expires_token_ts: timestamp+expires_in
          };
          ids.push(newIds);
        }else{
          ids[user].token=token;
          ids[user].expires_token_ts=timestamp+expires_in;
        }
       }
      } catch (err) {
        console.log(err);
      }
    }
  ArduinoRestClient.updateToken(token);

}
function findUser(clientId){
  for (var i=0; i<ids.length; i++){
    if(ids[i].clientId===clientId){
      return i;
    }
  }
  return -1;

}
exports.connect = connect;
exports.apiRest = ArduinoRestClient;


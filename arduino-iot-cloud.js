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
const connectionManager = require("./utils/arduino-connection-manager");
const moment = require("moment");

module.exports = function (RED) {
  function ArduinoIotInput(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.status({});
      this.lastValue = undefined;
      this.organization = config.organization;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {
          this.thing = config.thing;
          this.propertyId = config.property;
          this.propertyName = config.propname;
          this.propertyVariableName = config.variableName;
          this.arduinoClient = await connectionManager.getClientMqtt(connectionConfig, RED);
          if (this.arduinoClient && this.arduinoClient.connection.connected) {
            await this.arduinoClient.onPropertyValue(this.thing, this.propertyVariableName,(msg) => {
              this.send(
                {
                  topic: this.propertyName,
                  payload: msg,
                  timestamp: (new Date()).getTime()
                }
              );
              const s = getStatus(msg);
              if (s != undefined)
                this.status({ fill: "grey", shape: "dot", text: s });
              else
                this.status({});
            },config.id);
          }else{
            this.status({ fill: "red", shape: "ring", text: "arduino-iot-cloud.status.connection-error" });
          }
          this.on('close', function (done) {
            connectionManager.deleteClientMqtt(connectionConfig.credentials.clientid, this.thing, this.propertyVariableName,config.id).then(() => { done(); });
          });

          //this.poll(connectionConfig);
        } catch (err) {
          console.log(err);
        }
      }
    }
    realConstructor.apply(this, [config]);
  }
  RED.nodes.registerType("property in", ArduinoIotInput);

  function ArduinoIotOutput(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.status({});
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {

          if (config.thing !== "" && config.property !== "") {
            this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
            if (this.arduinoRestClient){
              this.arduinoRestClient.openConnections++;
              this.organization = config.organization;
              this.thing = config.thing;
              this.propertyId = config.property;
              this.propertyName = config.name;
              this.sendasdevice = config.sendasdevice;
              this.device = config.device
              
              this.on('input', async function (msg) {
                try {
                  await this.arduinoRestClient.setProperty(this.thing, this.propertyId, msg.payload, this.sendasdevice ? this.device : undefined);
                  var s;
                  if (typeof msg.payload !== "object") {
                    s = getStatus(msg.payload);
                  }else{
                    s="arduino-iot-cloud.status.object-sent";
                  }
                  if (s != undefined)
                    this.status({ fill: "grey", shape: "dot", text: s });
                  else
                    this.status({});
                } catch (err) {
                  if(err.response && err.response.res && err.response.request){
                    console.log('statusCode: '+ err.response.res.statusCode +'\n'+
                    'statusMessage: ' + err.response.res.statusMessage + '\n' +
                    'text: ' + err.response.res.text + '\n'+
                    'HTTP method: ' + err.response.request.method + '\n' +
                    'URL request: ' + err.response.request.url + '\n'
                    );
                  }else{
                    console.log(err);
                  }

                  this.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.error-setting-value" });
                }
              });
              this.on('close', function (done) {
                connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
              });
            }else{
              this.status({ fill: "red", shape: "ring", text: "arduino-iot-cloud.status.connection-error" });
            }
          }
        } catch (err) {
          if(err.response && err.response.res && err.response.request){
            console.log('statusCode: '+ err.response.res.statusCode +'\n'+
            'statusMessage: ' + err.response.res.statusMessage + '\n' +
            'text: ' + err.response.res.text + '\n'+
            'HTTP method: ' + err.response.request.method + '\n' +
            'URL request: ' + err.response.request.url + '\n'
            );
          }else{
            console.log(err);
          }

        }
      }
    }
    realConstructor.apply(this, [config]);
  }
  RED.nodes.registerType("property out", ArduinoIotOutput);

  function ArduinoIotInputHist(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.status({});
      const node = this;
      this.timeWindowCount = config.timeWindowCount;
      this.timeWindowUnit = config.timeWindowUnit;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {
          this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
          if (this.arduinoRestClient){
            this.arduinoRestClient.openConnections++;
            if (config.thing !== "" && config.property !== "") {
              this.organization = config.organization;
              this.thing = config.thing;
              this.propertyId = config.property;
              this.propertyName = config.name;
              node.on('input', async function () {
                try{
                  const now = moment();
                  const end = now.format();
                  const count = this.timeWindowCount
                  if (count !== null && count !== "" && count !== undefined && Number.isInteger(parseInt(count)) && parseInt(count) !== 0) {
                    const start = now.subtract(count * this.timeWindowUnit, 'second').format();

                    const result = await this.arduinoRestClient.getSeries(this.thing, this.propertyId, start, end);
                    const times = result.responses[0].times;
                    const values = result.responses[0].values;
                    let data = [];
                    if (values && times) {
                      values.forEach(function (item, index, array) {
                        data.push({
                          x: moment(times[index]).unix() * 1000,
                          y: values[index]
                        });
                      });
                    }
                    node.send(
                      {
                        topic: config.name,
                        payload: [{
                          series: [],
                          data: [data]
                        }]
                      }
                    );
                    var str = RED._("arduino-iot-cloud.status.sent");
                    str += data.length;
                    str += RED._("arduino-iot-cloud.status.elements");
                    this.status({ fill: "grey", shape: "dot", text: str });
                  }
                }catch (err) {
                  if(err.response && err.response.res && err.response.request){
                    console.log('statusCode: '+ err.response.res.statusCode +'\n'+
                    'statusMessage: ' + err.response.res.statusMessage + '\n' +
                    'text: ' + err.response.res.text + '\n'+
                    'HTTP method: ' + err.response.request.method + '\n' +
                    'URL request: ' + err.response.request.url + '\n'
                    );
                  }else{
                    console.log(err);
                  }

                  this.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.error-getting-value" });
                }
              });

              this.on('close', function (done) {
                connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
              });
            }
          }else{
            this.status({ fill: "red", shape: "ring", text: "arduino-iot-cloud.status.connection-error" });
          }
        } catch (err) {
          if(err.response && err.response.res && err.response.request){
            console.log('statusCode: '+ err.response.res.statusCode +'\n'+
            'statusMessage: ' + err.response.res.statusMessage + '\n' +
            'text: ' + err.response.res.text + '\n'+
            'HTTP method: ' + err.response.request.method + '\n' +
            'URL request: ' + err.response.request.url + '\n'
            );
          }else{
            console.log(err);
          }

          this.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.error-getting-value" });
        }
      }
    }
    realConstructor.apply(this, [config]);
  }
  RED.nodes.registerType("property in hist", ArduinoIotInputHist);

  function ArduinoIotInputPoll(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.status({});
      this.timeWindowCount = config.timeWindowCount;
      this.timeWindowUnit = config.timeWindowUnit;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {
          this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
          if (this.arduinoRestClient){
            this.arduinoRestClient.openConnections++;
            if (config.thing !== "" && config.property !== "") {
              this.organization = config.organization;
              this.thing = config.thing;
              this.propertyId = config.property;
              this.propertyName = config.name;
              const pollTime = this.timeWindowCount * this.timeWindowUnit;
              if (pollTime !== null && pollTime !== "" && pollTime !== undefined && Number.isInteger(parseInt(pollTime)) && parseInt(pollTime) !== 0) {
                this.poll(connectionConfig, pollTime);
                this.on('close', function (done) {
                  connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
                  if (this.pollTimeoutPoll)
                    clearTimeout(this.pollTimeoutPoll);

                });
              }
            }
          }else{
            this.status({ fill: "red", shape: "ring", text: "arduino-iot-cloud.status.connection-error" });
          }
        } catch (err) {
          if(err.response && err.response.res && err.response.request){
            console.log('statusCode: '+ err.response.res.statusCode +'\n'+
            'statusMessage: ' + err.response.res.statusMessage + '\n' +
            'text: ' + err.response.res.text + '\n'+
            'HTTP method: ' + err.response.request.method + '\n' +
            'URL request: ' + err.response.request.url + '\n'
            );
          }else{
            console.log(err);
          }

        }
      }
    }
    realConstructor.apply(this, [config]);
  }
  ArduinoIotInputPoll.prototype = {
    poll: async function (connectionConfig, pollTime) {
      try {
        const property = await this.arduinoRestClient.getProperty(this.thing, this.propertyId);
        this.send(
          {
            topic: property.name,
            payload: property.last_value,
            timestamp: property.value_updated_at
          }
        );
        const s = getStatus(property.last_value);
        if (s != undefined)
          this.status({ fill: "grey", shape: "dot", text: s });
        else
          this.status({});
        this.pollTimeoutPoll = setTimeout(() => { this.poll(connectionConfig, pollTime) }, pollTime * 1000);
      } catch (err) {
        if(err.response && err.response.res && err.response.request){
          console.log('statusCode: '+ err.response.res.statusCode +'\n'+
          'statusMessage: ' + err.response.res.statusMessage + '\n' +
          'text: ' + err.response.res.text + '\n'+
          'HTTP method: ' + err.response.request.method + '\n' +
          'URL request: ' + err.response.request.url + '\n'
          );
        }else{
          console.log(err);
        }

        this.pollTimeoutPoll = setTimeout(() => { this.poll(connectionConfig, pollTime) }, pollTime * 1000);
        this.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.error-getting-value" });
      }
    }
  }
  RED.nodes.registerType("property in poll", ArduinoIotInputPoll);


  function ArduinoIotInputPush(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.status({});
      const node = this;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {

          if (config.thing !== "" && config.property !== "") {
            this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
            if (this.arduinoRestClient){
              this.arduinoRestClient.openConnections++;
              this.organization = config.organization;
              this.thing = config.thing;
              this.propertyId = config.property;
              this.propertyName = config.name;
              node.on('input', async function () {
                try{
                  const property = await this.arduinoRestClient.getProperty(this.thing, this.propertyId);
                  this.send(
                    {
                      topic: property.name,
                      payload: property.last_value,
                      timestamp: property.value_updated_at
                    }
                  );
                  const s = getStatus(property.last_value);
                  if (s != undefined)
                    this.status({ fill: "grey", shape: "dot", text: s });
                  else
                    this.status({});
                } catch (err) {
                  if(err.response && err.response.res && err.response.request){
                    console.log('statusCode: '+ err.response.res.statusCode +'\n'+
                    'statusMessage: ' + err.response.res.statusMessage + '\n' +
                    'text: ' + err.response.res.text + '\n'+
                    'HTTP method: ' + err.response.request.method + '\n' +
                    'URL request: ' + err.response.request.url + '\n'
                    );
                  }else{
                    console.log(err);
                  }

                  this.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.error-getting-value" });
                }
              });
              this.on('close', function (done) {
                connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
              });
            }else{
              this.status({ fill: "red", shape: "ring", text: "arduino-iot-cloud.status.connection-error" });
            }
          }
        } catch (err) {
          if(err.response && err.response.res && err.response.request){
            console.log('statusCode: '+ err.response.res.statusCode +'\n'+
            'statusMessage: ' + err.response.res.statusMessage + '\n' +
            'text: ' + err.response.res.text + '\n'+
            'HTTP method: ' + err.response.request.method + '\n' +
            'URL request: ' + err.response.request.url + '\n'
            );
          }else{
            console.log(err);
          }

          this.status({ fill: "red", shape: "dot", text: "arduino-iot-cloud.status.error-getting-value" });
        }
      }
    }
    realConstructor.apply(this, [config]);
  }

  RED.nodes.registerType("property in push", ArduinoIotInputPush);

  function ArduinoConnectionNode(config) {
    RED.nodes.createNode(this, config);
    this.applicationname = config.applicationname;
    this.clientid = config.clientid;
    this.clientsecret = config.clientsecret;
  }
  RED.nodes.registerType("arduino-connection", ArduinoConnectionNode, {
    credentials: {
      clientid: { type: "password" },
      clientsecret: { type: "password" }
    }
  });

  async function getThingsOrProperties(req, res, thingsOrProperties) {
    let arduinoRestClient;
    var str;
    try {
      if (req.query.clientid || req.query.clientsecret) {
        arduinoRestClient = await connectionManager.getClientHttp({
          credentials: {
            clientid: req.query.clientid,
            clientsecret: req.query.clientsecret
          }
        });
      } else if (req.query.connectionid) {
        const connectionConfig = RED.nodes.getNode(req.query.connectionid);
        if (!connectionConfig) {
          str=RED._("arduino-iot-cloud.connection-error.no-cred-available");
          console.log(str);
          return res.send(JSON.stringify({ error: str }));
        }
        arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
      } else {
        str=RED._("arduino-iot-cloud.connection-error.no-cred-available");
        console.log(str);
        return res.send(JSON.stringify({ error: str }));
      }
      if (thingsOrProperties === "things") {
        const organization = req.headers.organization;
        const opts = {}
        if (organization) {
          opts.xOrganization = organization;
        }
        return res.send(JSON.stringify(await arduinoRestClient.getThings(opts)));
      } else if (thingsOrProperties === "properties") {
        const thing_id = req.query.thing_id;
        const organization = req.headers.organization;
        const opts = {}
        if (organization) {
          opts.xOrganization = organization;
        }
        return res.send(JSON.stringify(await arduinoRestClient.getProperties(thing_id, opts)));
      } else if (thingsOrProperties === "device") {
        const thing_id = req.query.thing_id;
        const organization = req.headers.organization;
        const opts = {}
        if (organization) {
          opts.xOrganization = organization;
        }
        return res.send(JSON.stringify(await arduinoRestClient.getThing(thing_id, opts)));
      }else {
        str=RED._("arduino-iot-cloud.connection-error.wrong-param");
        console.log(str);
        return res.send(JSON.stringify({ error: str }));
      }
    } catch (err) {
      str=RED._("arduino-iot-cloud.connection-error.wrong-cred-sys-unvail");
      console.log(`Status: ${err.status}, message: ${err.error}`);
      return res.send(JSON.stringify({ error: str }));
    }
  }
  RED.httpAdmin.get("/things", RED.auth.needsPermission('Property-in.read'), async function (req, res) {
    return getThingsOrProperties(req, res, "things");
  });

  RED.httpAdmin.get("/properties", RED.auth.needsPermission('Property-in.read'), async function (req, res) {
    return getThingsOrProperties(req, res, "properties");
  });

  RED.httpAdmin.get("/thing", RED.auth.needsPermission('Property-in.read'), async function (req, res) {
    return getThingsOrProperties(req, res, "device");
  });

  function getStatus(value) {
    if (typeof value !== "object") {
      if (typeof value === "number" && !(Number.isInteger(value)))
        return value.toFixed(3);
      else
        return value;
    }
    return RED._("arduino-iot-cloud.status.object-injected");
  }
}

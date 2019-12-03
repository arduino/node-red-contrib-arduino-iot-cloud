const connectionManager = require("./utils/arduino-connection-manager");
const moment = require("moment");
const _ = require('lodash');

module.exports = function (RED) {
  function ArduinoIotInput(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.lastValue = undefined;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {

          this.thing = config.thing;
          this.propertyId = config.property;
          this.propertyName = config.propname;
          this.arduinoClient = await connectionManager.getClientMqtt(connectionConfig, RED);
          if (this.arduinoClient && this.arduinoClient.connection.connected) {
            await this.arduinoClient.onPropertyValue(this.thing, this.propertyName, (msg) => {
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
            });
          }else{
            this.status({ fill: "red", shape: "ring", text: "Connection Error" });
          }
          this.on('close', function (done) {
            connectionManager.deleteClientMqtt(connectionConfig.credentials.clientid, this.thing, this.propertyName).then(() => { done(); });
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
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {

          if (config.thing !== "" && config.property !== "") {
            this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
            if (this.arduinoRestClient){
              this.arduinoRestClient.openConnections++;
              this.thing = config.thing;
              this.propertyId = config.property;
              this.propertyName = config.name;
              this.on('input', async function (msg) {
                try {
                  await this.arduinoRestClient.setProperty(this.thing, this.propertyId, msg.payload);
                  const s = getStatus(msg.payload);
                  if (s != undefined)
                    this.status({ fill: "grey", shape: "dot", text: s });
                  else
                    this.status({});
                } catch (err) {
                  console.log(err);
                  this.status({ fill: "red", shape: "dot", text: "Error setting value" });
                }
              });
              this.on('close', function (done) {
                connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
              });
            }else{
              this.status({ fill: "red", shape: "ring", text: "Connection Error" });
            }
          }
        } catch (err) {
          console.log(err);
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
      const node = this;
      this.timeWindowCount = config.timeWindowCount;
      this.timeWindowUnit = config.timeWindowUnit;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {
          this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
          if (this.arduinoRestClient){
            this.arduinoRestClient.openConnections++;
            if (config.thing !== "" && config.property !== "") {
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
                  }
                }catch (err) {
                  console.log(err);
                  this.status({ fill: "red", shape: "dot", text: "Error getting value" });
                }
              });

              this.on('close', function (done) {
                connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
              });
            }
          }else{
            this.status({ fill: "red", shape: "ring", text: "Connection Error" });
          }
        } catch (err) {
          console.log(err);
          this.status({ fill: "red", shape: "dot", text: "Error getting value" });
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
      this.timeWindowCount = config.timeWindowCount;
      this.timeWindowUnit = config.timeWindowUnit;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {
          this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
          if (this.arduinoRestClient){
            this.arduinoRestClient.openConnections++;
            if (config.thing !== "" && config.property !== "") {
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
            this.status({ fill: "red", shape: "ring", text: "Connection Error" });
          }
        } catch (err) {
          console.log(err);
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
        console.log(err);
        this.pollTimeoutPoll = setTimeout(() => { this.poll(connectionConfig, pollTime) }, pollTime * 1000);
        this.status({ fill: "red", shape: "dot", text: "Error getting value" });
      }
    }
  }
  RED.nodes.registerType("property in poll", ArduinoIotInputPoll);


  function ArduinoIotInputPush(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      const node = this;
      if (connectionConfig && config.thing !== "" && config.thing !== "0" && config.property !== "" && config.property !== "0") {
        try {

          if (config.thing !== "" && config.property !== "") {
            this.arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
            if (this.arduinoRestClient){
              this.arduinoRestClient.openConnections++;
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
                  console.log(err);
                  this.status({ fill: "red", shape: "dot", text: "Error getting value" });
                }
              });
              this.on('close', function (done) {
                connectionManager.deleteClientHttp(connectionConfig.credentials.clientid).then(() => { done(); });
              });
            }else{
              this.status({ fill: "red", shape: "ring", text: "Connection Error" });
            }
          }
        } catch (err) {
          console.log(err);
          this.status({ fill: "red", shape: "dot", text: "Error getting value" });
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
          console.log("No credentials available.");
          return res.send(JSON.stringify({ error: "No credentials available." }));
        }
        arduinoRestClient = await connectionManager.getClientHttp(connectionConfig);
      } else {
        console.log("No credentials available.");
        return res.send(JSON.stringify({ error: "No credentials available." }));
      }
      if (thingsOrProperties === "things") {
        return res.send(JSON.stringify(await arduinoRestClient.getThings()));
      } else if (thingsOrProperties === "properties") {
        const thing_id = req.query.thing_id;
        return res.send(JSON.stringify(await arduinoRestClient.getProperties(thing_id)));
      } else {
        console.log("Wrong parameter in getThingsOrProperties.");
        return res.send(JSON.stringify({ error: "Wrong parameter in getThingsOrProperties." }));
      }
    } catch (err) {
      console.log(`Status: ${err.status}, message: ${err.error}`);
      return res.send(JSON.stringify({ error: "Wrong credentials or system unavailable." }));
    }
  }
  RED.httpAdmin.get("/things", RED.auth.needsPermission('Property-in.read'), async function (req, res) {
    return getThingsOrProperties(req, res, "things");
  });

  RED.httpAdmin.get("/properties", RED.auth.needsPermission('Property-in.read'), async function (req, res) {
    return getThingsOrProperties(req, res, "properties");
  });
}

function getStatus(value) {
  if (typeof value !== "object") {
    if (typeof value === "number" && !(Number.isInteger(value)))
      return value.toFixed(3);
    else
      return value;
  }
  return;
}
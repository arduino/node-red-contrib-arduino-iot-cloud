const connectionManager = require("./arduino-connection-manager");
const moment = require("moment");
const _ = require('lodash');

module.exports = function(RED) {
  function ArduinoIotInput(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      this.lastValue = undefined;
      try {
        await connectionManager.connect(connectionConfig);
        if (config.thing !== "" && config.property !== "") {
          this.arduinoRestClient = connectionManager.apiRest;
          this.thing = config.thing;
          this.propertyId = config.property;
          this.propertyName = config.name;
          this.poll(connectionConfig);
        }
      } catch (err) {
        console.log(err);
      }
    }
    realConstructor.apply(this, [config]);
  }
  ArduinoIotInput.prototype = {
    poll: async function(connectionConfig) {
      try {
		    await connectionManager.connect(connectionConfig);
        const property = await this.arduinoRestClient.getProperty(this.thing, this.propertyId);
        if (typeof (property.last_value) !== "object" && property.last_value !== this.lastValue ||
            typeof (property.last_value) === "object" && !_.isEqual(property.last_value, this.lastValue)
        ) {
          this.send(
            {
              topic: property.name,
              payload: property.last_value,
              timestamp: property.value_updated_at
            }
          );
          const s = getStatus(property.last_value);
          if (s)
              this.status({fill: "grey",shape: "dot",text: s});
          else
            this.status({});
          this.lastValue = property.last_value;
        }

        this.pollTimeout = setTimeout(() => { this.poll(connectionConfig)}, 1000);
      } catch (err) {
        console.log(err);
      }
    }
  }
  RED.nodes.registerType("property in", ArduinoIotInput);

  function ArduinoIotOutput(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      try {
        await connectionManager.connect(connectionConfig);
        if (config.thing !== "" && config.property !== "") {
          this.arduinoRestClient = connectionManager.apiRest;
          this.thing = config.thing;
          this.propertyId = config.property;
          this.propertyName = config.name;
          this.on('input', async function(msg) {
			      try{
              await connectionManager.connect(connectionConfig);
              this.arduinoRestClient.setProperty(this.thing, this.propertyId, msg.payload);
              const s = getStatus(msg.payload);
              if (s)
                  this.status({fill: "grey",shape: "dot",text: s});
              else
                this.status({});
            } catch(err){
              console.log(err);
            }
          });
        }
      } catch (err) {
        console.log(err);
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
      try{
        this.arduinoRestClient = connectionManager.apiRest;
        if (config.thing !== "" && config.property !== "") {
          this.thing = config.thing;
          this.propertyId = config.property;
          this.propertyName = config.name;
          node.on('input', async function() {
            const now = moment();
            const end = now.format();
            const start = now.subtract(this.timeWindowCount * this.timeWindowUnit, 'second').format();
            await connectionManager.connect(connectionConfig);
            const result = await this.arduinoRestClient.getSeries(this.thing, this.propertyId,start,end);
            const times= result.responses[0].times;
            const values = result.responses[0].values;
            let data = [];
              if(values && times) {
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
          });
        }
      }catch(err){
        console.log(err);
      }
    }
    realConstructor.apply(this, [config]);
  }
  RED.nodes.registerType("property in hist", ArduinoIotInputHist);

  function ArduinoIotInputPoll(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      const node = this;

      this.timeWindowCount = config.timeWindowCount;
      this.timeWindowUnit = config.timeWindowUnit;
      try{
        this.arduinoRestClient = connectionManager.apiRest;
        if (config.thing !== "" && config.property !== "") {
        this.thing = config.thing;
        this.propertyId = config.property;
        this.propertyName = config.name;
        const pollTime = this.timeWindowCount * this.timeWindowUnit;
        this.poll(connectionConfig, pollTime);
        }
      }catch(err){
        console.log(err);
      }
    }
    realConstructor.apply(this, [config]);
  }
  ArduinoIotInputPoll.prototype = {
    poll: async function(connectionConfig, pollTime) {
      try {
        await connectionManager.connect(connectionConfig);
        const property = await this.arduinoRestClient.getProperty(this.thing, this.propertyId);
          this.send(
            {
              topic: property.name,
              payload: property.last_value,
              timestamp: property.value_updated_at
            }
          );
          const s = getStatus(property.last_value);
          if (s)
              this.status({fill: "grey",shape: "dot",text: s});
          else
            this.status({});
        this.pollTimeoutPoll = setTimeout(() => { this.poll(connectionConfig, pollTime)}, pollTime*1000);
      } catch (err) {
        console.log(err);
      }
    }
  }
  RED.nodes.registerType("property in poll", ArduinoIotInputPoll);


  function ArduinoIotInputPush(config) {
    const realConstructor = async (config) => {
      RED.nodes.createNode(this, config);
      const connectionConfig = RED.nodes.getNode(config.connection);
      const node = this;
      try {
        await connectionManager.connect(connectionConfig);
        if (config.thing !== "" && config.property !== "") {
          this.arduinoRestClient = connectionManager.apiRest;
          this.thing = config.thing;
          this.propertyId = config.property;
          this.propertyName = config.name;
          node.on('input', async function() {
            await connectionManager.connect(connectionConfig);
            const property = await this.arduinoRestClient.getProperty(this.thing, this.propertyId);
            this.send(
              {
                topic: property.name,
                payload: property.last_value,
                timestamp: property.value_updated_at
              }
            );
            const s = getStatus(property.last_value);
            if (s)
                this.status({fill: "grey",shape: "dot",text: s});
            else
              this.status({});
            });
        }
      } catch (err) {
        console.log(err);
      }
    }
    realConstructor.apply(this, [config]);
  }

  RED.nodes.registerType("property in push", ArduinoIotInputPush);

  function ArduinoConnectionNode(config) {
    RED.nodes.createNode(this,config);
    this.applicationname = config.applicationname;
    this.clientid = config.clientid;
    this.clientsecret = config.clientsecret;
  }
  RED.nodes.registerType("arduino-connection",ArduinoConnectionNode);

  RED.httpAdmin.get("/things", RED.auth.needsPermission('Property-in.read'), async function(req,res) {
    try {
      const connectionConfig = {
        clientid: req.query.clientid,
        clientsecret: req.query.clientsecret
      }
      await connectionManager.connect(connectionConfig);
      const arduinoRestClient = connectionManager.apiRest;
      const things = await arduinoRestClient.getThings();
      return res.send(JSON.stringify(things));
    } catch (err) {
      console.log(err);
    }
  });

  RED.httpAdmin.get("/properties", RED.auth.needsPermission('Property-in.read'), async function(req,res) {
    try {
      const connectionConfig = {
        clientid: req.query.clientid,
        clientsecret: req.query.clientsecret
      }
      await connectionManager.connect(connectionConfig);
      const ArduinoRestClient = connectionManager.apiRest;
      const thing_id = req.query.thing_id;
      const properties = await ArduinoRestClient.getProperties(thing_id);
      return res.send(JSON.stringify(properties));
    } catch (err) {
      console.log(err);
    }
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
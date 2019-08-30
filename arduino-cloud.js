const moment = require("moment");

module.exports = function(RED) {
  function ArduinoIotInput(config) {
      RED.nodes.createNode(this, config);
      this.connection = config.connection;
      this.connectionConfig = RED.nodes.getNode(this.connection);
      const node = this;
      const promise = RED.settings.functionGlobalContext.arduinoConnectionManager;
      promise.then((arduinoConnectionManager) => {
        const ArduinoCloudMessageClient = arduinoConnectionManager.apiMessage;
        if (ArduinoCloudMessageClient && arduinoConnectionManager.initialized) {
          ArduinoCloudMessageClient.onPropertyValue(config.thing, config.name, message => {
            const timestamp = (new Date()).getTime();
            node.send(
              {
                topic: config.name,
                payload: message,
                timestamp: timestamp
              }            
            );
          }).then(() => {
            node.on('close', function(done) {
              ArduinoCloudMessageClient.removePropertyValueCallback(config.thing, config.name).then( () => {
                done();
              });
            });
          }).catch((err) => {
            console.log(err);
          });
        }
      });
  }
  RED.nodes.registerType("property in", ArduinoIotInput);

  function ArduinoIotOutput(config) {
      RED.nodes.createNode(this, config);
      this.connection = config.connection;
      this.connectionConfig = RED.nodes.getNode(this.connection);
      const node = this;
      const promise = RED.settings.functionGlobalContext.arduinoConnectionManager;
      promise.then((arduinoConnectionManager) => {
        const ArduinoCloudMessageClient = arduinoConnectionManager.apiMessage;
        if (ArduinoCloudMessageClient) {
          node.on('input', function(msg) {
            const timestamp =   (new Date()).getTime();
            ArduinoCloudMessageClient.sendProperty(config.thing, config.name, msg.payload, timestamp).then(() => {
            });
        });
      }
    });
  }
  RED.nodes.registerType("property out", ArduinoIotOutput);

  function ArduinoIotInputPull(config) {
    RED.nodes.createNode(this, config);
    this.connection = config.connection;
    this.connectionConfig = RED.nodes.getNode(this.connection);
    const node = this;
    this.last = config.last;
    this.timeWindowCount = config.timeWindowCount;
    this.timeWindowUnit = config.timeWindowUnit;

    const promise = RED.settings.functionGlobalContext.arduinoConnectionManager;
    promise.then((arduinoConnectionManager) => {
      if(this.last) {
        const ArduinoRestClient = arduinoConnectionManager.apiRest;
        if (ArduinoRestClient) {
          node.on('input', function() {
            ArduinoRestClient.getProperty(config.thing, config.propid).then( (result) => {
              const timestamp = (new Date()).getTime();
              let payload = result.last_value;
              node.send(
                {
                  topic: config.name,
                  payload: payload,
                  timestamp: timestamp
                }  
              );
            });
          });
        }
      } else {
        const ArduinoRestClient = arduinoConnectionManager.apiRest;
        if (ArduinoRestClient) {
          node.on('input', function() {
            const now = moment();
            const end = now.format();
            const start = now.subtract(this.timeWindowCount * this.timeWindowUnit, 'second').format();

            ArduinoRestClient.getSeries(config.thing, config.propid, start, end).then( (result) => {
              const times = result.responses[0].times;
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
          });
        }
      }
    });  
  }
  RED.nodes.registerType("property in pull", ArduinoIotInputPull);
  
  function ArduinoConnectionNode(config) {
    RED.nodes.createNode(this,config);
    this.applicationname = config.applicationname;
    this.clientid = config.clientid;
    this.clientsecret = config.clientsecret;
  }
  RED.nodes.registerType("arduino-connection",ArduinoConnectionNode);

  RED.httpAdmin.get("/things", RED.auth.needsPermission('Property-in.read'), function(req,res) {
    const promise = RED.settings.functionGlobalContext.arduinoConnectionManager;
    promise.then((arduinoConnectionManager) => {
      const ArduinoRestClient = arduinoConnectionManager.apiRest;
      ArduinoRestClient.getThings()
      .then(things => {
        return res.send(JSON.stringify(things));
      }).catch(err => {
        console.log(err);
      });
    }); 
  });

  RED.httpAdmin.get("/properties", RED.auth.needsPermission('Property-in.read'), function(req,res) {
    const promise = RED.settings.functionGlobalContext.arduinoConnectionManager;
    promise.then((arduinoConnectionManager) => {
      const thing_id = req.query.thing_id;
      const ArduinoRestClient =  arduinoConnectionManager.apiRest;
      ArduinoRestClient.getProperties(thing_id)
      .then(properties => {
        return res.send(JSON.stringify(properties));
      })
      .catch(err => {
        console.log(err);
      });
    });
  });
}

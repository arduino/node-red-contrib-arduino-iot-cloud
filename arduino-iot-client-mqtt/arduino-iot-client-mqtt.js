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

/*
     SenML labels
     https://tools.ietf.org/html/draft-ietf-core-senml-16#section-4.3

     +---------------+-------+------------+------------+------------+
     |          Name | Label | CBOR Label | JSON Type  | XML Type   |
     +---------------+-------+------------+------------+------------+
     |     Base Name | bn    |         -2 | String     | string     |
     |     Base Time | bt    |         -3 | Number     | double     |
     |     Base Unit | bu    |         -4 | String     | string     |
     |    Base Value | bv    |         -5 | Number     | double     |
     |      Base Sum | bs    |         -6 | Number     | double     |
     |       Version | bver  |         -1 | Number     | int        |
     |          Name | n     |          0 | String     | string     |
     |          Unit | u     |          1 | String     | string     |
     |         Value | v     |          2 | Number     | double     |
     |  String Value | vs    |          3 | String     | string     |
     | Boolean Value | vb    |          4 | Boolean    | boolean    |
     |    Data Value | vd    |          8 | String (*) | string (*) |
     |     Value Sum | s     |          5 | Number     | double     |
     |          Time | t     |          6 | Number     | double     |
     |   Update Time | ut    |          7 | Number     | double     |
     +---------------+-------+------------+------------+------------+
*/

const mqtt = require('mqtt');
const CBOR = require('@arduino/cbor-js');
const jws = require('jws');
const ArduinoCloudError = require('./ArduinoCloudError');

const arduinoCloudPort = 8443;
const arduinoCloudHost = 'wss.iot.arduino.cc';

class ArduinoClientMqtt {
  constructor() {
    this.connection = null;
    this.connectionOptions = null;
    this.subscribedTopics = {};
    this.propertyCallback = {};
    this.numSubscriptions = 0;
  }

  // Connect establishes a connection with mqtt, using token as the password, and returns a promise
  // of a Symbol identifying the mqtt client
  connect(options) {
    return new Promise((resolve, reject) => {
      let ssl = false;
      if (options.ssl !== false) {
        ssl = true;
      }
      this.opts = {
        host: options.host || arduinoCloudHost,
        port: options.port || arduinoCloudPort,
        ssl,
        token: options.token,
        onOffline: options.onOffline,
        onDisconnect: options.onDisconnect,
        onConnected: options.onConnected,
        useCloudProtocolV2: options.useCloudProtocolV2 || false,
      };

      if (this.connection) {
        return reject(new Error('connection failed: connection already open'));
      }

      if (!this.opts.host) {
        return reject(new Error('connection failed: you need to provide a valid host (broker)'));
      }

      if (!this.opts.token) {
        return reject(new Error('connection failed: you need to provide a valid token'));
      }

      const userid = jws.decode(options.token).payload["http://arduino.cc/id"];
      const clientID = `${userid}:${new Date().getTime()}`;
      const connectionOpts = {
        clientId: clientID,
        username: userid,
        password: this.opts.token,
        properties: {},
        protocolVersion: 4,
        connectTimeout: 30000,
        keepalive: 30,
        clean: true
      };

      const client = mqtt.connect('wss://' + this.opts.host + ':' + this.opts.port + '/mqtt', connectionOpts);
      this.connection = client;

      client.topics = {};

      client.on("connect", () => {
        if (typeof this.opts.onConnected === 'function') {
          this.opts.onConnected();
        }

        return resolve(this.connection);
      });

      client.on("error", (err) => {
        reject(
          new ArduinoCloudError(5, err.toString()),
        );
      });

      client.on("message", (topic, msg) => {
        if (topic.indexOf('/s/o') > -1) {
          client.topics[topic].forEach((cb) => {
            cb(msg.toString());
          });
        } else {
          // const buf = new ArrayBuffer(msg.payloadBytes.length);
          // const bufView = new Uint8Array(buf);
          // for (let i = 0, strLen = msg.payloadBytes.length; i < strLen; i += 1) {
          //   bufView[i] = msg.payloadBytes[i];
          // }

          const propertyValue = CBOR.decode(toArrayBuffer(msg));
          const propertyNameId = 0;
          const attributeNameId = 1;

          let valueToSend = {};
          let propertyNameKeyPrevious = '';
          let propertyNameKey = '';
          propertyValue.forEach((p) => {
            // Support cbor labels
            propertyNameKey = p.n !== undefined ? p.n : p['0'];
            const propertyNameKeySplit = propertyNameKey.split(':');

            const valueKey = p.v !== undefined ? 'v' : '2';
            const valueStringKey = p.vs !== undefined ? 'vs' : '3';
            const valueBooleanKey = p.vb !== undefined ? 'vb' : '4';
            let value = null;
            propertyNameKey = propertyNameKeySplit[propertyNameId];
            if (this.propertyCallback[topic][propertyNameKey]) {
              if (!(p[valueKey] === undefined)) {
                value = p[valueKey];
              } else if (!(p[valueStringKey] === undefined)) {
                value = p[valueStringKey];
              } else if (!(p[valueBooleanKey] === undefined)) {
                value = p[valueBooleanKey];
              }
            }
            if (propertyNameKeyPrevious === '') {
              propertyNameKeyPrevious = propertyNameKeySplit[propertyNameId];
            }
            if (propertyNameKeyPrevious !== propertyNameKey) {
              if (this.propertyCallback[topic][propertyNameKeyPrevious]) {
                for(var i=0; i<this.propertyCallback[topic][propertyNameKeyPrevious].length; i++){
                 this.propertyCallback[topic][propertyNameKeyPrevious][i].callback(valueToSend);
                }
              }
              propertyNameKeyPrevious = propertyNameKey;
              valueToSend = {};
            }
            if (propertyNameKeySplit.length === 1 && value !== null) {
              valueToSend = value;
            } else {
              const attributeName = propertyNameKeySplit[attributeNameId];
              valueToSend[attributeName] = value;
            }
          });
          if (valueToSend !== {} && this.propertyCallback[topic][propertyNameKey]) {
            for(var i=0; i<this.propertyCallback[topic][propertyNameKey].length; i++){
             this.propertyCallback[topic][propertyNameKey][i].callback(valueToSend);
            }
          }
       }
      });
      if (typeof this.opts.onOffline === 'function') {
        client.on("offline", () => {
          this.opts.onOffline();
        });
      }
      if (typeof this.opts.onDisconnect === 'function') {
        client.on("disconnect", () => {
          this.opts.onDisconnect();
        });
      }
    });
  }
  disconnect() {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('disconnection failed: connection closed'));
      }

      try {
        this.connection.end(true);
      } catch (error) {
        return reject(error);
      }

      // Remove the connection
      this.connection = null;

      // Remove property callbacks to allow resubscribing in a later connect()
      Object.keys(this.propertyCallback).forEach((topic) => {
        if (this.propertyCallback[topic]) {
          delete this.propertyCallback[topic];
        }
      });

      // Clean up subscribed topics - a new connection might not need the same topics
      Object.keys(this.subscribedTopics).forEach((topic) => {
        delete this.subscribedTopics[topic];
      });

      return resolve();
    });
  }

  async reconnect() {
    await this.connection.reconnect();
  };

  async updateToken(token) {
    // This infinite loop will exit once the reconnection is successful -
    // and will pause between each reconnection tentative, every 5 secs.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        if (this.connection) {
          // Disconnect to the connection that is using the old token
          await this.connection.end();

          // Remove the connection
          this.connection = null;
        }

        // Reconnect using the new token
        const reconnectOptions = Object.assign({}, this.opts, { token });
        await this.connect(reconnectOptions);

        // Re-subscribe to all topics subscribed before the reconnection
        Object.values(this.subscribedTopics).forEach((subscribeParams) => {
          this.subscribe(subscribeParams.topic, subscribeParams.cb);
        });

        if (typeof this.opts.onConnected === 'function') {
          // Call the connection callback (with the reconnection param set to true)
          this.opts.onConnected(true);
        }

        // Exit the infinite loop
        return;
      } catch (error) {
        // Expose paho-mqtt errors
        // eslint-disable-next-line no-console
        console.error(error);

        // Something went wrong during the reconnection - retry in 5 secs.
        await new Promise((resolve) => {
          setTimeout(resolve, 5000);
        });
      }
    }
  };

  subscribe(topic, cb) {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('subscription failed: connection closed'));
      }

      return this.connection.subscribe(topic, (err) => {
        if (!err) {
          if (!this.connection.topics[topic]) {
            this.connection.topics[topic] = [];
          }
          this.connection.topics[topic].push(cb);
          return resolve(topic);
        } else {
          reject(new Error(`subscription failed: ${err.toString()}`));
        }
      });
    });
  }
  unsubscribe(topic) {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('disconnection failed: connection closed'));
      }

      return this.connection.unsubscribe(topic, null, (err) => {
        if (err)
          reject();
        else
          resolve(topic);
      });
    });
  }
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  sendMessage(topic, message) {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('disconnection failed: connection closed'));
      }

      this.connection.publish(topic, message);
      return resolve();
    });
  }

  openCloudMonitor(deviceId, cb) {
    const cloudMonitorOutputTopic = `/a/d/${deviceId}/s/o`;
    return subscribe(cloudMonitorOutputTopic, cb);
  };


  writeCloudMonitor(deviceId, message) {
    const cloudMonitorInputTopic = `/a/d/${deviceId}/s/i`;
    return sendMessage(cloudMonitorInputTopic, message);
  };

  closeCloudMonitor(deviceId) {
    const cloudMonitorOutputTopic = `/a/d/${deviceId}/s/o`;
    return unsubscribe(cloudMonitorOutputTopic);
  };

  toCloudProtocolV2(cborValue) {
    const cloudV2CBORValue = {};
    let cborLabel = null;

    Object.keys(cborValue).forEach((label) => {
      switch (label) {
        case 'bn':
          cborLabel = -2;
          break;
        case 'bt':
          cborLabel = -3;
          break;
        case 'bu':
          cborLabel = -4;
          break;
        case 'bv':
          cborLabel = -5;
          break;
        case 'bs':
          cborLabel = -6;
          break;
        case 'bver':
          cborLabel = -1;
          break;
        case 'n':
          cborLabel = 0;
          break;
        case 'u':
          cborLabel = 1;
          break;
        case 'v':
          cborLabel = 2;
          break;
        case 'vs':
          cborLabel = 3;
          break;
        case 'vb':
          cborLabel = 4;
          break;
        case 'vd':
          cborLabel = 8;
          break;
        case 's':
          cborLabel = 5;
          break;
        case 't':
          cborLabel = 6;
          break;
        case 'ut':
          cborLabel = 7;
          break;
        default:
          cborLabel = label;
      }

      cloudV2CBORValue[cborLabel] = cborValue[label];
    });

    return cloudV2CBORValue;
  };

  sendProperty(thingId, name, value, timestamp) {
    const propertyInputTopic = `/a/t/${thingId}/e/i`;

    if (timestamp && !Number.isInteger(timestamp)) {
      throw new Error('Timestamp must be Integer');
    }

    if (name === undefined || typeof name !== 'string') {
      throw new Error('Name must be a valid string');
    }

    if (typeof value === 'object') {
      const objectKeys = Object.keys(value);
      const cborValues = objectKeys.map((key, i) => {
        const cborValue = {
          n: `${name}:${key}`,
        };

        if (i === 0) {
          cborValue.bt = timestamp || new Date().getTime();
        }

        switch (typeof value[key]) {
          case 'string':
            cborValue.vs = value[key];
            break;
          case 'number':
            cborValue.v = value[key];
            break;
          case 'boolean':
            cborValue.vb = value[key];
            break;
          default:
            break;
        }

        return cborValue;
      })
        .map((cborValue) => {
          if (this.connectionOptions.useCloudProtocolV2) {
            return toCloudProtocolV2(cborValue);
          }

          return cborValue;
        });

      return sendMessage(propertyInputTopic, CBOR.encode(cborValues, true));
    }

    let cborValue = {
      bt: timestamp || new Date().getTime(),
      n: name,
    };

    switch (typeof value) {
      case 'string':
        cborValue.vs = value;
        break;
      case 'number':
        cborValue.v = value;
        break;
      case 'boolean':
        cborValue.vb = value;
        break;
      default:
        break;
    }

    if (this.connectionOptions.useCloudProtocolV2) {
      cborValue = toCloudProtocolV2(cborValue);
    }

    return sendMessage(propertyInputTopic, CBOR.encode([cborValue], true));
  };

  getSenml(deviceId, name, value, timestamp) {
    if (timestamp && !Number.isInteger(timestamp)) {
      throw new Error('Timestamp must be Integer');
    }

    if (name === undefined || typeof name !== 'string') {
      throw new Error('Name must be a valid string');
    }


    if (typeof value === 'object') {
      const objectKeys = Object.keys(value);
      const senMls = objectKeys.map((key, i) => {
        const senMl = {
          n: `${name}:${key}`,
        };

        if (i === 0) {
          senMl.bt = timestamp || new Date().getTime();

          if (deviceId) {
            senMl.bn = `urn:uuid:${deviceId}`;
          }
        }

        switch (typeof value[key]) {
          case 'string':
            senMl.vs = value[key];
            break;
          case 'number':
            senMl.v = value[key];
            break;
          case 'boolean':
            senMl.vb = value[key];
            break;
          default:
            break;
        }

        return senMl;
      })
        .map((senMl) => {
          if (this.connectionOptions.useCloudProtocolV2) {
            return toCloudProtocolV2(senMl);
          }

          return senMl;
        });

      return senMls;
    }

    const senMl = {
      bt: timestamp || new Date().getTime(),
      n: name,
    };

    if (deviceId) {
      senMl.bn = `urn:uuid:${deviceId}`;
    }

    switch (typeof value) {
      case 'string':
        senMl.vs = value;
        break;
      case 'number':
        senMl.v = value;
        break;
      case 'boolean':
        senMl.vb = value;
        break;
      default:
        break;
    }

    if (this.connectionOptions.useCloudProtocolV2) {
      return toCloudProtocolV2(senMl);
    }

    return senMl;
  };

  getCborValue(senMl) {
    const cborEncoded = CBOR.encode(senMl);
    return arrayBufferToBase64(cborEncoded);
  };

  onPropertyValue(thingId, name, cb,nodeId) {
    if (!name) {
      throw new Error('Invalid property name');
    }
    if (typeof cb !== 'function') {
      throw new Error('Invalid callback');
    }
    var node;
    if(!nodeId){
      node=1
    }else{
      node=nodeId;
    }
    const propOutputTopic = `/a/t/${thingId}/e/o`;

    this.subscribedTopics[thingId] = {
      topic: propOutputTopic,
      cb,
    };
    this.numSubscriptions++;
    if (!this.propertyCallback[propOutputTopic]) {
      this.propertyCallback[propOutputTopic] = {};
      this.propertyCallback[propOutputTopic][name] = [];
      this.propertyCallback[propOutputTopic][name].push({
        nodeId: node,
        callback:cb
      });

      return this.subscribe(propOutputTopic, cb);
    }

    if (this.propertyCallback[propOutputTopic] && !this.propertyCallback[propOutputTopic][name]) {
      this.propertyCallback[propOutputTopic][name] = [];
      this.propertyCallback[propOutputTopic][name].push({
        nodeId: node,
        callback:cb
      });
    }else if(this.propertyCallback[propOutputTopic] && this.propertyCallback[propOutputTopic][name]){
      this.propertyCallback[propOutputTopic][name].push({
        nodeId: node,
        callback:cb
      });
    }
    return Promise.resolve(propOutputTopic);
  };


  removePropertyValueCallback(thingId, name, nodeId) {
    if (!name) {
      throw new Error('Invalid property name');
    }
    var node;
    if(!nodeId){
      node=1
    }else{
      node=nodeId;
    }
    const propOutputTopic = `/a/t/${thingId}/e/o`;
    var pos=-1;
    for(var i=0; i<this.propertyCallback[propOutputTopic][name].length; i++){
      var cbObject=this.propertyCallback[propOutputTopic][name][i];
      if(cbObject.nodeId===node){
        pos=i;
        break;
      }
    }
    if(pos!=-1){
      this.propertyCallback[propOutputTopic][name].splice(pos,1);
    }
    if(this.propertyCallback[propOutputTopic][name].length===0){
      delete this.propertyCallback[propOutputTopic][name];
    }
    this.numSubscriptions--;

    return Promise.resolve(this.numSubscriptions);
  };
}

function toArrayBuffer(buf) {
  var ab = new ArrayBuffer(buf.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
  }
  return ab;
}

exports.ArduinoClientMqtt = ArduinoClientMqtt;
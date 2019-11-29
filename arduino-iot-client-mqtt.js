/*
* Copyright 2018 ARDUINO SA (http://www.arduino.cc/)
* This file is part of arduino-iot-js.
* Copyright (c) 2018
* Authors: Fabrizio Mirabito
*
* This software is released under:
* The GNU General Public License, which covers the main part of
* arduino-iot-js
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

const WebSocket = require('ws');
global.WebSocket = WebSocket;
const Paho = require('paho-client');
const CBOR = require('@arduino/cbor-js');
const jws = require('jws');
const ArduinoCloudError = require('./ArduinoCloudError');

const arduinoCloudPort = 8443;
const arduinoCloudHost = 'wss.iot.arduino.cc';
const arduinoAuthURL = 'https://auth.arduino.cc';

class clientMqtt{
  constructor(){
    this.connection = null;
    this.connectionOptions = null;
    this.subscribedTopics = {};
    this.propertyCallback = {};
    this.numSubscriptions = 0;
  }

  // Connect establishes a connection with mqtt, using token as the password, and returns a promise
// of a Symbol identifying the mqtt client
  connect(options){ return new Promise((resolve, reject) => {
    let ssl = false;
    if (options.ssl !== false) {
      ssl = true;
    }
    const opts = {
      host: options.host || arduinoCloudHost,
      port: options.port || arduinoCloudPort,
      apiUrl: options.apiUrl || arduinoAuthURL,
      ssl,
      token: options.token,
      onDisconnect: options.onDisconnect,
      onTrace: options.onTrace,
      onConnected: options.onConnected,
      useCloudProtocolV2: options.useCloudProtocolV2 || false,
    };

    this.connectionOptions = opts;

    if (this.connection) {
      return reject(new Error('connection failed: connection already open'));
    }

    if (!opts.host) {
      return reject(new Error('connection failed: you need to provide a valid host (broker)'));
    }

    if (!opts.token) {
      return reject(new Error('connection failed: you need to provide a valid token'));
    }

    if (!opts.apiUrl) {
      return reject(new Error('no apiUrl parameter is provided'));
    }

    const userid = jws.decode(options.token).payload["http://arduino.cc/user_id"];
    const clientID = `${userid}:${new Date().getTime()}`;
    const client = new Paho.Client(opts.host, opts.port, clientID);
    client.topics = {};
    client.properties = {};

    client.onMessageArrived = (msg) => {
      if (msg.topic.indexOf('/s/o') > -1) {
        client.topics[msg.topic].forEach((cb) => {
          cb(msg.payloadString);
        });
      } else {
        const buf = new ArrayBuffer(msg.payloadBytes.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = msg.payloadBytes.length; i < strLen; i += 1) {
          bufView[i] = msg.payloadBytes[i];
        }

        const propertyValue = CBOR.decode(buf);
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
          if (this.propertyCallback[msg.topic][propertyNameKey]) {
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
            if (this.propertyCallback[msg.topic][propertyNameKeyPrevious]) {
              this.propertyCallback[msg.topic][propertyNameKeyPrevious](valueToSend);
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
        if (valueToSend !== {} && this.propertyCallback[msg.topic][propertyNameKey]) {
          this.propertyCallback[msg.topic][propertyNameKey](valueToSend);
        }
      }
    };

    client.onConnected = (reconnect) => {
      const reconnectPromises = [];

      if (reconnect === true) {
        // This is a re-connection: re-subscribe to all topics subscribed before the
        // connection loss
        Object.values(this.subscribedTopics).forEach((subscribeParams) => {
          reconnectPromises.push(() => subscribe(subscribeParams.topic, subscribeParams.cb));
        });
      }

      return Promise.all(reconnectPromises)
        .then(() => {
          if (typeof opts.onConnected === 'function') {
            opts.onConnected(reconnect);
          }
        });
    };

    if (typeof onDisconnect === 'function') {
      client.onConnectionLost = opts.onDisconnect;
    }

    const connectionOpts = {
      useSSL: opts.ssl,
      timeout: 30,
      mqttVersion: 4,
      userName: userid,
      // password: token,
      mqttVersionExplicit: true,
      // If reconnect is set to true, in the event that the connection is lost, the client will
      // attempt to reconnect to the server. It will initially wait 1 second before it attempts
      // to reconnect, for every failed reconnect attempt, the delay will double until it is at
      // 2 minutes at which point the delay will stay at 2 minutes.
      reconnect: true,
      keepAliveInterval: 30,
      onSuccess: () => {
        this.connection = client;
        return resolve(this.connection);
      },
      onFailure: ({ errorCode, errorMessage }) => reject(
        new ArduinoCloudError(errorCode, errorMessage),
      ),
    };


    connectionOpts.password = opts.token;

    if (typeof opts.onTrace === 'function') {
      client.trace = (log) => {
        opts.onTrace(log);
      };
    }

    client.connect(connectionOpts);
  });
  }
  disconnect() {return new Promise((resolve, reject) => {
    if (!this.connection) {
      return reject(new Error('disconnection failed: connection closed'));
    }

    try {
      this.connection.disconnect();
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
  async updateToken(token) {
    // This infinite loop will exit once the reconnection is successful -
    // and will pause between each reconnection tentative, every 5 secs.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        if (this.connection) {
          // Disconnect to the connection that is using the old token
          this.connection.disconnect();

          // Remove the connection
          this.connection = null;
        }

        // Reconnect using the new token
        const reconnectOptions = Object.assign({}, this.connectionOptions, { token });
        await connect(reconnectOptions);

        // Re-subscribe to all topics subscribed before the reconnection
        Object.values(this.subscribedTopics).forEach((subscribeParams) => {
          subscribe(subscribeParams.topic, subscribeParams.cb);
        });

        if (typeof this.connectionOptions.onConnected === 'function') {
          // Call the connection callback (with the reconnection param set to true)
          this.connectionOptions.onConnected(true);
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

  subscribe(topic, cb){ return new Promise((resolve, reject) => {
    if (!this.connection) {
      return reject(new Error('subscription failed: connection closed'));
    }

    return this.connection.subscribe(topic, {
      onSuccess: () => {
        if (!this.connection.topics[topic]) {
          this.connection.topics[topic] = [];
        }
        this.connection.topics[topic].push(cb);
        return resolve(topic);
      },
      onFailure: error => reject(new Error(`subscription failed: ${error.errorMessage}`)),
    });
  });
  }
  unsubscribe(topic) { return new Promise((resolve, reject) => {
    if (!this.connection) {
      return reject(new Error('disconnection failed: connection closed'));
    }

    return this.connection.unsubscribe(topic, {
      onSuccess: () => resolve(topic),
      onFailure: () => reject(),
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

  sendMessage(topic, message){ return new Promise((resolve, reject) => {
    if (!this.connection) {
      return reject(new Error('disconnection failed: connection closed'));
    }

    this.connection.publish(topic, message, 1, false);
    return resolve();
  });
  }

  openCloudMonitor(deviceId, cb){
    const cloudMonitorOutputTopic = `/a/d/${deviceId}/s/o`;
    return subscribe(cloudMonitorOutputTopic, cb);
  };


  writeCloudMonitor(deviceId, message){
    const cloudMonitorInputTopic = `/a/d/${deviceId}/s/i`;
    return sendMessage(cloudMonitorInputTopic, message);
  };

  closeCloudMonitor(deviceId){
    const cloudMonitorOutputTopic = `/a/d/${deviceId}/s/o`;
    return unsubscribe(cloudMonitorOutputTopic);
  };

  toCloudProtocolV2(cborValue){
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

  onPropertyValue(thingId, name, cb){
    if (!name) {
      throw new Error('Invalid property name');
    }
    if (typeof cb !== 'function') {
      throw new Error('Invalid callback');
    }
    const propOutputTopic = `/a/t/${thingId}/e/o`;

    this.subscribedTopics[thingId] = {
      topic: propOutputTopic,
      cb,
    };

    if (!this.propertyCallback[propOutputTopic]) {
      this.propertyCallback[propOutputTopic] = {};
      this.propertyCallback[propOutputTopic][name] = cb;
      return subscribe(propOutputTopic, cb);
    }

    if (this.propertyCallback[propOutputTopic] && !this.propertyCallback[propOutputTopic][name]) {
      this.propertyCallback[propOutputTopic][name] = cb;
      this.numSubscriptions++;
    }
    return Promise.resolve(propOutputTopic);
  };


  removePropertyValueCallback(thingId, name)  {
    if (!name) {
      throw new Error('Invalid property name');
    }
    const propOutputTopic = `/a/t/${thingId}/e/o`;
    delete this.propertyCallback[propOutputTopic][name];
    this.numSubscriptions--;

    return Promise.resolve( this.numSubscriptions);
  };
}

exports.clientMqtt = clientMqtt;
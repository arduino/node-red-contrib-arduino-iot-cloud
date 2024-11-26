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

// Arduino iot cloud api
'use strict';

const ArduinoIotClient = require('@arduino/arduino-iot-client');
const client = ArduinoIotClient.ApiClient.instance;

// Configure OAuth2 access token for authorization: oauth2
var oauth2 = client.authentications['oauth2'];
const apiProperties = new ArduinoIotClient.PropertiesV2Api(client);
const apiSeries = new ArduinoIotClient.SeriesV2Api(client);
const apiThings = new ArduinoIotClient.ThingsV2Api(client);

class ArduinoClientHttp {
  constructor(getToken) {
    this.openConnections=0;
    oauth2.accessToken = "";
    if(process.env.API_BASE_PATH){
      client.basePath = process.env.API_BASE_PATH;
    }
    
    // Wrap the functions with refresh token logic 
    function withTokenRefresh(fn) {
      return async (...args) => {
        let delay = 0;
        for (;;) {
          try {
            return await fn(...args);
          } catch (e) {
            if (e.status === 401) {
              oauth2.accessToken = await getToken();
              await new Promise((resolve) => setTimeout(resolve, delay));
              delay = delay===0 ? 200 : Math.min(delay*2, 5000);
              continue;
            }
            throw e;
          }
        }
      };
    }
    this.wrappedPropertiesV2Publish = withTokenRefresh(apiProperties.propertiesV2Publish.bind(apiProperties));
    this.wrappedThingsV2List = withTokenRefresh(apiThings.thingsV2List.bind(apiThings));
    this.wrappedThingsV2Show = withTokenRefresh(apiThings.thingsV2Show.bind(apiThings));
    this.wrappedPropertiesV2Show = withTokenRefresh(apiProperties.propertiesV2Show.bind(apiProperties));
    this.wrappedSeriesV2BatchQueryRaw = withTokenRefresh(apiSeries.seriesV2BatchQueryRaw.bind(apiSeries));
  }


  async setProperty(thing_id, property_id, value, opts = {}, device_id = undefined) {
    const body = JSON.stringify({
      value: value,
      device_id: device_id
    });
    return await this.wrappedPropertiesV2Publish(thing_id, property_id, body, opts);
  }

  async getThings(opts = {}) {
    return await this.wrappedThingsV2List(opts);
  }

  async getThing(thingId, opts = {}) {
    opts.showDeleted = false;
    return await this.wrappedThingsV2Show(thingId, opts);
  }

  async getProperties(thingId, opts = {}) {
    opts.showProperties = true;
    const { properties } = await this.wrappedThingsV2Show(thingId, opts);
    return properties;
  }

  async getProperty(thingId, propertyId, opts = {}) {
    return await this.wrappedPropertiesV2Show(thingId, propertyId, opts);
  }

  async getSeries(_thingId, propertyId, start, end, opts = {}) {
    const body = JSON.stringify({
      requests: [{
        q: "property." + propertyId,
        from: start,
        to: end,
        sort: "ASC",
        series_limit: 86400
      }],
      resp_version: 1
    });
    return await this.wrappedSeriesV2BatchQueryRaw(body, opts);
  }
}

exports.ArduinoClientHttp = ArduinoClientHttp;

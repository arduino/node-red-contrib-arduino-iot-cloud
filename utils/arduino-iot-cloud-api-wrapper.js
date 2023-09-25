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
  constructor(token) {
    this.token = token;
    this.openConnections=0;
    if(process.env.API_BASE_PATH){
      client.basePath = process.env.API_BASE_PATH;
    }
  }
  updateToken(token) {
    this.token = token;
  }
  setProperty(thing_id, property_id, value, device_id = undefined) {
    const body = JSON.stringify({
      value: value,
      device_id : device_id
    });
    oauth2.accessToken = this.token;
    return apiProperties.propertiesV2Publish(thing_id, property_id, body);
  }
  getThings(opts) {
    oauth2.accessToken = this.token;
    return apiThings.thingsV2List(opts);
  }
  getThing(thingId, opts) {
    oauth2.accessToken = this.token;
    opts.showDeleted = false;
    return apiThings.thingsV2Show(thingId, opts);
  }
  getProperties(thingId, opts) {
    oauth2.accessToken = this.token;
    opts.showProperties = true;
    const thing = apiThings.thingsV2Show(thingId, opts);
    return thing.then(({properties}) => properties);
  }
  getProperty(thingId, propertyId) {
    oauth2.accessToken = this.token;
    return apiProperties.propertiesV2Show(thingId, propertyId);
  }
  getSeries(thingId, propertyId, start, end) {

    const body =  JSON.stringify({
      requests: [{
        q: "property." + propertyId,
        from: start,
        to: end,
        sort: "ASC",
        series_limit: 86400
      }],
      resp_version: 1
    });
    oauth2.accessToken = this.token;
    return apiSeries.seriesV2BatchQueryRaw(body);
  }
}
exports.ArduinoClientHttp = ArduinoClientHttp;

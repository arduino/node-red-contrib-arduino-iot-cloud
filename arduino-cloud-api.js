// MIT License
// Copyright (c) 2019 ilcato
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Arduino cloud api
'use strict';

const request = require('request');
const envUrl =
  process.env.IOT_API_BASE_URL || 'https://api-dev.arduino.cc/iot/v1'; 
const authUrl =
  process.env.AUTH_API_BASE_URL || 'https://auth-dev.arduino.cc/v1'; 

function log(title, msg) {
  console.log(`[${title}] ${msg}`);
}
class ArduinoCloudClient {
  constructor(token) {
    this.token = token;
  }
  updateToken(token) {
    this.token = token;
  }
  getUserId() {
    const url = `${authUrl}/users/byID/me`;
    return this.genericRequest(url, 'get', '');
  }
  setProperty(thing_id, property_id, value) {
    const url = `${envUrl}/things/${thing_id}/properties/${property_id}/publish`;
    const body = JSON.stringify({
      value: value
    });
    return this.genericRequest(url, 'put', body);
  }
  getThings() {
    const url = `${envUrl}/things`;
    return this.genericRequest(url, 'get', '');
  }
  getProperties(thingId) {
    const url = `${envUrl}/things/${thingId}/properties`;
    return this.genericRequest(url, 'get', '');
  }
  getProperty(thingId, propertyId) {
    const url = `${envUrl}/things/${thingId}/properties/${propertyId}`;
    return this.genericRequest(url, 'get', '');
  }
  getSeries(thingId, propertyId, start, end) {
    const url = `${envUrl}/series/batch_query_raw`;
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
    return this.genericRequest(url, 'post', body);
  }
  genericRequest(url, method, body) {
    const p = new Promise((resolve, reject) => {
      const headers = {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      };
      request(
        {
          url: url,
          method: method,
          body: body,
          headers: headers
        },
        (err, response, body) => {
          if (!err && response.statusCode === 200) {
            if (body) resolve(JSON.parse(body));
            else resolve();
          } else reject(err);
        }
      );
    });
    return p;
  }
}
exports.ArduinoCloudClient = ArduinoCloudClient;

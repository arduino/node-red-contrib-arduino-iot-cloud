# node-red-contrib-arduino-cloud

This module implements node-red nodes for interacting with [Arduino IoT Cloud](https://create.arduino.cc/iot).
Multi Arduino Account are allowed.

## Installation
+ Install node-red-contrib-arduino-cloud:
`npm install -g https://github.com/bcmi-labs/node-red-contrib-arduino-cloud.git`
## Configuration
1) Obtain from an Arduino Cloud account the Client ID and Client Secret
2) Select Arduino nodes from the pallete and drag to a flow
3) Double click
    * set a new connection
      + select 'Add new arduino-connection...' in the field 'Connection'
      + Click edit (Pencil button)
      + Insert a connection name, Client ID and Client Secret (collected at point 1)
      + Click Add
    * Select a thing
    * Select a Property
    * Set a name
4) Connect Arduino property input node to other nodes to consume data coming from a thing property.
5) Send a payload to the Arduino property output node to change the value of a thing property.

## Nodes
### Property In
This node reads data every second from a configured Arduino Cloud Property
### Property Out
This node writes a value to a configured Arduino Cloud Property.
### Property Hist
This node injects in the flow a set of historical values from an Arduino Cloud Property.

Node parameter:
+ Time Filter: defines time range for historical values
### Property Poll
This node reads the value of an Arduino Cloud Property at configured intervals of time.

Node parameter:
+ Poll Every: defines polling time interval (seconds, minutes, hours, days, weeks)
## Development
To use beta version of arduino APIs set the following environment variables

+ `API_BASE_PATH=http://api-dev.arduino.cc/iot`

+ `NODE_RED_ACCESS_TOKEN_URI=https://login.oniudra.cc/oauth/token`





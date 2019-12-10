# node-red-contrib-arduino-cloud

This module implements node-red nodes for interacting with [Arduino IoT Cloud](https://create.arduino.cc/iot).
Multi Arduino Accounts are allowed.

## Installation
Install node-red-contrib-arduino-cloud with:

`npm install -g https://{username}:{token}@github.com/bcmi-labs/node-red-contrib-arduino-cloud.git`

where `username` is your github login username and `token` is one of your github personal access tokens.

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
### property In
This node injects in the flow the changed value of a specific Arduino IoT Cloud property.
### property Out
This node update a specific Arduino IoT Cloud property with the value received in input
### historic
This node injects in the flow a set of values of an Arduino Cloud Property based on the node configuration.

Node parameter:
+ Time Filter: defines time range for historical values
### periodic
This node injects in the flow the value of an Arduino Cloud Property with a periodicity based on the node configuration.

Node parameter:
+ Poll Every: defines polling time interval (seconds, minutes, hours, days, weeks)
### inject
This node injects in the flow the value of an Arduino Cloud Property after receiving an input event.
## Development environment
To use development version of arduino APIs set the following environment variables befor starting node-red

+ `API_BASE_PATH=http://api-dev.arduino.cc/iot`

+ `NODE_RED_ACCESS_TOKEN_URI=https://login.oniudra.cc/oauth/token`

+ `NODE_RED_MQTT_HOST=wss.iot.oniudra.cc`


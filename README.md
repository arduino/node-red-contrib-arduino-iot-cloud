# node-red-contrib-arduino-iot-cloud

This module implements Node-RED nodes for interacting with [Arduino IoT Cloud](https://create.arduino.cc/iot).
Multi Arduino Accounts are allowed.

## Docker and Node-RED installation
The easiest way to install Docker on a linux system is to use [the convenience script](https://docs.docker.com/engine/install/ubuntu/#install-using-the-convenience-script):
```shell
curl -sSL https://get.docker.com/ | sh
```
To install Node-RED you can use the [official docker container](https://hub.docker.com/r/nodered/node-red):
```shell
docker run -it -p 1880:1880 -v myNodeREDdata:/data --name mynodered nodered/node-red
```


## Installation
Just search *node-red-contrib-arduino-iot-cloud* in the Node-RED palette manager and click on install

Or you can install the plugin by using `npm` in your `$HOME/.node-red` directory:

`npm install @arduino/node-red-contrib-arduino-iot-cloud`

### Update
If you're using a service hosting your node-red instance and you want to be sure that you're using the latest version of *node-red-contrib-arduino-iot-cloud* published on npm, you might need to force require an update.

You can use either one of these methods:
  - Go to [https://flows.nodered.org/add/node](https://flows.nodered.org/add/node) and write `node-red-contrib-arduino-iot-cloud` in the input field
  - If you are logged in, you should see a `check for update` on the right side of the [module's page](https://flows.nodered.org/node/@arduino/node-red-contrib-arduino-iot-cloud)

## Configuration
1. Obtain Client ID and Client Secret from the [integrations webpage](https://create.arduino.cc/iot/integrations) by clicking on *Create API key*
2. Go to Node-RED web page
3. Select one Arduino nodes from the pallete and drag to a flow
4. Double click on the node
    * set a new connection
      + select 'Add new arduino-connection...' in the field 'Connection'
      + Click edit (Pencil button)
      + Insert a connection name, Client ID and Client Secret (collected at point 1)
      + Click Add
    * Select a thing
    * Select a Property
    * Set a name
5. Connect Arduino property input node to other nodes to consume data coming from a thing property.
6. Send a payload to the Arduino property output node to change the value of a thing property.

## Nodes

### property (In)
This node injects in the flow the changed value of a specific Arduino IoT Cloud property.

### property (Out)
This node update a specific Arduino IoT Cloud property with the value received in input

### historic
This node injects in the flow a set of values of an Arduino IoT Cloud Property based on the node configuration.
Node parameter:
+ Time Filter: defines time range for historical values

### periodic
This node injects in the flow the value of an Arduino IoT Cloud Property with a periodicity based on the node configuration.
Node parameter:
+ Poll Every: defines polling time interval (seconds, minutes, hours, days, weeks)

### inject
This node injects in the flow the value of an Arduino IoT Cloud Property after receiving an input event.
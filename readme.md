# node-red-contrib-arduino-iot-cloud

This module implements node-red nodes for interacting with [Arduino IoT Cloud](https://create.arduino.cc/iot).
Multi Arduino Accounts are allowed.

## Installation
Install node-red-contrib-arduino-iot-cloud with:

`npm install @arduino/node-red-contrib-arduino-iot-cloud`

into your $HOME/.node-red directory or via node-red palette manager

## Configuration 
1. Obtain Client ID and Client Secret from the [things webpage](https://create.arduino.cc/iot/things) by clicking on *Add API*
2. Go to NodeRED web page
3. Select one Arduino node from the pallete and drag to a flow
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
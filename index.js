const transporters = require("./transporters.js");
const { NodeBridgeClient } = require("./client.js");
const servers = require("./servers.js")
const utils = require("./utils.js");

class NodeBridge {
    constructor() {

    }

    connect() {

    }
}

function python(host="localhost", port=7000) {
    const server = new servers.PyBridgeServer(new transporters.SocketBridgeTransporter(host, port));
    const py = server.start();
    return py;
}

// let bridge = new NodeBridge();
// let py_server = new PyBridgeServer(mixin=StdIOBridgeTransporter);

// let py = bridge.connect(py_server);

// py.print("Hello From Python");

// py.exit();

module.exports = {
    NodeBridge,
    NodeBridgeClient,
    python,
    ...utils,
    ...servers,
    ...transporters
}

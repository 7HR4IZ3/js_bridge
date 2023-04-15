const fs = require("fs");
const net = require("net");
const { spawn } = require('child_process');

try {
	WebSocket
} catch(err) {
	let WebSocket = require("ws")
}

class BaseBridgeTransporter {

	start(on_message, server) {
		this.on_message = on_message
		this.bridge = server
		this.setup() 
	}

	setup() {}

	decode(data, raw=false) {
		return (!raw) ? JSON.parse(data, this.bridge.decoder.bind(this.bridge)) : JSON.parse(data)
	}

	encode(data, raw=false) {
		// console.log("[JS] Encoding:", data)
		return (!raw) ? JSON.stringify(data, this.bridge.encoder.bind(this.bridge)) : JSON.stringify(data)
	}

}

class ProcessBasedTransporter extends BaseBridgeTransporter {
    start_process(server) {
        let args = this.get_setup_args(server.args || [], {})
        this.controller = new AbortController();
		const { signal } = this.controller;

        this.process = spawn(
        	args[0], args.slice(1), { signal, stdio: ['pipe', process.stdout, process.stderr] }
        )
    }

    stop_process() {
        this.controller.abort();
    }

    start(on_message, server) {
        super.start(on_message, server)
        this.start_process(server)
    }

    stop() {
        this.stop_process()
    }
}


class StdIOBridgeTransporter extends BaseBridgeTransporter {
	start_client(on_message, options, bridge) {
		this.listening = true;
		this.on_message = on_message;
		this.bridge = bridge;

		this.stdin = options.stdin;
		this.stdout = options.stdout;
		this.start_listening()
	}

	send(data, raw=false) {
		data = this.encode(data, raw)
		// console.log("[JS] Sent:", data);
        fs.writeFileSync(this.stdout, data, "utf-8");
	}

	start_listening(mode="listening") {
		let target;
		if (mode == "listening") target = this.stdin
		else target = this.stdout

		// console.log("[JS] Started listening");

		// while (this.listening) {
		// 	let data = fs.readFileSync(this.stdin).toString();
		// 	if (data) {
		// 		console.log("[JS} Recieved:", data);
		// 		this.on_message(this.decode(data, true))
		// 		fs.writeFileSync(this.stdin, "", "utf-8");
		// 	}
		// }

		setInterval(() => {
			let data = fs.readFileSync(this.stdin, "utf-8");
// 			console.log("Data:",data)
			if (data) {
				// console.log("[JS} Recieved:", data);
				this.on_message(this.decode(data))
				fs.writeFileSync(this.stdin, "", "utf-8");
			}
		}, 100)
	}
}

class SocketBridgeTransporter extends ProcessBasedTransporter {
	constructor(host="localhost", port=7000) {
		super();

		this.host = host
		this.port = port
		this.tasks = [];
		this.socket = null;
	}

	get_setup_args(args, kwargs) {
		return [...args,
				"--mode", "socket",
				"--host", this.host,
				"--port", String(this.port)
			]
	}

	setup() {
		let _this = this;
		this.sock_server = net.createServer((socket) => {
		  _this.socket = socket;
		  for (let data of _this.tasks) {
		 	_this.socket.write(data+"\n")
		  }
		  _this.start_listening()
		}).on('error', (err) => {
		  // Handle errors here.
		  throw err;
		});

		this.socket_controller = new AbortController();
		this.sock_server.listen({
		  host: this.host,
		  port: this.port,
		  signal: this.socket_controller.signal
		});
	}

    start_client(on_message, options, bridge) {
		this.listening = true;
		this.on_message = on_message;
		this.bridge = bridge;

		this.host = options.host || "localhost";
		this.port = options.port || 7000;
		
		this.socket = net.connect({
		    port: this.port,
		    host: this.host
		})
		let _this = this;
		this.socket.on("ready", () => {
			for (data of _this.tasks) {
				_this.socket.write(data+"\n")
			}
		})
		this.start_listening()
	}

	send(data, raw=false) {
		data["response_type"] = "bridge_response"
	    // console.log("[JS} To Send:", data);
	    data = this.encode(data, raw)
		// console.log("[JS} Sent:", data);
	    if (this.socket) {
	   	    this.socket.write(data+"\n")
	    } else {
	    	this.tasks.push(data)
	    }
	}

	start_listening() {
	    this.socket.on('data', (data) => {
	        data = data.toString()
	        for (let item of data.split("\n")) {
		        item = item.trim();
		        if (item) {
    		      // console.log("[JS} Recieved:", item);
		        	this.on_message(this.decode(item));
		        }
	        }
	    })
	}

	stop() {
		this.socket_controller.abort();
		this.sock_server.unref()
		super.stop()
	}
}

class WebSocketBridgeTransporter extends BaseBridgeTransporter {
	start_client(on_message, options, bridge) {
		this.listening = true;
		this.on_message = on_message;
		this.bridge = bridge;

		this.host = options.host || "localhost";
		this.port = options.port || 7001;

		this.socket = new WebSocket(`ws://${this.host}:${this.port}`)

		this.start_listening()
	}

	send(data, raw=false) {
	   // console.log("[JS} To Send:", data);
	    data = this.encode(data, raw)
	   // console.log("[JS} Sent:", data);
	    this.socket.send(data+"\n")
	}

	start_listening() {
	    this.socket.onmessage = (ev) => {
	        let data = ev.data
			let _this = this;

	        function main(data) {
		    	// console.log("[JS} Recieved:", data);
	        	for (let item of data.split("\n")) {
			        item = item.trim();
			        if (item) {
	    		       // console.log("[JS} Recieved:", item);
			        	_this.on_message(_this.decode(item));
			        }
		        }
	        }

	        if (data instanceof Blob) {
	        	data.text().then(main)
	        } else {
		        main(data)
	        }

	    }
	}
}


class SocketIOBridgeTransporter extends BaseBridgeTransporter {
    constructor(host='127.0.0.1', port=7001) {
        this.host = host
        this.port = port
        this.socket = null
        this.listening = true
        this.tasks = []
    }

    get_setup_args(args, kw) {
        return [args, kw]
    }

    send(data, raw=false) {
        data = this.encode(data, raw)
        if (this.socket) {
            try {
                this.socket.emit("message", data + "\n")
            }
            catch (err) {
                this.listening = false
            }
        } else {
            this.tasks.append(data)
        }
    }

    setup_app() {
   		const http = require('http');
		const server = http.createServer();
		const { Server } = require("socket.io");
		const io = new Server(server);

		let _this = this; 

		io.on('connection', (socket) => {
			_this.socket = socket;
		 	socket.on('message', (data) => {
				// data = data.toString()
		        for (let item of data.split("\n")) {
			        item = item.trim();
			        if (item) {
	    		     	// console.log("[JS} Recieved:", item);
			        	this.on_message(this.decode(item));
			        }
		        }
			});
		});

		server.listen(3000, () => {
		  console.log('listening on *:3000');
		});
    }

    setup() {
        this.setup_app()
    }

    start_client(on_message, options=null, server=null) {
        options = options || {}
        this.on_message = on_message
        this.server = server
        this.host = options.get("host", "localhost")
        this.port = options.get("port", 7000)

        this.setup_app()
    }
}


let transporters = {
	"stdio": StdIOBridgeTransporter,
	"socket": SocketBridgeTransporter,
	"websocket": WebSocketBridgeTransporter,
	"socketio": SocketIOBridgeTransporter
}

module.exports = {
	transporters,
	BaseBridgeTransporter,
	StdIOBridgeTransporter,
	SocketBridgeTransporter,
	WebSocketBridgeTransporter
}
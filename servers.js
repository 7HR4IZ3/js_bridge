const { BaseHandler } = require("./base.js");
const { BaseBridgeConnection, PyBridgeConnection } = require("./connection.js");
const { BaseBridgeProxy, BaseChainableBridgeProxy } = require("./proxies.js");
const { isRawObject } = require("./utils.js")

const util = require("util")

class BaseBridgeServer extends BaseHandler {
    args = [];
    import_alias = 'bridge';

    proxy = BaseBridgeProxy;
    connection = BaseBridgeConnection;

    constructor(transporter=null, keep_alive=false, timeout=5) {
        super();
        this.transporter = transporter || this.default_transporter()
        this.timeout = timeout

        this.__keep_alive = keep_alive
    }

    setup_imports(name) {
    }
        

    import_lib(name) {
        return
    }

    setup(name=null, ...a) {
        let conn = this.start(...a)
        this.setup_imports(name || this.import_alias)
        return conn
    }

    start(bridge=null, mode="chain") {
        this.bridge = bridge
        this.conn = this.create_connection(mode=mode)
        this.transporter.start(
            this.on_message.bind(this),
            this
        )
        return this.conn
    }

    create_connection(mode) {
        return this.connection(
            this.transporter,
            mode, this
        )
    }

    __keep_alive__() {
        this.__keep_alive = true
    }

    stop(force=false) {
        if (!(force && this.__keep_alive)) {
            return
        }
        this.transporter.stop()
    }
    
    async on_message(message) {
        if (message.action) {
            let response = await this.process_command(message)
            response.message_id = message.message_id
            return this.transporter.send(response)
        }
        else {
            let handler = this.message_handlers.get(message.message_id)
            if (handler) return handler(message)
            else {
                if (message.response) {
                    message = message.response
                }
                else if (message.value) {
                    message = message.value
                }
                return
            }
        }
        return
  }
  
  encoder(key, value) { 
    // let allow = false;
    // try {
    //     Number(key);
    //     allow = true;
    // } catch (err) {
    //   // console.log(err)
    // }

    // if (util.isArray(value)) {
    //   return value.map((val, ind) => {
    //     if (val) {
    //       return this.format_arg(val)
    //     } else {
    //       return val
    //     }
    //   });
    // }

    // if ((key !== "value" && key !== "response") || allow == false) {
    //   return value;
    // }

    // console.log(key, util.types.isProxy(value))

    //   console.log(key, value)
    if (util.types.isProxy(value) || value?.__bridge_proxy__) {
      return { type: "bridge_proxy", obj_type: "reverse_proxy", location: String(value.__data__.location), reverse: true };
    }

    if (isRawObject(value)) {
      return value;
    }

    return this.format_arg(value);
  }


  format_arg(value) {
    let location;
    let value_type = typeof value;

    if (value === null || value === undefined) {
      return null
    }

    if (util.types.isProxy(value) || value?.__bridge_proxy__) {
      return { type: "bridge_proxy", obj_type: "reverse_proxy", location: String(value.__data__.location), reverse: true };
    }

    if (value_type == "string") {
      try {
        let is_number;
        try {
          is_number = new Number(value);
        } catch (err) {}

        if (!is_number) {
          let t = new Date(value);
          location = this.proxy_object(t);
          return { type: "bridge_proxy", obj_type: "date", location: location };
        }
      } catch (err) {}
    }
    

    if (value_type === 'number' ||
      util.isArray(value) ||
      value_type === 'string' ||
      value_type == "boolean"
    ) {
        return value
      // return { type: "bridge_proxy", obj_type: "number", location: location };
    }

    location = this.proxy_object(value);

    if (util.isSymbol(value)) {
      return { type: "bridge_proxy", obj_type: "symbol", location: location };
    }


    if (util.isBuffer(value)) {
      return { type: "bridge_proxy", obj_type: "bytes", location: location }
    }

    if (util.types.isSet(value)) {
      return { type: "bridge_proxy", obj_type: "set", location: location };
    }

    if (util.isArray(value)) {
      return { type: "bridge_proxy", obj_type: "array", location: location };
    }

    if (value instanceof Event) {
      return { type: "bridge_proxy", obj_type: "event", location: location };
    }

    if (util.isFunction(value)) {
      return { type: "bridge_proxy", obj_type: "function", location: location };
    }

    if (util.types.isDate(value)) {
      return { type: "bridge_proxy", obj_type: "date", location: location };
    }

    return { type: "bridge_proxy", obj_type: value_type, location: location };
  }

}


class PyBridgeServer extends BaseBridgeServer {
    args = ["python", "-m", "py_bridge"]

    proxy = BaseChainableBridgeProxy
    connection = PyBridgeConnection
}


class RubyBridgeServer extends BaseBridgeServer {
    
}


class JavaBridgeServer extends BaseBridgeServer {
    
}


class CSharpBridgeServer extends BaseBridgeServer {
    
}


class GoLangBridgeServer extends BaseBridgeServer {
    
}


module.exports = {
   BaseBridgeServer,
   PyBridgeServer,
   RubyBridgeServer,
   JavaBridgeServer,
   CSharpBridgeServer,
   GoLangBridgeServer
}
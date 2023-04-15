const { BaseHandler } = require("./base.js");
const { transporters } = require("./transporters.js");
// const { BaseBridgeProxy } = require("./proxies.js");
// const { BaseBridgeConnection } = require("./connection.js");
// const { proxymise } = require("./utils.js")
const util = require("util")


class NodeBridgeClient extends BaseHandler {
  constructor(options) {
    super()
    this.options = options || {};
  }

  start() {
    let transporter = transporters[this.options.mode];
    if (!transporter) {
      throw new Error("ArgumentError: Invalid mode specified.");
    }

    this.transporter = new transporter();
    this.transporter.start_client(
      this.on_message.bind(this),
      this.options,
      this
    );
  }

  format_arg(value) {
    let location;
    let value_type = typeof value;

    if (util.isNullOrUndefined(value)) {
      return null
    }

    if (value_type == "function" && (value?.name === "__proxy__bridge__target__" || value?.name === "bound __proxy__bridge__target__")) {
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

    if (util.isNumber(value)) {
      return { type: "bridge_proxy", obj_type: "number", location: location };
    }

    if (util.isBuffer(value)) {
      return { type: "bridge_proxy", obj_type: "bytes", location: location }
    }

    if (util.isString(value)) {
      return { type: "bridge_proxy", obj_type: "string", location: location };
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

    if (util.isDate(value)) {
      return { type: "bridge_proxy", obj_type: "date", location: location };
    }
    
    if (value_type == 'object') {
        value_type = '';
    }

    return { type: "bridge_proxy", obj_type: value_type, location: location };
  }
}

module.exports = {
  NodeBridgeClient,
};

const { PyProxy, proxymise, makeProxyClass } = require("./utils.js")
const util = require("util")

const BaseBridgeProxyHandler = {
    get: function(target, property) {
      // console.log("Getting prop:", property, target)

      if (target[property] || property == "then") {
        return target[property]
      }

      if (property == "cls") {
        return makeProxyClass(target.$$main)
      }

      if (property == "$") {
        return target.__conn__.formatters.callable_proxy(property, target.__data__, true)
      }

      let ret = new Promise((resolve, _reject) => {
        if (property === 'then') {
          return resolve(target.then);
        } else if (property === 'catch') {
          return resolve(target.catch);
        }

        if (property === "toJSON" || property == "constructor") {
          return target[property];
        }

        target.__conn__.recieve({
            // session: PAGEID,
            action: "get_proxy_attribute",
            target: typeof property == 'string' ? (property.endsWith("$") ? property.substring(0, property.length -1) : property) : property,
            location: target.__data__.location,
          })
          .then((result) => {
            // console.log(property, "Result: ", result);
            try {
              if (property.endsWith("$") && result.__data__) {
                return resolve(target.__conn__.formatters.callable_proxy(null, result.__data__, true)); 
              }
              // result = target.__conn__.get_result(result, property);
               // console.log("Resolving:", result)
              resolve(result);
            } catch (error) {
              return undefined;
            }

            // if (result == undefined) {
            //   if (property !== "then") {
            //     return reject("No attribute name: " + property);
            //   }
            // } else {
            // }
          });
      });
      if (ret) {
        ret = proxymise(ret);
      }
      return ret;
    },
    set: function(target, property, value) {
      if (property === "__proxy__") {
        target.__proxy__ = value;
        return true;
      }
      return proxymise(new Promise((resolve, _reject) => {
        target.__conn__.recieve({
            // session: PAGEID,
            action: "set_proxy_attribute",
            target: property,
            location: target.__data__.location,
            value: target.__conn__.format_arg(value),
          })
          .then((result) => resolve(result.value));
      }));
    },
    ownKeys: function(target) {
      return proxymise(new Promise((resolve, _reject) => {
        target.__conn__.recieve({
            // session: PAGEID,
            action: "get_proxy_attributes",
            location: target.__data__.location,
          })
          .then((result) => {
            resolve(Object.keys(result.value));
          });
      }));
    },
    deleteProperty: function(target, prop) {
      // to intercept property deletion
      return (new Promise((resolve, _reject) => {
        target.__conn__.recieve({
            // session: PAGEID,
            action: "delete_proxy_attribute",
            target: prop,
            location: target.__data__.location,
          })
          .then((result) => resolve(result.value));
      }));
    },
    has: function(target, prop) {
      return (new Promise((resolve, _reject) => {
        target.__conn__.recieve({
            // session: PAGEID,
            action: "has_proxy_attribute",
            target: prop,
            location: target.__data__.location
          })
          .then((result) => resolve(result.value));
      }));
    },
    apply: function(target, _thisArg, args) {
      return new Promise((resolve, _reject) => {
        target.__conn__.recieve({
          // session: PAGEID,
          action: "call_proxy",
          location: target.__data__.location,
          args: (args),
        })
        .then((result) => {
            // console.log("Calling proxy and returning:", target.__conn__.get_result(result));
            resolve(result)
          });
      });
    },
    construct: function(target, args) {
      return proxymise(new Promise((resolve, _reject) => {
        target.__conn__.recieve({
            // session: PAGEID,
            action: "call_proxy",
            location: target.__data__.location,
            args: (args),
          })
          .then((result) => resolve((result)));
      }));
    }
}

// Stolen from JSBridge.
class Intermediate extends Function {
  constructor (callstack, data) {
    super()
    this.callstack = [...callstack]
    this.data = data;
    this.__bridge_proxy__ = true;
    this.$$repr = ""
    this.keys = Reflect.ownKeys(this);
    this[util.inspect.custom];
  }

  // [util.inspect.custom] () {
  //   let _this = this;
  //   this.data.server.conn.repr(new Proxy(this, {})).then(res => {
  //     _this.$$repr = res;
  //   })
  //   return this.repr
  // }
}
// End

const BaseChainableBridgeProxyHandler = {
  get: function(target, property) {
    // console.log("Getting prop:", property);

    if (target[property]) return target[property]

    if (property === "__bridge_data__") {
      return target.data.data;
    }
    
    if (property === "__bridge_proxy__") {
      return true;
    }

    if ((typeof property == "string" && property.endsWith("$$")) || property === "prototype") {
      const next = new Intermediate(target.callstack, target.data);
      if (!(property === "$$")) {
        next.callstack.push(property.slice(0, -2))
      }
      let ret = makeProxyClass(new Proxy(next, BaseChainableBridgeProxyHandler))
      if (property == "prototype") {
        return ret.prototype
      }
      return ret
    }
    
    if (property == "toJSON") {
      return () => ({ type: "bridge_proxy", obj_type: "reverse_proxy", location: target.data.data.location, reverse: true, stack: target.callstack })
    }

    if (property == "then") {
      if (target.callstack.length) {
        return (resolve, reject) => {
          target.data.server.recieve({
            // session: PAGEID,
            action: "get_stack_attribute",
            stack: target.callstack,
            location: target.data.data.location,
          })
          .then(resolve).catch(reject);
        };
      } else {
        return undefined
      }
    }

    if (typeof property === 'symbol') {
      if (property === Symbol.iterator) {
        // This is just for destructuring arrays
        return function * iter () {
          for (let i = 0; i < 100; i++) {
            const next = new Intermediate([...target.callstack, i])
            yield new Proxy(next, BaseChainableBridgeProxyHandler)
          }
          throw SyntaxError('You must use `for await` when iterating over a Python object in a for-of loop')
        }
      }
      if (property === Symbol.asyncIterator) {
        return async function * iter () {
          const it = await self.call(0, ['Iterate'], [{ ffid }])
          while (true) {
            const val = await it.Next()
            if (val === '$$STOPITER') {
              return
            } else {
              yield val
            }
          }
        }
      }
      // log('Get symbol', next.callstack, property)
      return
    }
    if (Number.isInteger(parseInt(property))) property = parseInt(property)
    const next = new Intermediate(target.callstack, target.data);
    next.callstack.push(property)
    return new Proxy(next, BaseChainableBridgeProxyHandler);
  },

  set: function(target, property, value) {
    return new Promise((resolve, reject) => {
      target.data.server.recieve({
        // session: PAGEID,
        action: "set_stack_attribute",
        stack: target.callstack,
        location: target.data.data.location,
        value: value
      })
      .then(resolve).catch(reject);
    });
  },
  ownKeys: function(target) {
      target.data.server.recieve({
        // session: PAGEID,
        action: "get_stack_attributes",
        stack: target.callstack,
        location: target.data.data.location,
      })
      .then(data => {
          target.keys = data;
      })
    return [...new Set([...Reflect.ownKeys(target),  ...target.keys])];
  },
  deleteProperty: function(target, prop) {
    // to intercept property deletion
    return (new Promise((resolve, _reject) => {
      target.data.server.recieve({
          // session: PAGEID,
          action: "delete_proxy_attribute",
          target: prop,
          location: target.__data__.location,
        })
        .then((result) => resolve(result.value));
    }));
  },
  has: function(target, prop) {
    return (new Promise((resolve, _reject) => {
      target.data.server.recieve({
          // session: PAGEID,
          action: "has_proxy_attribute",
          target: prop,
          location: target.__data__.location
        })
        .then((result) => resolve(result.value));
    }));
  },
  apply: function(target, _thisArg, args) {
    // console.log("Calling:", target.callstack)
    return new Promise((resolve, reject) => {
      let final = target.callstack[target.callstack.length - 1]
      let kwargs = {};
      let isolate =false;

      if (final === 'apply') {
        target.callstack.pop()
        args = [args[0], ...args[1]]
      } else if (final === 'call') {
        target.callstack.pop()
      } else if (final?.includes('$')) {
        kwargs = args.pop()
        
        if (final === "$") {
          target.callstack.pop();
        } else  {
            if (final?.startsWith('$')) {
              isolate = true;
              final = final.slice(1)
              target.callstack[target.callstack.length - 1] = final
            }
            if (final?.endsWith('$')) {
              target.callstack[target.callstack.length - 1] = final.slice(0, -1)
            }
        }
      }
      // } else if (final === 'valueOf') {
      //   target.callstack.pop()
      //   const ret = this.value(ffid, [...target.callstack])
      //   return ret
      // } else if (final === 'toString') {
      //   target.callstack.pop()
      //   const ret = this.inspect(ffid, [...target.callstack])
      //   return ret
      // }

      target.data.server.recieve({
        // session: PAGEID,
        action: "call_stack_attribute",
        stack: target.callstack,
        location: target.data.data.location,
        args: args,
        kwargs: kwargs,
        isolate
      })
      .then(resolve).catch(reject);
  
      target.callstack = [];
      return
    });
  },
  construct: function(target, args) {
    // console.log("Construct:", target.callstack)
    let final = target.callstack[target.callstack.length - 1]
    let kwargs = {};
    let isolate = false;

    if (final === 'apply') {
      target.callstack.pop()
      args = [args[0], ...args[1]]
    } else if (final === 'call') {
      target.callstack.pop()
    } else if (final?.includes('$')) {
      kwargs = args.pop()

      if (final === "$") {
        target.callstack.pop();
      } else  {
        if (final?.startsWith('$')) {
          isolate = true;
          final = final.slice(1)
          target.callstack[target.callstack.length - 1] = final
        }
        if (final?.endsWith('$')) {
          target.callstack[target.callstack.length - 1] = final.slice(0, -1)
        }
      }
    }

    return new Promise((resolve, reject) => {

      target.data.server.recieve({
        action: "call_stack_attribute",
        stack: target.callstack,
        location: target.data.data.location,
        args: args,
        kwargs: kwargs,
        isolate
      })
      .then(resolve).catch(reject);
  
      target.callstack = [];
      return
    });
  }
}


class BaseBridgeProxy extends Function {
    constructor(conn, data, handler=BaseBridgeProxyHandler) {
      super()
      this.__conn__ = conn;
      this.__data__ = data;
      this.__bridge_proxy__ = true;
      return new Proxy(this, handler);
    }
}

// const BaseBridgeProxy = (conn, data, handler=BaseBridgeProxyHandler) => {
// 	let __proxy__bridge__target__ = function(){}
// 	__proxy__bridge__target__.__conn__ = conn;
// 	__proxy__bridge__target__.__data__ = data;
//   __proxy__bridge__target__.__bridge_proxy__ = true;
//   __proxy__bridge__target__[Symbol.toPrimitive] = __proxy__bridge__target__
//   return new Proxy(__proxy__bridge__target__, handler);
// }


class BaseChainableBridgeProxy extends Function {
    constructor(conn, data, handler=BaseChainableBridgeProxyHandler) {
      super()
      if (conn instanceof Array) {
        this.callstack = conn;
        this.data = data;
      } else {
        this.callstack = [];
        this.data = {
          server: conn,
          data: data
        };
      }
      this.keys = Reflect.ownKeys(this);
      this.__bridge_proxy__ = true;
      this.data.$$main  = new Proxy(this, handler);
      return this.data.$$main
    }
}

// const BaseChainableBridgeProxy = (conn, data, handler=BaseChainableBridgeProxyHandler) => {
//   return new Proxy(new Intermediate([], {
//     server: conn,
//     data: data
//   }), handler);
// }

// class BaseBridgeProxy {
//     constructor(connection, data) {
//         this.__conn__ = connection
//         this.__data__ = data
//     }

//     // __cast__(target=String):
//     //     return target(this.__conn__.recieve(
//     //         action="get_primitive",
//     //         location=this.__data__['location']
//     //     ))

//     __call__(...args) {
//         return this.__conn__.recieve(
//             action="call_proxy",
//             location=this.__data__['location'],
//             args=this.__conn__.format_args(args),
//             kwargs={}
//         )
//     }

//     __getattr__(name) {
//         return this.__conn__.recieve(
//             action="get_proxy_attribute",
//             location=this.__data__['location'],
//             target=name
//         )
//     }

//     __setattr__(name, value) {
//         return this.__conn__.recieve(
//             action="set_proxy_attribute",
//             location=this.__data__['location'],
//             target=name,
//             value=this.__conn__.format_args(value)
//         )
//     }

//     // __getitem__(index):
//     //     return this.__conn__.recieve(
//     //         action="get_proxy_index",
//     //         location=this.__data__['location'],
//     //         target=index
//     //     )


//     // __str__(this):
//     //     return this.__cast__()
// }


// class PyBridgeProxy extends BaseBridgeProxy {

// }


// class RubyBridgeProxy extends BaseBridgeProxy {

// }


// class JavaBridgeProxy extends BaseBridgeProxy {

// }


// class CSharpBridgeProxy extends BaseBridgeProxy {

// }


// class GoLangBridgeProxy extends BaseBridgeProxy {

// }

function generateProxy(_class) {
	return PyProxy(_class)
}


module.exports = {
	BaseBridgeProxy,
  BaseChainableBridgeProxy
	// generateProxy,
	// PyBridgeProxy,
	// GoLangBridgeProxy,
	// JavaBridgeProxy,
	// RubyBridgeProxy
}
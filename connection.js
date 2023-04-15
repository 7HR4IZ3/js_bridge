const { proxymise, isRawObject } = require("./utils.js")
const util = require("util")


const BaseBridgeConnectionHandler = {
    get: function(target, prop) {
        return target.data.server.recieve({action: "evaluate", value: prop})
    }
}

class Intermediate extends Function {
    constructor (callstack, data) {
      super()
      this.callstack = [...callstack]
      this.data = data;
    }
  
    [util.inspect.custom] () {
      return '\n[You must use await when calling a Python API]\n'
    }
}

const BaseChainableBridgeConnectionHandler = {
    get: function(target, prop) {
      const next = new Intermediate(target.callstack, target.data)
  
      if (prop == "then") {
        return (resolve, reject) => {
          target.data.server.recieve({
              // session: PAGEID,
              action: "evaluate_stack_attribute",
              stack: target.callstack
            })
            .then(resolve).catch(reject);
        };
      }
  
      if (typeof prop === 'symbol') {
        if (prop === Symbol.iterator) {
          // This is just for destructuring arrays
          return function * iter () {
            for (let i = 0; i < 100; i++) {
              const next = new Intermediate([...target.callstack, i])
              yield new Proxy(next, handler)
            }
            throw SyntaxError('You must use `for await` when iterating over a Python object in a for-of loop')
          }
        }
        if (prop === Symbol.asyncIterator) {
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
        // log('Get symbol', next.callstack, prop)
        return
      }
      if (Number.isInteger(parseInt(prop))) prop = parseInt(prop)
      next.callstack.push(prop)
      return new Proxy(next, BaseChainableBridgeConnectionHandler);
    },
    apply: function(target, _thisArg, args) {
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
            // location: target.data.data.location,
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

const BaseBridgeConnection = (transporter, mode="auto_eval", server=null, handler=BaseBridgeConnectionHandler) => {
    let __bridge__target__ = function(){}
    __bridge__target__.data = {
        transporter,
        mode, server
    };
    __bridge__target__.__bridge_proxy__ = true;
    let ret = new Proxy(__bridge__target__, handler);
    return ret;
}

const BaseChainableBridgeConnection = (transporter, mode="auto_eval", server=null, handler=BaseChainableBridgeProxyHandler) => {
    return new Proxy(new Intermediate([], { transporter, mode, server }), handler)
}

const py_handlers = {
    "import": async function(...targets) {
        let _this = this;

        async function main(targets, prefix=null) {
            let ret = [];
            if (!Array.isArray(targets)) {
                targets = [targets]
            }

            for (let target of targets) {
                if (isRawObject(target)) {
                    let retr = {};
                    for (let item in target) {
                        let r = await main(target[item], (item.endsWith(".") || item.endsWith(":")) ? item : item + ":");
                        if (Array.isArray(target[item])) {
                            let rr = {};
                            target[item].forEach((item,i) => {
                                rr[item] = r[i];
                            }) 
                            retr = rr;
                        } else {
                            retr[target[item]] = r;
                        }
                    }
                    ret.push(retr);
                }
                else {
                    ret.push(await _this.data.server.recieve({action: "import", value: prefix ? prefix + target : target}))
                }
            }
            return (ret.length === 1 ? ret[0] : ret);
        }

        return await main(targets)
    },
    $: async function(tokens, ...replacements) {
        const vars = {} // List of locals
        let nstr = ''
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const repl = await replacements[i]
            if (repl != null) {
                const v = '__' + i
                vars[v] = (repl.__bridge_proxy__ ? ({ location: repl.__bridge_data__.location }) : repl)
                nstr += token + v
            } else {
                nstr += token
            }
        }
        return await this.data.server.recieve({action: "evaluate_code", code: nstr, locals: vars});
    },
    tuple: async (...args) => {
        return await target.data.server.recieve({action: "evaluate", value: prop})
    }
}

const PyBridgeConnectionHandler = {
    get: function(target, prop) {
        if (py_handlers[prop]) {
            return py_handlers[prop].bind(target)
        }
        else {
            return BaseBridgeConnectionHandler.get(target, prop);
        }
    },
    apply: async function(target, thisArg, args) {
        let [tokens, ...replacements] = args;

        const vars = {} // List of locals
        let nstr = ''
        for (const token of tokens) {
            const repl = await replacements[i]
            if (repl != null) {
                const v = '__' + i
                vars[v] = (repl.__bridge_proxy__ ? ({ location: repl.__bridge_data__.location }) : repl)
                nstr += token + v
            } else {
                nstr += token
            }
        }
        return target.data.server.recieve({action: "evaluate_code", code: nstr, locals: vars});
    }
}

const PyChainableBridgeConnectionHandler = {
    get: function(target, prop) {
        if (py_handlers[prop]) {
            return py_handlers[prop].bind(target)
        }
        else {
            return BaseChainableBridgeConnectionHandler.get(target, prop);
        }
    },
    ttapply: async function(target, thisArg, args) {
        let [tokens, ...replacements] = args;

        const vars = {} // List of locals
        let nstr = ''
        for (const token of tokens) {
            const repl = await replacements[i]
            if (repl != null) {
                const v = '__' + i
                vars[v] = (repl.__bridge_proxy__ ? ({ location: repl.__bridge_data__.location }) : repl)
                nstr += token + v
            } else {
                nstr += token
            }
        }
        return target.data.server.recieve({action: "evaluate_code", code: nstr, locals: vars});
    }
}

const PyBridgeConnection = (transporter, mode="auto_eval", server=null) => {
    if (mode == "auto_eva") {
        return BaseBridgeConnection(transporter, mode, server, PyBridgeConnectionHandler);
    } else {
        return BaseChainableBridgeConnection(transporter, mode, server, PyChainableBridgeConnectionHandler);
    }
}

module.exports = {
    BaseBridgeConnection,
    BaseBridgeConnectionHandler,
    BaseChainableBridgeConnection,
    BaseChainableBridgeConnectionHandler,
    PyBridgeConnection,
    PyBridgeConnectionHandler
}

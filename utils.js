const util = require("util")

const PyHandlers = {
  get: function (target, property) {
    if (target.__getattribute__) {
      return target.__getattribute__.call(target, property, value);
      }
    if (target[property]) {
      return target[property]
    }
    return target.__getattr__?.call(target, property);
  },
  set: function (target, property, value) {
    if (target.__setattr__) {
      return target.__setattr__.call(target, property, value);
    }
    target[property] = value;
  return true
  },
  ownKeys: function (target) {
    return target.__dir__?.call(target, prop) || [];
  },
  deleteProperty: function (target, prop) {
    return target.__delattr__?.call(target, prop);
  },
  has: function (target, prop) {
    return target.__hasattr__?.call(target, prop);
  },
  apply: function (target, _thisArg, args) {
    return target.__call__?.call(target, ...args);
  },
  construct: function (target, args) {
    console.log("Construct called.")
    return target.__construct__?.call(target, ...args);
  }
}

class BaseProxy extends Function {
  constructor(...args) {
    super();
    if (args.length == 1 && isRawObject(args[0])) {
      this.$$super_args = args[0].args
      this.$$super_kwargs = args[0].kwargs
    } else {
      this.$$super_args = args
      this.$$super_kwargs = {}
    }
    // this.__init__ && this.__init__(...args);

    return new Proxy(this, PyHandlers);
  };
}

// function makeProxyClass(target) {
//   class PyClassProxy extends BaseProxy {
//     __init__(...args) {
//       this.$$parent = target(...args);
//       this.$$parent.then(res => {this.$$parent = res});

//       this.getParent = async function () {
//         if (util.types.isPromise(this.$$parent)) {
//           this.$$parent = await this.$$parent;
//         }
//         return this.$$parent;
//       }
//     }

//     async __call__(...args) {
//       return await(await this.getParent()).__call__(...args)
//     }

//     async __getattr__(name) {
//       console.log("Getatta", name, await this.getParent())
//       return await ((await this.getParent())[name]);
//     }

//     async __setattr__(name, value) {
//       return await ((await this.getParent())[name] = value);
//     }

//     async __delattr__(name) {
//       return await (delete (await this.getParent())[name]);
//     }

//     async __hasattr__(name) {
//       return await (name in (await this.getParent()))
//     }

//     async __dir__() {
//       return Reflect.ownKeys(await this.getParent());
//     }
//   }
//   return PyClassProxy;
// }

class PyProxy extends BaseProxy {
  async __init__(parent) {
    this.$$parent = await parent.$(...this.$$super_args, this.$$super_kwargs)
  }

  __getattr__(name) {
    return this[name] || this.$$parent[name];
  }
}

function makeProxyClass(parent) {
  class ProxyClass extends BaseProxy {
    $ = null;

    __getattr__(name) {
      if (name === "then" && !(this.$)) {
        let _this = this;
        return (resolve, reject) => {
          // _this.$ && resolve(_this);
          parent.$(...this.$$super_args, this.$$super_kwargs).then(p => {
            _this.$ = p;
            let ret = new Proxy(_this, PyHandlers);
            if (_this.__init__) {
              _this.__init__.call(ret).then(() => resolve(ret))
            } else {
              resolve(ret);
            }
          });
        }
      }
      if (this[name]) {
        return this[name]
      }
      return this.$[name];
    }

    __call__() {
      return this.$;
    }
  }
  return ProxyClass;
}

function makeProxyClassMain(target) {
  class PyClassProxy extends BaseProxy {
    __call__(...args) {
      return target(...args)
    }
    __getattr__(name) {
      return target[name];
    }
    __setattr__(name, value) {
      return (target[name] = value);
    }
    __delattr__(name) {
      return delete target[name];
    }
    __hasattr__(name) {
      return (name in target)
    }
    __dir__() {
      return Reflect.ownKeys(target);
    }
  }
  return PyClassProxy;
}

// class BProxy extends PyProxy {}

// let p = new BProxy();
// p();
// p.age2 = 4
// console.log(p.age2)


let handlers = {
  construct(target, argumentsList) {
    if (target.__is_proxy__) target = target();
    return proxymise(Reflect.construct(target, argumentsList));
  },

  get(target, property, receiver) {
    if (target.__is_proxy__) target = target();
    // console.log("Getting:", target, property)
    if (property !== 'then' && property !== 'catch' && typeof target.then === 'function') {
      return proxymise(target.then(value => get(value, property, receiver)));
    }
    return proxymise(get(target, property, receiver));
  },

  apply(target, thisArg, argumentsList) {
    if (target.__is_proxy__) target = target();
    // console.log("Calling:", target, thisArg)
    if (typeof target.then === 'function') {
      return proxymise(target.then(value => {
        console.log(value);
        return Reflect.apply(value, thisArg, argumentsList)
      }));
    }
    return proxymise(Reflect.apply(target, thisArg, argumentsList));
  }
}

function proxymise(target) {
  // console.log('Proxymising:', target)
  if (!util.types.isPromise(target)) return target;

  let ret;
  if ((typeof target === 'object' && !target?.__bridge_proxy__)) {
    const proxy = () => target;
    proxy.__is_proxy__ = true;
    ret = new Proxy(proxy, handlers);
  } else {
    if (typeof target === 'function') {
      ret = new Proxy(target, handlers);
    } else {
      return target
    }
    ret.__proxymised__ = true;
  }
  return ret;
};

function get(target, property, receiver) {
  // console.log("Gettingng:", target, property)
  const value = (typeof target === 'object') ? Reflect.get(target, property, receiver) : target[property];
  if (typeof value === 'function' && typeof value.bind === 'function') {
    return Object.assign(value.bind(target), value);
  }
  return value;
};

function isRawObject(item) {
  return (item instanceof Object && item.constructor == Object().constructor)
}

module.exports = {
  makeProxyClass,
  BaseProxy,
  proxymise,
  PyProxy,
  isRawObject
}

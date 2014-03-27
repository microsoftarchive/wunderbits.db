!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var n;"undefined"!=typeof window?n=window:"undefined"!=typeof global?n=global:"undefined"!=typeof self&&(n=self),(n.wunderbits||(n.wunderbits={})).db=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
'use strict';

var BaseEmitter = _dereq_('./WBEventEmitter').extend({
  'mixins': [
    _dereq_('./mixins/WBDestroyableMixin'),
    _dereq_('./mixins/WBUtilsMixin'),
    _dereq_('./mixins/ObservableHashMixin')
  ]
});

module.exports = BaseEmitter;

},{"./WBEventEmitter":5,"./mixins/ObservableHashMixin":30,"./mixins/WBDestroyableMixin":32,"./mixins/WBUtilsMixin":35}],2:[function(_dereq_,module,exports){
'use strict';

var BaseSingleton = _dereq_('./WBSingleton').extend({
  'mixins': [
    _dereq_('./mixins/WBEventsMixin'),
    _dereq_('./mixins/WBBindableMixin'),
    _dereq_('./mixins/WBDestroyableMixin'),
    _dereq_('./mixins/WBUtilsMixin'),
    _dereq_('./mixins/ObservableHashMixin')
  ]
});

module.exports = BaseSingleton;

},{"./WBSingleton":8,"./mixins/ObservableHashMixin":30,"./mixins/WBBindableMixin":31,"./mixins/WBDestroyableMixin":32,"./mixins/WBEventsMixin":33,"./mixins/WBUtilsMixin":35}],3:[function(_dereq_,module,exports){
'use strict';

var inherits = _dereq_('./lib/inherits');
var extend = _dereq_('./lib/extend');
var clone = _dereq_('./lib/clone');
var createUID = _dereq_('./lib/createUID');
var fromSuper = _dereq_('./lib/fromSuper');

// Self-propagating extend function.
// Create a new class,
// that inherits from the class found in the `this` context object.
// This function is meant to be called,
// in the context of a constructor function.
function extendSelf (protoProps, staticProps) {
  /* jshint validthis:true */

  var parent = this;

  protoProps = protoProps || {};

  // extract mixins, if any
  var mixins = protoProps.mixins || [];
  delete protoProps.mixins;

  // create the derived class
  var child = inherits(parent, protoProps, staticProps);

  // apply mixins to the derived class
  var mixin;
  while (mixins.length) {
    mixin = mixins.shift();
    (typeof mixin.applyToClass === 'function') &&
      mixin.applyToClass(child);
  }

  // make the child class extensible
  child.extend = parent.extend || extendSelf;
  return child;
}

function WBClass (options) {

  var self = this;

  // Assign a unique identifier to the instance
  self.uid = self.uid || createUID();

  // save options, make sure it's at least an empty object
  self.options = options || self.options;

  // augment properties from mixins
  self.augmentProperties();

  // initialize the instance
  self.initialize.apply(self, arguments);

  // initialize all the mixins, if needed
  // don't keep this in the initialize,
  // initialize can be overwritten
  self.initMixins.apply(self, arguments);
}

var proto = {

  'initialize': function () {

    // Return self to allow for subclass to assign
    // super initializer value to self
    var self = this;
    return self;
  },

  // If any mixins were applied to the prototype, initialize them
  'initMixins': function () {

    var self = this;
    var initializers = fromSuper.concat(self, 'initializers');

    var initializer;
    while (initializers.length) {
      initializer = initializers.shift();
      (typeof initializer === 'function') &&
        initializer.apply(self, arguments);
    }
  },

  // If any proerties were defined in the mixins, augment them to the instance
  'augmentProperties': function () {

    var self = this;
    var properties = fromSuper.merge(self, 'properties');

    function augmentProperty (property, value) {

      var type = typeof value;

      if (type === 'function') {
        self[property] = value.call(self);
      }
      else if (type === 'object') {
        self[property] = clone(value, true);
      }
      else {
        self[property] = value;
      }
    }

    for (var key in properties) {
      augmentProperty(key, properties[key]);
    }
  }
};

extend(WBClass.prototype, proto);
WBClass.extend = extendSelf;

module.exports = WBClass;

},{"./lib/clone":12,"./lib/createUID":13,"./lib/extend":17,"./lib/fromSuper":19,"./lib/inherits":22}],4:[function(_dereq_,module,exports){
'use strict';

var WBClass = _dereq_('./WBClass');
var WBPromise = _dereq_('./WBPromise');
var assert = _dereq_('./lib/assert');
var toArray = _dereq_('./lib/toArray');

var states = {
  'pending': 0,
  'resolved': 2,
  'rejected': 4
};

var stateNames = {
  0: ['pending'],
  2: ['resolved', 'resolve'],
  4: ['rejected', 'reject']
};

var proto = {

  'constructor': function (context) {
    var self = this;
    self._context = context;
    self._state = states.pending;
    self._args = [];
    self.handlers = [];
  },

  'state': function () {
    var self = this;
    return stateNames[self._state][0];
  },

  'trigger': function (withContext) {

    var self = this;
    if (self._state === states.pending) {
      return;
    }

    var handlers = self.handlers, handle;
    while (handlers.length) {
      handle = handlers.shift();
      self.invoke(handle, withContext || self._context);
    }
  },

  'invoke': function (deferredResponse, withContext) {

    var self = this;
    var state = self._state;
    var context = deferredResponse.context || withContext || self;
    var args = deferredResponse.args;

    self._args.forEach(function (arg) {
      // send single arguments as the item, otherwise send it as an array
      args.push(arg);
    });

    var type = deferredResponse.type;
    var isCompleted = (type === 'then') ||
      (type === 'done' && state === states.resolved) ||
      (type === 'fail' && state === states.rejected);

    isCompleted && deferredResponse.fn.apply(context, args);
  },

  'promise': function () {
    var self = this;
    self._promise = self._promise || new WBPromise(this);
    return self._promise;
  }
};

['then', 'done', 'fail'].forEach(function (method) {
  proto[method] = function () {

    var self = this;

    // store references to the context, callbacks, and arbitrary arguments
    var args = toArray(arguments);
    var fn = args.shift();
    var context = args.shift();

    assert.function(fn, method + ' accepts only functions');

    self.handlers.push({
      'type': method,
      'context': context,
      'fn': fn,
      'args': args
    });

    // if the defered is not pending anymore, call the callbacks
    self.trigger();

    return self;
  };
});

// Alias `always` to `then` on Deferred's prototype
proto.always = proto.then;

function resolver (state, isWith, fnName) {
  return function complete () {

    var self = this;

    if (!(self instanceof WBDeferred)) {
      throw new Error(fnName + ' invoked with wrong context');
    }

    // can't change state once resolved or rejected
    if (self._state !== states.pending) {
      return self;
    }

    self._args = toArray(arguments);
    var context = isWith ? self._args.shift() : undefined;

    self._state = state;
    self.trigger(context);

    return self;
  };
}

[states.resolved, states.rejected].forEach(function (state) {
  var fnName = stateNames[state][1];
  proto[fnName] = resolver(state, false, fnName);
  proto[fnName + 'With'] = resolver(state, true, fnName);
});

var WBDeferred = WBClass.extend(proto);
module.exports = WBDeferred;

},{"./WBClass":3,"./WBPromise":7,"./lib/assert":11,"./lib/toArray":26}],5:[function(_dereq_,module,exports){
'use strict';

var WBEventEmitter = _dereq_('./WBClass').extend({
  'mixins': [
    _dereq_('./mixins/WBBindableMixin'),
    _dereq_('./mixins/WBEventsMixin')
  ]
});

module.exports = WBEventEmitter;

},{"./WBClass":3,"./mixins/WBBindableMixin":31,"./mixins/WBEventsMixin":33}],6:[function(_dereq_,module,exports){
'use strict';

var extend = _dereq_('./lib/extend');
var clone = _dereq_('./lib/clone');
var assert = _dereq_('./lib/assert');
var WBSingleton = _dereq_('./WBSingleton');

var WBMixin = WBSingleton.extend({

  // Apply the mixin to an instance of a class
  'applyTo': function (instance) {

    var behavior = clone(this.Behavior, true);

    // apply mixin's initialize & remove it from the instance
    var initializer;
    if (typeof behavior.initialize === 'function') {
      initializer = behavior.initialize;
      delete behavior.initialize;
    }

    // augment mixin's properties object into the instance
    var properties = behavior.properties;
    delete behavior.properties;

    // mixin the behavior
    extend(instance, behavior);

    // apply the initializer, if any
    initializer && initializer.apply(instance);

    // augment proerties to the instance
    properties && extend(instance, properties);

    return instance;
  },

  // Apply the mixin to the class directly
  'applyToClass': function (klass) {

    // validate class
    assert.class(klass, 'applyToClass expects a class');

    var proto = klass.prototype;
    var behavior = clone(this.Behavior, true);

    // cache the mixin's initializer, to be applied later
    var initialize = behavior.initialize;
    if (typeof initialize === 'function') {
      (!proto.hasOwnProperty('initializers')) && (proto.initializers = []);
      proto.initializers.push(initialize);
      delete behavior.initialize;
    }

    var properties = behavior.properties;
    delete behavior.properties;

    // extend the prototype
    extend(proto, behavior);

    // cache the properties, to be applied later
    (!proto.hasOwnProperty('properties')) && (proto.properties = {});
    properties && extend(proto.properties, properties);

    return klass;
  }
});

// The only real change from a simple singleton is
// the altered extend class method, which will save
// "mixinProps" into a specific member, for easy
// and clean application using #applyTo
WBMixin.extend = function (mixinProps, staticProps) {

  mixinProps || (mixinProps = {});
  staticProps || (staticProps = {});

  var current = clone(this.Behavior, true);
  staticProps.Behavior = extend(current, mixinProps);
  var mixin = WBSingleton.extend.call(this, staticProps);

  mixin.extend = WBMixin.extend;

  return mixin;
};

module.exports = WBMixin;

},{"./WBSingleton":8,"./lib/assert":11,"./lib/clone":12,"./lib/extend":17}],7:[function(_dereq_,module,exports){
'use strict';

var WBClass = _dereq_('./WBClass');

function proxy (name) {
  return function () {
    var deferred = this.deferred;
    deferred[name].apply(deferred, arguments);
    return this;
  };
}

var proto = {
  'constructor': function (deferred) {
    this.deferred = deferred;
  },

  'promise': function () {
    return this;
  },

  'state': function () {
    return this.deferred.state();
  }
};

[
  'done',
  'fail',
  'then'
].forEach(function (name) {
  proto[name] = proxy(name);
});

proto.always = proto.then;

module.exports = WBClass.extend(proto);

},{"./WBClass":3}],8:[function(_dereq_,module,exports){
'use strict';

var extend = _dereq_('./lib/extend');
var createUID = _dereq_('./lib/createUID');

function applyMixins (mixins, instance) {
  var mixin;
  while (mixins.length) {
    mixin = mixins.shift();
    (typeof mixin.applyTo === 'function') &&
      mixin.applyTo(instance);
  }
}

function extendSelf (staticProps) {
  /* jshint validthis:true */

  staticProps = staticProps || {};

  // extend from the base singleton
  var BaseSingleton = this || WBSingleton;

  // create a new instance
  Ctor.prototype = BaseSingleton;
  var singleton = new Ctor();

  // extract mixins
  var mixins = staticProps.mixins || [];
  staticProps.mixins = undefined;

  // apply mixins to the instance
  applyMixins(mixins, singleton);

  // append the static properties to the singleton
  extend(singleton, staticProps);

  // make the singleton extendable
  // Do this after applying mixins,
  // to ensure that no mixin can override `extend` method
  singleton.extend = extendSelf;

  // every signleton gets a UID
  singleton.uid = createUID();

  return singleton;
}

var Ctor = function () {};
Ctor.prototype = {
  'extend': extendSelf
};

var WBSingleton = new Ctor();
module.exports = WBSingleton;

},{"./lib/createUID":13,"./lib/extend":17}],9:[function(_dereq_,module,exports){
'use strict';

var WBClass = _dereq_('./WBClass');

var WBDestroyableMixin = _dereq_('./mixins/WBDestroyableMixin');
var originalDestroy = WBDestroyableMixin.Behavior.destroy;

var WBStateModel = WBClass.extend({

  'mixins': [
    _dereq_('./mixins/WBEventsMixin'),
    _dereq_('./mixins/WBStateMixin'),
    _dereq_('./mixins/WBBindableMixin'),
    WBDestroyableMixin
  ],

  'initialize': function (attributes) {

    var self = this;

    if (attributes) {
      self.attributes = attributes;
    }
  },

  'sync':  function (method, instance, options) {
    if (options && typeof options.success === 'function') {
      options.success();
    }
  },

  'fetch': function (options) {
    var self = this;
    var success = options.success;
    var model = this;
    options.success = function (resp) {
      if (!model.set(resp, options)) return false;
      if (success) success(model, resp, options);
      model.trigger('sync', model, resp, options);
    };
    return self.sync('read', self, options);
  },

  'save': function (key, val, options) {

    var self = this;
    if (!self.destroying) {
      // set the attributes
      self.set(key, val, options);
      // sync
      (typeof key === 'object') && (options = val);
      self.sync('update', self, options);
    }
    return self;
  },

  'destroy': function (options) {

    var self = this;
    if (!self.destroying) {
      self.destroying = true;
      originalDestroy.call(self, options);
      self.attributes = {};
      self.sync('delete', self, options);
    }
  }
});

module.exports = WBStateModel;

},{"./WBClass":3,"./mixins/WBBindableMixin":31,"./mixins/WBDestroyableMixin":32,"./mixins/WBEventsMixin":33,"./mixins/WBStateMixin":34}],10:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'lib': _dereq_('./lib'),
  'BaseEventEmitter': _dereq_('./BaseEventEmitter'),
  'BaseSingleton': _dereq_('./BaseSingleton'),
  'WBClass': _dereq_('./WBClass'),
  'WBDeferred': _dereq_('./WBDeferred'),
  'WBEventEmitter': _dereq_('./WBEventEmitter'),
  'WBMixin': _dereq_('./WBMixin'),
  'WBSingleton': _dereq_('./WBSingleton'),
  'WBStateModel': _dereq_('./WBStateModel'),
  'mixins': _dereq_('./mixins')
};

},{"./BaseEventEmitter":1,"./BaseSingleton":2,"./WBClass":3,"./WBDeferred":4,"./WBEventEmitter":5,"./WBMixin":6,"./WBSingleton":8,"./WBStateModel":9,"./lib":21,"./mixins":36}],11:[function(_dereq_,module,exports){
'use strict';

function assert (condition, message) {
  if (!condition) {
    throw new Error(message || '');
  }
}

var nativeIsArray = Array.isArray;
assert.empty = function (object, message) {
  var keys = nativeIsArray(object) ? object : Object.keys(object);
  assert(keys.length === 0, message);
};

assert.array = function (array, message) {
  assert(nativeIsArray(array), message);
};

assert.class = function (klass, message) {
  var proto = klass.prototype;
  assert(proto && proto.constructor === klass, message);
};

var types = [
  'undefined',
  'boolean',
  'number',
  'string',
  'function',
  'object'
];

function typecheck (type) {
  assert[type] = function (o, message) {
    assert(typeof o === type, message);
  };
}

while (types.length) {
  typecheck(types.shift());
}

module.exports = assert;
},{}],12:[function(_dereq_,module,exports){
'use strict';

var nativeIsArray = Array.isArray;

function cloneArray (arr, isDeep) {
  arr = arr.slice();
  if (isDeep) {
    var newArr = [], value;
    while (arr.length) {
      value = arr.shift();
      value = (value instanceof Object) ? clone(value, isDeep) : value;
      newArr.push(value);
    }
    arr = newArr;
  }
  return arr;
}

function cloneDate (date) {
  return new Date(date);
}

function cloneObject (source, isDeep) {
  var object = {};
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      var value = source[key];
      if (value instanceof Date) {
        object[key] = cloneDate(value);
      } else if (typeof value === 'object' && value !== null && isDeep) {
        object[key] = clone(value, isDeep);
      } else {
        object[key] = value;
      }
    }
  }
  return object;
}

function clone (obj, isDeep) {

  if (nativeIsArray(obj)) {
    return cloneArray(obj, isDeep);
  }

  return cloneObject(obj, isDeep);
}

module.exports = clone;

},{}],13:[function(_dereq_,module,exports){
'use strict';

function replacer (match) {
  var rand = Math.random() * 16 | 0;
  var chr = (match === 'x') ? rand : (rand & 0x3 | 0x8);
  return chr.toString(16);
}

function createUID (prefix) {
  var uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, replacer);
  return String(!prefix ? '' : prefix) + uid;
}

module.exports = createUID;

},{}],14:[function(_dereq_,module,exports){
'use strict';

var toArray = _dereq_('./toArray');
var delay = _dereq_('./delay');

function defer (fn) {
  var args = toArray(arguments);
  args[0] = 1;
  args.unshift(fn);
  return delay.apply(null, args);
}

module.exports = defer;

},{"./delay":15,"./toArray":26}],15:[function(_dereq_,module,exports){
'use strict';

var toArray = _dereq_('./toArray');

function delay (fn, time, context) {
  var args = toArray(arguments, 3);
  return setTimeout(function () {

    var destroyed = context && context.destroyed;
    !destroyed && fn.apply(context, args);
  }, time);
}

module.exports = delay;

},{"./toArray":26}],16:[function(_dereq_,module,exports){
'use strict';

var assert = _dereq_('./assert');
var toArray = _dereq_('./toArray');
var clone = _dereq_('./clone');

var eventSplitter = /\s+/;

var validationErrors = {
  'trigger': 'Cannot trigger event(s) without event name(s)',
  'events': 'Cannot bind/unbind without valid event name(s)',
  'callback': 'Cannot bind/unbind to an event without valid callback function'
};

var events = {

  'properties': {
    '_events': {},
    '_cache': {}
  },

  'on': function (events, callback, context) {

    var self = this;

    // validate arguments
    assert.string(events, validationErrors.events);
    assert.function(callback, validationErrors.callback);

    // loop through the events & bind them
    self.iterate(events, function (name) {
      // keep the binding
      self.bind(name, callback, context);

      // if this was a published event, do an immediate trigger
      var cache = self._cache;
      if (cache[name]) {
        callback.apply(context || self, cache[name]);
      }
    });

    return self;
  },

  'off': function (events, callback, context) {

    var self = this;

    // validate events only if a truthy value is passed
    events && assert.string(events, validationErrors.events);

    // if no arguments were passed, unbind everything
    if (!events && !callback && !context) {
      self._events = {};
      return self;
    }

    // if no events are passed, unbind all events with this callback
    events = events || Object.keys(self._events);

    // loop through the events & bind them
    self.iterate(events, function (name) {
      self.unbind(name, callback, context);
    });

    return self;
  },

  'once': function (events, callback, context) {

    var self = this;
    var args = toArray(arguments);

    // create a one time binding
    args[1] = function () {
      self.off.apply(self, args);
      callback.apply(context || self, arguments);
    };

    self.on.apply(self, args);

    return self;
  },

  'publish': function (events) {

    var self = this;
    var args = toArray(arguments);

    // validate events
    assert.string(events, validationErrors.events);

    self.iterate(events, function (name) {
      var cache = self._cache;
      if (!cache[name]) {
        cache[name] = args.slice(1);
        args[0] = name;
        self.trigger.apply(self, args);
      }
    });

    return self;
  },

  'unpublish': function (events) {

    var self = this;

    // validate events
    assert.string(events, validationErrors.events);

    // remove the cache for the events
    self.iterate(events, function (name) {
      self._cache[name] = undefined;
    });

    return self;
  },

  'unpublishAll': function () {
    var self = this;
    self._cache = {};
    return self;
  },

  'trigger': function (events) {

    var self = this;

    // validate arguments
    assert.string(events, validationErrors.trigger);

    // loop through the events & trigger them
    var params = toArray(arguments, 1);
    self.iterate(events, function (name) {
      self.triggerEvent(name, params);
    });

    return self;
  },

  'triggerEvent': function (name, params) {

    var self = this;
    var events = self._events || {};

    // call sub-event handlers
    var current = [];
    var fragments = name.split(':');
    while (fragments.length) {
      current.push(fragments.shift());
      name = current.join(':');
      if (name in events) {
        self.triggerSection(name, fragments, params);
      }
    }
  },

  'triggerSection': function (name, fragments, params) {

    var self = this;
    var events = self._events || {};
    var bucket = events[name] || [];

    bucket.forEach(function (item) {
      var args;
      if (fragments.length) {
        args = clone(params);
        args.unshift(fragments);
      }
      item.callback.apply(item.context || self, args || params);
    });
  },

  'iterate': function (events, iterator) {

    var self = this;

    if (typeof events === 'string') {
      events = events.split(eventSplitter);
    } else {
      assert.array(events);
    }

    while (events.length) {
      iterator.call(self, events.shift());
    }
  },

  'bind': function (name, callback, context) {

    var self = this;

    // store the reference to the callback + context
    var events = self._events || {};
    var bucket = events[name] || (events[name] = []);
    bucket.push({
      'callback': callback,
      'context': context
    });

    return self;
  },

  'unbind': function (name, callback, context) {

    var self = this;

    // lookup the reference to handler & remove it
    var events = self._events;
    var bucket = events[name] || [];
    var retain = [];

    // loop through the handlers
    var i = -1, l = bucket.length, item;
    while (++i < l) {
      item = bucket[i];
      if ((callback && callback !== item.callback) ||
          (context && context !== item.context)) {
        retain.push(item);
      }
    }

    // flush out detached handlers
    events[name] = retain;

    return self;
  }
};

module.exports = events;

},{"./assert":11,"./clone":12,"./toArray":26}],17:[function(_dereq_,module,exports){
'use strict';

var toArray = _dereq_('./toArray');
var merge = _dereq_('./merge');
var assert = _dereq_('./assert');

function extend () {

  // convert the argument list into an array
  var args = toArray(arguments);

  // validate input
  assert(args.length > 0, 'extend expect one or more objects');

  // loop through the arguments
  // & merging them recursively
  var object = args.shift();
  while (args.length) {
    merge(object, args.shift());
  }

  return object;
}

module.exports = extend;

},{"./assert":11,"./merge":24,"./toArray":26}],18:[function(_dereq_,module,exports){
'use strict';

function forArray (array, iterator, context) {
  for (var i = 0, l = array.length; i < l; i++) {
    if (iterator.call(context, array[i], i, array) === false) {
      return;
    }
  }
}

function forObject (object, iterator, context) {
  for (var key in object) {
    if (object.hasOwnProperty(key)) {
      if (iterator.call(context, object[key], key) === false) {
        return;
      }
    }
  }
}

function forEach (collection, iterator, context) {
  var handler = Array.isArray(collection) ? forArray : forObject;
  handler(collection, iterator, context);
}

module.exports = forEach;

},{}],19:[function(_dereq_,module,exports){
'use strict';

var merge = _dereq_('./merge');
var extend = _dereq_('./extend');

function mergeFromSuper (instance, key) {

  var constructor = instance.constructor;
  var proto = constructor.prototype;

  var baseData = {};
  if (instance.hasOwnProperty(key)) {
    baseData = instance[key];
  } else if (proto.hasOwnProperty(key)) {
    baseData = proto[key];
  }

  var _super = constructor && constructor.__super__;
  if (_super) {
    baseData = merge(mergeFromSuper(_super, key), baseData);
  }

  return extend({}, baseData);
}

function concatFromSuper (instance, key) {

  var constructor = instance.constructor;
  var proto = constructor.prototype;

  var baseData = [];
  if (instance.hasOwnProperty(key)) {
    baseData = instance[key];
  } else if (proto.hasOwnProperty(key)) {
    baseData = proto[key];
  }

  var _super = constructor && constructor.__super__;
  if (_super) {
    baseData = [].concat(concatFromSuper(_super, key), baseData);
  }

  return [].concat(baseData);
}

module.exports = {
  'merge': mergeFromSuper,
  'concat': concatFromSuper
};

},{"./extend":17,"./merge":24}],20:[function(_dereq_,module,exports){
'use strict';

function functions (obj) {
  var funcs = [];
  for (var key in obj) {
    if (typeof obj[key] === 'function') {
      funcs.push(key);
    }
  }
  return funcs;
}

module.exports = functions;

},{}],21:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'assert': _dereq_('./assert'),
  'clone': _dereq_('./clone'),
  'createUID': _dereq_('./createUID'),
  'defer': _dereq_('./defer'),
  'delay': _dereq_('./delay'),
  'events': _dereq_('./events'),
  'extend': _dereq_('./extend'),
  'forEach': _dereq_('./forEach'),
  'fromSuper': _dereq_('./fromSuper'),
  'functions': _dereq_('./functions'),
  'inherits': _dereq_('./inherits'),
  'isEqual': _dereq_('./isEqual'),
  'merge': _dereq_('./merge'),
  'size': _dereq_('./size'),
  'toArray': _dereq_('./toArray'),
  'when': _dereq_('./when'),
  'where': _dereq_('./where')
};
},{"./assert":11,"./clone":12,"./createUID":13,"./defer":14,"./delay":15,"./events":16,"./extend":17,"./forEach":18,"./fromSuper":19,"./functions":20,"./inherits":22,"./isEqual":23,"./merge":24,"./size":25,"./toArray":26,"./when":27,"./where":28}],22:[function(_dereq_,module,exports){
'use strict';

var extend = _dereq_('./extend');

// Helper function to correctly set up the prototype chain, for subclasses.
// Similar to `goog.inherits`, but uses a hash of prototype properties and
// class properties to be extended.
function inherits (parent, protoProps, staticProps) {

  var child;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call `super()`.
  if (protoProps && protoProps.hasOwnProperty('constructor')) {
    child = protoProps.constructor;
  }
  else {
    child = function () {
      return parent.apply(this, arguments);
    };
  }

  // Inherit class (static) properties from parent.
  extend(child, parent);

  // Set the prototype chain to inherit from `parent`, without calling
  // `parent`'s constructor function.
  child.prototype = Object.create(parent.prototype);

  // Add prototype properties (instance properties) to the subclass,
  // if supplied.
  extend(child.prototype, protoProps);

  // Correctly set child's `prototype.constructor`.
  child.prototype.constructor = child;

  // Add static properties to the constructor function, if supplied.
  extend(child, staticProps);

  // Set a convenience property
  // in case the parent's prototype is needed later.
  child.__super__ = parent.prototype;

  return child;
}

module.exports = inherits;

},{"./extend":17}],23:[function(_dereq_,module,exports){
'use strict';

// TODO: implement deepEqual
function isEqual (a, b) {
  return a === b;
}

module.exports = isEqual;

},{}],24:[function(_dereq_,module,exports){
'use strict';

var toArray = _dereq_('./toArray');

function merge (object, source) {
  var sources = toArray(arguments, 1);
  while (sources.length) {
    source = sources.shift();
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        object[key] = source[key];
      }
    }
  }
  return object;
}

module.exports = merge;

},{"./toArray":26}],25:[function(_dereq_,module,exports){
'use strict';

function size (collection) {
  !Array.isArray(collection) && (collection = Object.keys(collection));
  return collection.length;
}

module.exports = size;

},{}],26:[function(_dereq_,module,exports){
'use strict';

var slice = Array.prototype.slice;
function toArray (obj, skip) {
  return slice.call(obj, skip || 0);
}

module.exports = toArray;

},{}],27:[function(_dereq_,module,exports){
'use strict';

var WBDeferred = _dereq_('../WBDeferred');
var toArray = _dereq_('./toArray');

function When () {

  var context = this;
  var main = new WBDeferred(context);
  var deferreds = toArray(arguments);

  // support passing an array of deferreds, to avoid `apply`
  if (deferreds.length === 1 && Array.isArray(deferreds[0])) {
    deferreds = deferreds[0];
  }

  var count = deferreds.length;
  var args = new Array(count);

  function Fail () {
    main.rejectWith(this);
  }

  function Done () {

    if (main.state() === 'rejected') {
      return;
    }

    var index = count - deferreds.length - 1;
    args[index] = toArray(arguments);

    if (deferreds.length) {
      var next = deferreds.shift();
      next.done(Done);
    } else {
      args.unshift(this);
      main.resolveWith.apply(main, args);
    }
  }

  if (deferreds.length) {

    deferreds.forEach(function (deferred) {
      deferred.fail(Fail);
    });

    var current = deferreds.shift();
    current.done(Done);
  } else {
    main.resolve();
  }

  return main.promise();
}

module.exports = When;

},{"../WBDeferred":4,"./toArray":26}],28:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_('./forEach');

function where (collection, properties) {
  var matches = [];
  forEach(collection, function (item) {
    for (var key in properties) {
      if (item[key] !== properties[key]) {
        return;
      }
      matches.push(item);
    }
  });
  return matches;
}

module.exports = where;

},{"./forEach":18}],29:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var fromSuper = _dereq_('../lib/fromSuper');

var ControllerMixin = WBMixin.extend({

  'initialize': function () {

    var self = this;

    self.controllers = [];
    self.implemented = [];

    self.implements = fromSuper.concat(self, 'implements');
    self.createControllerInstances();

    self.bindTo(self, 'destroy', 'destroyControllers');
  },

  'createControllerInstances': function () {

    var self = this;
    var ControllerClass, controllerInstance, i;
    var Controllers = self.implements;

    for (i = Controllers.length; i--;) {
      ControllerClass = Controllers[i];

      // If we have already implemented a controller that inherits from
      // this controller, we don't need another one...
      if (self.implemented.indexOf(ControllerClass.toString()) < 0) {

        controllerInstance = new ControllerClass(self);
        self.controllers.push(controllerInstance);
        controllerInstance.parent = self;

        self.trackImplementedSuperConstructors(controllerInstance);
      }
    }

    return self.implemented;
  },

  'trackImplementedSuperConstructors': function (Controller) {

    var self = this;
    var _super = Controller.__super__;
    var superConstructor = _super && _super.constructor;

    if (superConstructor) {
      self.implemented.push(superConstructor.toString());
      self.trackImplementedSuperConstructors(superConstructor);
    }
  },

  'destroyControllers': function () {

    var self = this;

    // Loop and destroy
    var controller;
    var controllers = self.controllers;

    for (var i = controllers.length; i--;) {

      // A controller can exist multiple times in the list,
      // since it's based on the event name,
      // so make sure to only destroy each one once
      controller = controllers[i];
      controller.destroyed || controller.destroy();
    }

    delete self.controllers;
  }
});

module.exports = ControllerMixin;

},{"../WBMixin":6,"../lib/fromSuper":19}],30:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var fromSuper = _dereq_('../lib/fromSuper');
var clone = _dereq_('../lib/clone');

var ObservableHashMixin = WBMixin.extend({

  'initialize': function () {

    var self = this;

    var observesHash = fromSuper.merge(self, 'observes');
    for (var target in observesHash) {
      self.bindToTarget(self.resolveTarget(target), observesHash[target]);
    }
  },

  'bindToTarget': function (target, events) {

    var self = this;

    for (var eventString in events) {
      self.bindHandlers(target, eventString, events[eventString]);
    }
  },

  'bindHandlers': function (target, eventString, handlers) {

    var self = this;

    if (typeof handlers === 'string') {
      handlers = [handlers];
    } else {
      handlers = clone(handlers);
    }

    while (handlers.length) {
      self.bindTo(target, eventString, handlers.shift());
    }
  },

  'resolveTarget': function (key) {

    var self = this;

    // allow observing self
    if (key === 'self') {
      return self;
    }

    var target = self[key];
    if (!target && typeof key === 'string' && key.indexOf('.') > -1) {
      key = key.split('.');
      target = self;
      while (key.length && target) {
        target = target[key.shift()];
      }
    }

    return target;
  }

});

module.exports = ObservableHashMixin;

},{"../WBMixin":6,"../lib/clone":12,"../lib/fromSuper":19}],31:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
// var assert = require('../lib/assert');
var createUID = _dereq_('../lib/createUID');

var WBBindableMixin = WBMixin.extend({

  'properties': {
    '_bindings': {},
    '_namedEvents': {}
  },

  // keeps callback closure in own execution context with
  // only callback and context
  'callbackFactory': function  (callback, context) {

    var bindCallback;

    var forString = function stringCallback () {
      context[callback].apply(context, arguments);
    };

    var forFunction = function functionCallback () {
      callback.apply(context, arguments);
    };

    if (typeof callback === 'string') {
      bindCallback = forString;
      // cancel alternate closure immediately
      forFunction = null;
    }
    else {
      bindCallback = forFunction;
      forString = null;
    }

    return bindCallback;
  },

  'bindTo': function (target, event, callback, context) {

    var self = this;
    self.checkBindingArgs.apply(self, arguments);

    // default to self if context not provided
    context = context || self;

    // if this binding already made, return it
    var bound = self.isAlreadyBound(target, event, callback, context);
    if (bound) {
      return bound;
    }


    var callbackFunc, args;

    // if a jquery object
    if (target.constructor && target.constructor.fn && target.constructor.fn.on === target.on) {
      // jquery does not take context in .on()
      // cannot assume on takes context as a param for bindable object
      // create a callback which will apply the original callback in the correct context
      callbackFunc = self.callbackFactory(callback, context);
      args = [event, callbackFunc];
    } else {
      // Backbone accepts context when binding, simply pass it on
      callbackFunc = (typeof callback === 'string') ? context[callback] : callback;
      args = [event, callbackFunc, context];
    }

    // create binding on target
    target.on.apply(target, args);

    var binding = {
      'uid': createUID(),
      'target': target,
      'event': event,
      'originalCallback': callback,
      'callback': callbackFunc,
      'context': context
    };

    self._bindings[binding.uid] = binding;
    self.addToNamedBindings(event, binding);

    return binding;
  },

  'bindOnceTo': function (target, event, callback, context) {

    var self = this;
    self.checkBindingArgs.apply(self, arguments);

    context = context || self;

    // if this binding already made, return it
    var bound = self.isAlreadyBound(target, event, callback, context);
    if (bound) {
      return bound;
    }


    // this is a wrapper
    var onceBinding = function () {

      ((typeof callback === 'string') ? context[callback] : callback).apply(context, arguments);
      self.unbindFrom(binding);
    };

    var binding = {
      'uid': createUID(),
      'target': target,
      'event': event,
      'originalCallback': callback,
      'callback': onceBinding,
      'context': context
    };

    target.on(event, onceBinding, context);

    self._bindings[binding.uid] = binding;
    self.addToNamedBindings(event, binding);

    return binding;
  },

  'unbindFrom': function (binding) {

    var self = this;

    var uid = binding && binding.uid;
    if (!binding || (typeof uid !== 'string')) {
      throw new Error('Cannot unbind from undefined or invalid binding');
    }

    var event = binding.event;
    var context = binding.context;
    var callback = binding.callback;
    var target = binding.target;

    // a binding object with only uid, i.e. a destroyed/unbound
    // binding object has been passed - just do nothing
    if (!event || !callback || !target || !context) {
      return;
    }

    target.off(event, callback, context);

    // clean up binding object, but keep uid to
    // make sure old bindings, that have already been
    // cleaned, are still recognized as bindings
    for (var key in binding) {
      if (key !== 'uid') {
        delete binding[key];
      }
    }

    delete self._bindings[uid];

    var namedEvents = self._namedEvents;
    var events = namedEvents[event];

    if (events) {
      var cloned = events && events.slice(0);
      for (var i = events.length - 1; i >= 0; i--) {
        if (events[i].uid === uid) {
          cloned.splice(i, 1);
        }
      }

      namedEvents[event] = cloned;
    }

    return;
  },

  'unbindFromTarget': function (target) {

    var self = this;

    if (!target || (typeof target.on !== 'function')) {
      throw new Error('Cannot unbind from undefined or invalid binding target');
    }

    var binding;
    for (var key in self._bindings) {
      binding = self._bindings[key];
      if (binding.target === target) {
        self.unbindFrom(binding);
      }
    }
  },

  'unbindAll': function () {

    var self = this;

    var binding;
    for (var key in self._bindings) {
      binding = self._bindings[key];
      self.unbindFrom(binding);
    }
  },

  'checkBindingArgs': function (target, event, callback, context) {

    context = context || this;

    // do not change these messages without updating the specs
    if (!target || (typeof target.on !== 'function')) {
      throw new Error('Cannot bind to undefined target or target without #on method');
    }

    if (!event || (typeof event !== 'string')) {
      throw new Error('Cannot bind to target event without event name');
    }

    if (!callback || ((typeof callback !== 'function') && (typeof callback !== 'string'))) {
      throw new Error('Cannot bind to target event without a function or method name as callback');
    }

    if ((typeof callback === 'string') && !context[callback]) {
      throw new Error('Cannot bind to target using a method name that does not exist for the context');
    }
  },

  'isAlreadyBound': function (target, event, callback, context) {

    var self = this;
    // check for same callback on the same target instance
    // return early withthe event binding
    var events = self._namedEvents[event];
    if (events) {
      for (var i = 0, max = events.length; i < max; i++) {

        var current = events[i] || {};

        // the below !boundTarget check seems unreachable
        // was added in this commit of the web app: c75d5077c0a8629b60cb6dd1cd78d3bc77fcac48
        // need to ask Adam under what conditions this would be possible
        var boundTarget = current.target;
        if (!boundTarget) {
          return false;
        }

        var targetBound = target.uid ? target.uid === boundTarget.uid : false;
        if (current.originalCallback === callback &&
            current.context === context && targetBound) {
          return current;
        }
      }
    }

    return false;
  },

  'addToNamedBindings': function (event, binding) {

    var self = this;
    if (!self._namedEvents[event]) {
      self._namedEvents[event] = [];
    }
    self._namedEvents[event].push(binding);
  }
});

module.exports = WBBindableMixin;

},{"../WBMixin":6,"../lib/createUID":13}],32:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_('../lib/forEach');
var WBMixin = _dereq_('../WBMixin');

function noop () {}

function Call (fn) {
  var self = this;
  (typeof fn === 'string') && (fn = self[fn]);
  (typeof fn === 'function') && fn.call(self);
}

var cleanupMethods = ['unbind', 'unbindAll', 'onDestroy'];

var WBDestroyableMixin = WBMixin.extend({

  'destroy': function () {

    var self = this;

    // clean up
    forEach(cleanupMethods, Call, self);

    self.trigger('destroy');

    self.destroyObject(self);

    self.destroyed = true;
  },

  'destroyObject': function (object) {

    var self = this;
    for (var key in object) {
      self.destroyKey(key, object);
    }
  },

  'destroyKey': function (key, context) {

    if (context.hasOwnProperty(key) && key !== 'uid' && key !== 'cid') {
      // make functions noop
      if (typeof context[key] === 'function') {
        context[key] = noop;
      }
      // and others undefined
      else {
        context[key] = undefined;
      }
    }
  }
});

module.exports = WBDestroyableMixin;

},{"../WBMixin":6,"../lib/forEach":18}],33:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var events = _dereq_('../lib/events');

var WBEventsMixin = WBMixin.extend(events);

module.exports = WBEventsMixin;

},{"../WBMixin":6,"../lib/events":16}],34:[function(_dereq_,module,exports){
'use strict';

var clone = _dereq_('../lib/clone');
var merge = _dereq_('../lib/merge');
var extend = _dereq_('../lib/extend');
var isEqual = _dereq_('../lib/isEqual');
var WBMixin = _dereq_('../WBMixin');

var WBStateMixin = WBMixin.extend({

  'attributes': {},
  'options': {},

  'initialize': function (attributes, options) {

    var self = this;
    self.attributes = extend({}, self.defaults, attributes);
    self.options = options || {};
    self.changed = {};
  },

  'get': function (key) {
    console.warn('getters are deprecated');
    return this.attributes[key];
  },

  'set': function (key, val, options) {

    var self = this;
    if (key === null) {
      return self;
    }

    var attrs, attr;
    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (typeof key === 'object') {
      attrs = key;
      options = val;
    } else {
      attrs = {};
      attrs[key] = val;
    }

    // default options are empty
    options || (options = {});

    // no need to track changes on options.silent
    if (options.silent) {
      merge(self.attributes, attr);
    }
    // For each `set` attribute, update or delete the current value.
    else {
      var changes = self.changes(attrs, options);
      self._trigger(attrs, changes, options);
    }

    return self;
  },

  'unset': function (attr, options) {
    return this.set(attr, undefined, extend({}, options, { 'unset': true }));
  },

  'clear': function (options) {
    var self = this;
    return self.set(self.defaults, options);
  },

  'changes': function (attrs, options) {

    var self = this;
    var key, val;
    var changes = [];

    var prev = clone(self.attributes, true);
    var current = self.attributes;
    self.changed = {};

    for (key in attrs) {
      val = attrs[key];
      if (!isEqual(current[key], val)) {
        changes.push(key);
      }
      if (!isEqual(prev[key], val)) {
        self.changed[key] = val;
      } else {
        delete self.changed[key];
      }

      current[key] = options.unset ? undefined : val;
    }

    return changes;
  },

  '_trigger': function (attrs, changes, options) {

    var self = this;
    var current = self.attributes;

    // if any changes found
    // & if this is an EventEmitter,
    // trigger the change events
    var attr;
    while (changes && changes.length && self.trigger) {
      attr = changes.shift();
      self.trigger('change:' + attr, self, current[attr], options);
    }
  }
});

module.exports = WBStateMixin;

},{"../WBMixin":6,"../lib/clone":12,"../lib/extend":17,"../lib/isEqual":23,"../lib/merge":24}],35:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var WBDeferred = _dereq_('../WBDeferred');
var when = _dereq_('../lib/when');
var toArray = _dereq_('../lib/toArray');
var forEach = _dereq_('../lib/forEach');
var delay = _dereq_('../lib/delay');
var defer = _dereq_('../lib/defer');
var functions = _dereq_('../lib/functions');

var WBUtilsMixin = WBMixin.extend({

  'deferred': function () {
    var self = this;
    return new WBDeferred(self);
  },

  'when': function () {
    var self = this;
    return when.apply(self, arguments);
  },

  'defer': function (fn) {
    var self = this;
    var args = toArray(arguments);
    // default context to self
    args[1] = args[1] || this;
    // support string names of functions on self
    (typeof fn === 'string') && (args[0] = self[fn]);
    return defer.apply(null, args);
  },

  'delay': function (fn) {
    var self = this;
    var args = toArray(arguments);
    // default context to self
    args[2] = args[2] || self;
    // support string names of functions on self
    (typeof fn === 'string') && (args[0] = self[fn]);
    return delay.apply(null, args);
  },

  'forEach': function (collection, fn, context) {
    var self = this;
    // default context to self
    context = context || self;
    // support string names of functions on self
    (typeof fn === 'string') && (fn = self[fn]);
    forEach(collection, fn, context);
  },

  'functions': function (obj) {
    return functions(obj || this);
  }
});

module.exports = WBUtilsMixin;

},{"../WBDeferred":4,"../WBMixin":6,"../lib/defer":14,"../lib/delay":15,"../lib/forEach":18,"../lib/functions":20,"../lib/toArray":26,"../lib/when":27}],36:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'ControllerMixin': _dereq_('./ControllerMixin'),
  'ObservableHashMixin': _dereq_('./ObservableHashMixin'),
  'WBBindableMixin': _dereq_('./WBBindableMixin'),
  'WBDestroyableMixin': _dereq_('./WBDestroyableMixin'),
  'WBEventsMixin': _dereq_('./WBEventsMixin'),
  'WBStateMixin': _dereq_('./WBStateMixin'),
  'WBUtilsMixin': _dereq_('./WBUtilsMixin')
};
},{"./ControllerMixin":29,"./ObservableHashMixin":30,"./WBBindableMixin":31,"./WBDestroyableMixin":32,"./WBEventsMixin":33,"./WBStateMixin":34,"./WBUtilsMixin":35}],37:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var clone = core.lib.clone;
var assert = core.lib.assert;

var generateId = _dereq_('./lib/generateId');

// Default id Attribute used
var defaultKeyPath = 'id';

var BackboneDBSync = WBEventEmitter.extend({

  'initialize': function (options) {

    var self = this;
    assert.object(options);
    assert(options.database);

    self.database = options.database;
  },

  'generateId': function (keyPath, id, instance) {

    if (!id) {
      id = generateId();
      if (instance.collection) {
        while (instance.collection.get(id)) {
          id = generateId();
        }
      }
      instance.set(keyPath, id);
    }

    return id;
  },

  'queryCollection': function (collection) {

    var self = this;
    var crud = self.database.crud;
    var storeName = collection.storeName || collection.model.prototype.storeName;
    return crud.query(storeName);
  },

  'operateOnModel': function (model, method) {

    var self = this;
    var crud = self.database.crud;
    var json;
    if (typeof model.toJSON === 'function') {
      json = model.toJSON();
    }
    else {
      json = clone(model.attributes);
    }
    json.id || (json.id = model.id);
    return crud[method](model.storeName, json);
  },

  'sync': function (method, instance, options) {

    var self = this;
    options = options || {};

    var stores = self.database.stores;

    var collection = instance.collection;
    var storeName = instance.storeName || (collection && collection.storeName);
    var storeInfo = stores[storeName];
    var keyPath = (storeInfo && storeInfo.keyPath) || defaultKeyPath;
    var attributes = instance.attributes;
    var id = attributes.id || attributes[keyPath];
    var isAWrite = /(create|update)/.test(method);

    // Assign IDs automatically if not present
    if (isAWrite) {
      id = self.generateId(keyPath, id, instance);
    }

    // for specs, we should be able to skip this magic
    if (!storeName || storeName === 'none') {
      if (typeof options.success === 'function') {
        options.success();
      }
      return;
    }

    // skip invalid crup operation or models that don't have a valid storeName
    if (storeName in stores) {

      var _success = options.success;
      options.success = function () {

        if (typeof _success === 'function') {
          _success.apply(this, arguments);
        }

        // trigger events for syncing
        if (/(create|update|destroy)/.test(method)) {
          self.database.trigger(method, storeName, id);
        }

        // Update full-text index when needed
        if ('fullTextIndexFields' in storeInfo) {
          self.trigger('index', method, storeName, instance);
        }
      };

      var request;

      // query collections
      if (method === 'read' && !instance.id && instance.model) {
        request = self.queryCollection(instance);
      }
      // regular models
      else {
        request = self.operateOnModel(instance, method);
      }

      options.success && request.done(options.success);
      options.error && request.fail(options.error);
    }
  }
});

module.exports = BackboneDBSync;

},{"./lib/generateId":48,"wunderbits.core":10}],38:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var WBDeferred = core.WBDeferred;
var when = core.lib.when;
var assert = core.lib.assert;

var Errors = {
  'init': 'ERR_ABSTRACT_BACKEND_INITIALIZED'
};

var AbstractBackend = WBEventEmitter.extend({

  'defaultKeyPath': 'id',

  'initialize': function () {

    var self = this;

    assert(self.constructor !== AbstractBackend, Errors.init);

    self.ready = new WBDeferred();
  },

  'connect': function (options) {

    var self = this;
    self.options = self.options || {};
    self.options.db = options;
    self.stores = options.stores;
    self.openDB(options.name, options.version);
    return self.ready.promise();
  },

  'openSuccess': function () {

    var self = this;
    self.trigger('connected');
    self.ready.resolve();
  },

  'openFailure': function (code, error) {

    var self = this;
    self.trigger('error', code, error);
    self.ready.reject(code, error);
  },

  // helper to loop through stores
  'mapStores': function (iterator) {

    var self = this;
    var results = [];
    var stores = self.stores;
    var storeNames = Object.keys(stores);
    var result, storeName, storeInfo;

    while (storeNames.length) {
      storeName = storeNames.shift();
      storeInfo = stores[storeName];
      result = iterator.call(self, storeName, storeInfo);
      results.push(result);
    }

    return results;
  },

  'truncate': function (callback) {

    var self = this;

    // pause all DB operations
    var deferred = new WBDeferred();
    self.ready = new WBDeferred();

    var storeClearPromises = self.mapStores(self.clearStore);
    when(storeClearPromises).then(function () {

      // reject all DB operations
      self.ready.reject();
      deferred.resolve();

      // LEGACY: remove this
      if (typeof callback === 'function') {
        callback();
      }

      self.trigger('truncated');
    });

    return deferred.promise();
  },

});

module.exports = AbstractBackend;

},{"wunderbits.core":10}],39:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBDeferred = core.WBDeferred;

var AbstractBackend = _dereq_('./AbstractBackend');
var Global = _dereq_('../lib/global');

var DOMError = Global.DOMError || Global.DOMException;
var indexedDB = Global.indexedDB ||
                Global.webkitIndexedDB ||
                Global.mozIndexedDB ||
                Global.msIndexedDB;

var Constants = {
  'READ': 'readonly',
  'WRITE': 'readwrite'
};

var Errors = {
  'privateMode': 'ERR_IDB_FIREFOX_PRIVATE_MODE',
  'downgrade': 'ERR_IDB_CANT_DOWNGRADE_VERSION',
  'unknown': 'ERR_IDB_UNKNOWN',
  'upgradeBrowser': 'ERR_IDB_UPGRADE_BROWSER',
  'storeCreationFailed': 'ERR_IDB_STORE_CREATION_FAILED',
  'storeClearFailed': 'ERR_IDB_STORE_CLEAR_FAILED',
  'notFound': 'ERR_IDB_OBJECT_NOT_FOUND',
  'getFailed': 'ERR_IDB_STORE_GET_FAILED',
  'cursorFailed': 'ERR_IDB_CANT_OPEN_CURSOR',
  'queryFailed': 'ERR_IDB_QUERY_FAILED',
  'updateFailed': 'ERR_IDB_STORE_UPDATE_FAILED',
  'destroyFailed': 'ERR_IDB_STORE_DESTROY_FAILED'
};

var IndexedDBBackend = AbstractBackend.extend({

  'openDB': function (name, version) {

    var self = this;

    var openRequest = indexedDB.open(name, version);
    openRequest.onerror = self.onRequestError.bind(self);
    openRequest.onsuccess = self.onRequestSuccess.bind(self);
    openRequest.onupgradeneeded = self.onUpgradeNeeded.bind(self);
  },

  'onRequestError': function (event) {

    var self = this;
    var error = event.target.error;
    var errorName = error.name;
    var isDOMError = (error instanceof DOMError);

    if (errorName === 'InvalidStateError' && isDOMError) {
      self.openFailure(Errors.privateMode);
    }
    else if (errorName === 'VersionError' && isDOMError) {
      self.openFailure(Errors.downgrade);
    }
    else {
      self.openFailure(Errors.unknown, error);
    }
  },

  'onRequestSuccess': function (event) {

    var self = this;

    if (self.db) {
      self.openSuccess();
      return;
    }

    var db = event.target.result;
    if (typeof db.version === 'string') {
      self.openFailure(Errors.upgradeBrowser);
      return;
    }

    self.db = db;
    self.storeNames = db.objectStoreNames;
    self.openSuccess();
  },

  'onUpgradeNeeded': function (event) {

    var self = this;
    var db = event.target.result;
    self.db = db;
    self.storeNames = db.objectStoreNames;

    self.trigger('upgrading');

    self.mapStores(self.createStore);
  },

  'createStore': function (storeName, storeInfo) {

    var self = this;
    var db = self.db;

    // create store, only if doesn't already exist
    if (!self.storeNames.contains(storeName)) {
      var request = db.createObjectStore(storeName, {
        'keyPath': storeInfo.keyPath || self.defaultKeyPath
      });

      request.onerror = function (error) {
        self.trigger('error', Errors.storeCreationFailed, error, storeName);
      };
    }
  },

  'clearStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.WRITE);
    var store = transaction.objectStore(storeName);

    var request = store.clear();

    request.onsuccess = function () {
      deferred.resolve();
    };

    request.onerror = function (error) {
      self.trigger('error', Errors.storeClearFailed, error, storeName);
      deferred.reject();
    };

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.READ);
    var store = transaction.objectStore(storeName);
    var id = json[store.keyPath || self.defaultKeyPath] || json.id;

    var request = store.get(id);

    request.onsuccess = function (event) {
      var json = event.target.result;
      if (json) {
        deferred.resolve(json);
      }
      else {
        self.trigger('error', Errors.notFound, null, storeName, json);
        deferred.reject();
      }
    };

    request.onerror = function (error) {
      self.trigger('error', Errors.getFailed, error, storeName, json);
      deferred.reject();
    };

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.READ);
    var store = transaction.objectStore(storeName);
    var elements = [];

    var readCursor = store.openCursor();

    if (!readCursor) {
      self.trigger('error', Errors.cursorFailed, null, storeName);
      deferred.reject();
    }
    else {
      readCursor.onerror = function (error) {
        self.trigger('error', Errors.queryFailed, error, storeName);
        deferred.reject();
      };

      readCursor.onsuccess = function (e) {

        var cursor = e.target.result;
        // We're done. No more elements.
        if (!cursor) {
          deferred.resolve(elements);
        }
        // We have more records to process
        else {
          elements.push(cursor.value);
          cursor['continue']();
        }
      };
    }

    return deferred.promise();
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.WRITE);
    var store = transaction.objectStore(storeName);

    var request = store.put(json);

    request.onsuccess = function () {
      deferred.resolve();
    };

    request.onerror = function (error) {
      self.trigger('error', Errors.updateFailed, error, storeName, json);
      deferred.reject();
    };

    return deferred.promise();
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.WRITE);
    var store = transaction.objectStore(storeName);
    var id = json[store.keyPath || self.defaultKeyPath] || json.id;

    var request = store['delete'](id);

    request.onsuccess = function () {
      deferred.resolve();
    };

    request.onerror = function (error) {
      self.trigger('error', Errors.destroyFailed, error, storeName, json);
      deferred.reject();
    };

    return deferred.promise();
  },

  'nuke': function () {

    var self = this;
    var dbName = self.options.db.name;

    var deferred = new WBDeferred();

    var request = indexedDB.deleteDatabase(dbName);

    request.onsuccess = function () {
      deferred.resolve();
    };

    request.onerror = function () {
      deferred.reject();
    };

    return deferred.promise();
  }
});

module.exports = IndexedDBBackend;


},{"../lib/global":49,"./AbstractBackend":38,"wunderbits.core":10}],40:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBDeferred = core.WBDeferred;
var forEach = core.lib.forEach;
var toArray = core.lib.toArray;

var AbstractBackend = _dereq_('./AbstractBackend');
var Global = _dereq_('../lib/global');
var SafeParse = _dereq_('../lib/SafeParse');

var indexedDB = Global.indexedDB ||
                Global.webkitIndexedDB ||
                Global.mozIndexedDB ||
                Global.msIndexedDB;

var MemoryBackend = AbstractBackend.extend({

  'cache': {},

  'localStorageAvailable': true,

  'initialize': function () {

    var self = this;
    self.ready = new WBDeferred();
  },

  'connect': function (options) {

    var self = this;
    self.stores = options.stores;

    self.localStorageAvailable = options.localStorageAvailable;

    // On every version change,
    // clear out the localStorage &
    // try again for a better backend
    if (self.localStorageAvailable) {
      var store = Global.localStorage;
      if (store.getItem('availableBackend') === 'memory' &&
          store.getItem('dbVersion') !== '' + options.version) {

        // clear localStorage
        store.clear();

        // If IDB is available, clear that too
        if (indexedDB) {
          var transaction = indexedDB.deleteDatabase(options.name);
          // Wait till the database is deleted before reloading the app
          transaction.onsuccess = transaction.onerror = function() {
            Global.location.reload();
          };
        }
        // Otherwise, reload right away
        else {
          Global.location.reload();
        }
      }
    }

    !self.cache && self.reset();

    self.ready.resolve();
    return self.ready.promise();
  },

  'reset': function () {

    var self = this;
    self.cache = {};
    forEach(self.stores, function (metaData, storeName) {
      self.cache[storeName] = {};
    });
  },

  'truncate': function (callback) {

    var self = this;
    var deferred = new WBDeferred();
    self.ready = new WBDeferred();

    self.reset();
    self.localStorageAvailable && Global.localStorage.clear();

    setTimeout(function () {

      // reject all DB operations
      self.ready.reject();
      deferred.resolve();

      // LEGACY: remove this
      if (typeof callback === 'function') {
        callback();
      }

      self.trigger('truncated');
    }, 50);

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var val;
    var meta = self.stores[storeName];

    if (self.localStorageAvailable && meta.critical) {
      var id = json[meta.keyPath] || json.id;
      val = Global.localStorage[storeName + '_' + id];
      val && (val = SafeParse.json(val));
    }
    else {
      val = self.cache[storeName][json.id];
    }

    setTimeout(function () {

      if (val !== undefined) {
        deferred.resolve(val);
      }
      else {
        deferred.reject();
      }
    }, 50);

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();
    var results = toArray(self.cache[storeName]);
    return deferred.resolve(results).promise();
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var meta = self.stores[storeName];

    if (self.localStorageAvailable && meta.critical) {
      var id = json[meta.keyPath] || json.id;
      Global.localStorage[storeName + '_' + id] = JSON.stringify(json);
    }
    else {
      self.cache[storeName][json.id] = json;
    }

    return deferred.resolve().promise();
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();
    delete self.cache[storeName][json.id];
    return deferred.resolve().promise();
  }
});

module.exports = MemoryBackend;

},{"../lib/SafeParse":47,"../lib/global":49,"./AbstractBackend":38,"wunderbits.core":10}],41:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBDeferred = core.WBDeferred;
var when = core.lib.when;

var AbstractBackend = _dereq_('./AbstractBackend');
var printf = _dereq_('../lib/printf');
var FieldTypes = _dereq_('../lib/FieldTypes');

var Global = _dereq_('../lib/global');
var SafeParse = _dereq_('../lib/SafeParse');

var openConnection = Global.openDatabase;
var escape = Global.escape;
var unescape = Global.unescape;

var SQL = {
  'createTable': 'CREATE TABLE IF NOT EXISTS ? (? TEXT PRIMARY KEY, ?)',
  'truncateTable': 'DELETE FROM ?',
  'dropTable': 'DROP TABLE IF EXISTS ?',

  'read': 'SELECT * from ? WHERE ?=\'?\' LIMIT 1',
  'query': 'SELECT * from ?',
  'upsert': 'INSERT OR REPLACE INTO ? (?) VALUES (?)',
  'destroy': 'DELETE FROM ? WHERE ?=\'?\''
};

// We need to map schema types to websql types
var TYPES = { 'default': 'TEXT' };
TYPES[FieldTypes.Float] = 'REAL';
TYPES[FieldTypes.Integer] = 'INTEGER';

var WebSQLBackend = AbstractBackend.extend({

  'dbSize': (5 * 1024 * 1024),

  'openDB': function (name, version) {

    var self = this;
    var readyDeferred = self.ready;

    // in case safari is broken after an update
    var initTimeout = setTimeout(function () {
      self.openFailure('ERR_WS_CONNECT_TIMEOUT');
    }, 2000);

    readyDeferred.done(function () {
      clearTimeout(initTimeout);
    });

    try {
      // Safari needs the DB to initialized with **exactly** 5 mb storage
      var db = openConnection(name, '', name, self.dbSize);
      self.db = db;

      // WebSQL versions are strings
      version = '' + version;

      // check if we need to upgrade the schema
      if (db.version !== version) {
        self.onUpgradeNeeded()
          .done(self.openSuccess, self)
          .fail(self.openFailure, self);
      }
      // schema correct
      else {
        self.openSuccess();
      }
    } catch (error) {
      self.openFailure('ERR_WS_CONNECT_FAILED', error);
    }
  },

  'execute': function (sql) {

    var self = this;

    var deferred = new WBDeferred();

    // create a transaction
    self.db.transaction(function (transaction) {
      // execute the sql
      transaction.executeSql(sql, [], function (tx, result) {
        deferred.resolve(result);
      }, function (tx, err) {
        deferred.reject(err);
      });
    });

    return deferred.promise();
  },

  'parseGeneric': function (data) {
    return SafeParse.json(unescape(data.json));
  },

  'populateGeneric': function (keys, values, json) {

    keys.push('json');
    values.push('\'' + escape(JSON.stringify(json)) + '\'');
  },

  'parseFields': function (data, fields) {
    var obj = {
      'id': data.id
    };

    var name, type, value, parsed;
    for (name in fields) {
      type = fields[name];
      value = data[name];

      if (data[name] !== undefined) {
        if (type === FieldTypes.Integer) {
          parsed = parseInt(value, 10);
          if (isNaN(value)) {
            console.warn('failed to parse %s as Integer', value);
          }
          value = parsed || 0;
        }
        else if (type === FieldTypes.Float) {
          parsed = parseFloat(value, 10);
          if (isNaN(value)) {
            console.warn('failed to parse %s as Float', value);
          }
          value = parsed || 0;
        }
        else {

          // don't unescape nulls & undefineds
          value = value && unescape(value);

          if (type === FieldTypes.Boolean) {
            value = (value === 'true');
          }
          else if (type === FieldTypes.Array) {
            value = SafeParse.json(value) || [];
          }
          else if (type === FieldTypes.Object) {
            value = SafeParse.json(value) || {};
          }
          else if (value === '') {
            value = null;
          }
        }
        obj[name] = value;
      }
    }

    return obj;
  },

  'populateFields': function (keys, values, json, fields, keyPath) {

    var name, type, value;
    for (name in fields) {

      type = fields[name];
      value = json[name];

      if (value !== undefined && name !== keyPath) {

        if (type === FieldTypes.Float || type === FieldTypes.Integer) {
          value = (!!value && !isNaN(value)) ? value : 0;
        }
        else if (type === FieldTypes.Array && Array.isArray(value)) {
          value = '\'' + escape(JSON.stringify(value)) + '\'';
        }
        else if (type === FieldTypes.Object) {
          value = '\'' + escape(JSON.stringify(value)) + '\'';
        }
        else {
          value = (value !== null) ? '\'' + escape(value) + '\'' : 'NULL';
        }

        keys.push('"' + name + '"');
        values.push(value);
      }
    }
  },

  'toArray': function (rows, fields) {

    var self = this;
    var count = rows.length;
    var returnRows = new Array(count);
    var parse = self[fields ? 'parseFields' : 'parseGeneric'];

    var data;
    for (var index = 0; index < count; index++) {
      data = rows.item(index);
      returnRows[index] = parse.call(self, data, fields);
    }

    return returnRows;
  },

  'onUpgradeNeeded': function () {

    var self = this;
    self.trigger('upgrading');
    var storeCreationDeferreds = self.mapStores(self.createStore);
    return when(storeCreationDeferreds).promise();
  },

  'createStore': function (storeName, storeInfo) {

    var self = this;

    var deferred = new WBDeferred();
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var fields = storeInfo.fields;

    var sql = SQL.createTable;
    if (!fields) {
      sql = printf(sql, storeName, keyPath, 'json TEXT');
    }
    else {

      if (keyPath === 'id') {
        delete fields.id;
      }

      // convert our Field types to WebSQL types
      var columns = Object.keys(fields).map(function (type) {
        return '"' + type + '" ' + (TYPES[fields[type]] || TYPES.default);
      });

      sql = printf(sql, storeName, keyPath, columns.join(', '));
    }

    self.execute(sql)
      .done(deferred.resolve, deferred)
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_STORE_CREATION_FAILED', error, storeName);
        deferred.reject();
      });

    return deferred.promise();
  },

  'clearStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var sql = printf(SQL.truncateTable, storeName);
    self.execute(sql)
      .done(deferred.resolve, deferred)
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_CLEAR_FAILED', error, storeName);
        deferred.reject();
      });

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;

    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var fields = storeInfo.fields;

    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    var sql = printf(SQL.read, storeName, keyPath, id);
    self.execute(sql)
      .done(function (result) {
        if (result.rows.length === 0) {
          self.trigger('error', 'ERR_WS_OBJECT_NOT_FOUND', null, storeName, json);
          deferred.reject();
        }
        else {
          var elements = self.toArray(result.rows, fields);
          deferred.resolve(elements[0]);
        }
      })
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_READ_FAILED', error, storeName, json);
        deferred.reject();
      });

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var fields = storeInfo && storeInfo.fields;

    var sql = printf(SQL.query, storeName);
    self.execute(sql)
      .done(function (result) {
        var elements = self.toArray(result.rows, fields);
        deferred.resolve(elements);
      })
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_QUERY_FAILED', error, storeName);
        deferred.reject();
      });

    return deferred.promise();
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var fields = storeInfo.fields;

    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    var keys = [keyPath];
    var values = ['\'' + id + '\''];

    var populate = self[fields ? 'populateFields': 'populateGeneric'];
    populate.call(self, keys, values, json, fields, keyPath);

    var sql = printf(SQL.upsert, storeName, keys, values);
    try {

      self.execute(sql)
        .done(function () {
          deferred.resolve();
        })
        .fail(function (error) {
          self.trigger('error', 'ERR_WS_UPDATE_FAILED',
              error, storeName, json);
          deferred.reject();
        });
    }
    catch (error) {
      self.trigger('error', 'ERR_WS_UPDATE_FAILED',
          error, storeName, json);
      deferred.reject();
    }

    return deferred.promise();
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    var sql = printf(SQL.destroy, storeName, keyPath, id);
    self.execute(sql)
      .done(function () {
        deferred.resolve();
      })
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_DESTROY_FAILED',
            error, storeName, json);
        deferred.reject();
      });

    return deferred.promise();
  },

  'nuke': function () {

    var self = this;
    console.warn('cant delete websql database');
    return self.truncate();
  }

});

module.exports = WebSQLBackend;

},{"../lib/FieldTypes":46,"../lib/SafeParse":47,"../lib/global":49,"../lib/printf":50,"./AbstractBackend":38,"wunderbits.core":10}],42:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var WBDeferred = core.WBDeferred;
var assert = core.lib.assert;
var extend = core.lib.extend;
var clone = core.lib.clone;

var MemoryBackend = _dereq_('./Backends/MemoryBackend');
var WebSQLBackend = _dereq_('./Backends/WebSQLBackend');
var IndexedDBBackend = _dereq_('./Backends/IndexedDBBackend');

var Global = _dereq_('./lib/global');

var chrome = Global.chrome;
var isChromeApp = !!(chrome && chrome.app && chrome.app.runtime);
var localStorageAvailable = true;

// tests for storage engine availability
var backendTests = {
  'indexeddb': [
    'indexedDB',
    'webkitIndexedDB',
    'mozIndexedDB',
    'msIndexedDB'
  ],
  'websql': [
    'openDatabase'
  ]
};

var backends = {
  'memory': MemoryBackend,
  'websql': WebSQLBackend,
  'indexeddb': IndexedDBBackend
};

var WBDatabase = WBEventEmitter.extend({

  'crud': {},

  'initialize': function (options) {

    var self = this;
    options = options || {};
    self.ready = new WBDeferred();

    assert.object(options.schema);

    var schema = options.schema;
    self.stores = schema.stores;

    var database = schema.database;
    self.name = database.name;

    // make version change with schema
    var version = (Object.keys(self.stores).length * 10e6);
    version += (parseInt(database.version, 10) || 1);
    self.version = version;
  },

  'init': function (backendName) {

    var self = this;

    // Initialize only once
    var ready = self.ready;
    if (ready.state() === 'resolved') {
      return ready.promise();
    }

    backendName = self.findAvailableBackend(backendName);
    self.backendName = backendName;

    var loggers = self.initLogger(backendName.toUpperCase());
    var stores = self.stores;

    // try to init the available backend
    self.initBackend(backendName, {
      'name': self.name,
      'version': self.version,
      'stores': stores,
      'infoLog': loggers.info,
      'errorLog': loggers.error,
      'localStorageAvailable': localStorageAvailable
    });

    return ready.promise();
  },

  'currentBackend': function () {
    var self = this;
    return self.backendName;
  },

  // Define the loggers
  'initLogger': function (label) {
    return {
      'info': console.info.bind(console, '[' + label + ']'),
      'error': console.error.bind(console, '[' + label + ']')
    };
  },

  'initBackend': function (backendName, options) {

    var self = this;
    var BackendClass = backends[backendName];

    var backend = self.backend = new BackendClass();
    self.options = options;

    // pipe backend errors
    backend.on('error', function () {
      self.trigger.apply(self, arguments);
    });

    backend.connect(options)
      .done(self.initSuccess, self)
      .fail(self.initFailure, self);
  },

  'initSuccess': function () {

    var self = this;
    var backend = self.backend;

    var crudOps = {
      'create': backend.update,
      'read': backend.read,
      'update': backend.update,
      'delete': backend.destroy,
      'query': backend.query
    };

    // bind crud operations to the backend for context
    // also block all DB operations till db is ready
    Object.keys(crudOps).forEach(function (key) {
      var fn = crudOps[key];
      crudOps[key] = function () {
        var args = arguments;
        var deferred = new WBDeferred();
        var ready = backend.ready;
        ready.done(function () {
          fn.apply(backend, args)
            .done(deferred.resolve, deferred)
            .fail(deferred.reject, deferred);
        });
        ready.fail(deferred.reject, deferred);
        return deferred.promise();
      };
    });

    // export crud functions
    extend(self.crud, crudOps);

    // announce once backend is ready
    self.ready.resolve();
    self.publish('ready', {
      'stores': self.stores
    });
  },

  'initFailure': function () {

    var self = this;
    // announce db failure
    self.ready.reject();
  },

  // Test for available storage-backends
  'findAvailableBackend': function (requestedBackend) {

    // way to force a specific backend on init (used by tests)
    if (requestedBackend in backendTests) {
      return requestedBackend;
    }
    else if (chrome && chrome.storage) {
      return 'indexeddb';
    }

    // IF this check has been run previously, load from localStorage
    // But, don't break the app if local storage is not available
    // (disabled by the user)!
    try {
      // throws exception in chrome when cookies are disabled
      var availableBackend = Global.localStorage.getItem('availableBackend');
      if (availableBackend in backendTests) {
        return availableBackend;
      }
    }
    catch (e) {
      // If localStorage lookup fails, we probably have no storage at all
      // Use memory
      localStorageAvailable = false;
      return 'memory';
      //document.write('HTML5 local storage ' +
      //  '(controlled by your cookie settings) ' +
      //  'is required in order use wunderlist.');
    }

    // Test for available storage options, but use memory backend for tests
    var available;
    for (var name in backendTests) {
      var tests = clone(backendTests[name]);
      while (tests.length && !available) {
        if (!!Global[tests.shift()]) {
          available = name;
          break;
        }
      }
    }

    // If none-available, use in-memory as default
    return available || 'memory';
  },

  // Define getAll for the app to load all data in the beginning
  'getAll': function (storeName, callback) {

    var self = this;
    self.ready.done(function () {

      var request = self.backend.query(storeName);
      request.done(callback);
    });
  },

  // Empty the database, but don't destroy the structure
  'truncate': function (callback) {

    var self = this;
    self.ready.done(function () {

      // clear out localstorage as well (in case anything ever was left there)
      if (self.backendName !== 'memory' && !isChromeApp) {
        localStorageAvailable && Global.localStorage.clear();
      }

      self.backend.truncate().then(callback);
    });
  }
});

module.exports = WBDatabase;

},{"./Backends/IndexedDBBackend":39,"./Backends/MemoryBackend":40,"./Backends/WebSQLBackend":41,"./lib/global":49,"wunderbits.core":10}],43:[function(_dereq_,module,exports){
'use strict';

var Global = _dereq_('./lib/global');
var chrome = Global.chrome;
var isChromeApp = chrome && chrome.storage;

var localStorageClass;
if (isChromeApp) {
  localStorageClass = _dereq_('./localStorage/WBChromeLocalStorage');
} else {
  localStorageClass = _dereq_('./localStorage/WBBrowserLocalStorage');
}

module.exports = localStorageClass;

},{"./lib/global":49,"./localStorage/WBBrowserLocalStorage":51,"./localStorage/WBChromeLocalStorage":52}],44:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBSingleton = core.WBSingleton;
var extend = core.lib.extend;

var FieldTypes = _dereq_('./lib/FieldTypes');

var BaseSchema = WBSingleton.extend({
  'FieldTypes': FieldTypes,
  'fields': {}
});

var SpecialFieldTypes = {};
Object.keys(FieldTypes).forEach(function (type) {
  SpecialFieldTypes[type.toLowerCase() + 's'] = FieldTypes[type];
});

function CustomExtend (properties) {

  // extract fields, to be merged later
  var fields = properties.fields;
  delete properties.fields;

  // extend the schema
  var schema = WBSingleton.extend.call(this, properties);
  schema.extend = CustomExtend;

  // translate the alternative format schema
  var key, val, type;
  for (key in fields) {
    val = fields[key];
    type = SpecialFieldTypes[key];
    if (type && Array.isArray(val)) {
      while(val.length) {
        fields[val.shift()] = type;
      }
      delete fields[key];
    }
  }

  // merge fields with the parent
  schema.fields = extend({}, schema.fields, fields);
  return schema;
}

BaseSchema.extend = CustomExtend;

module.exports = BaseSchema;

},{"./lib/FieldTypes":46,"wunderbits.core":10}],45:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'BackboneDBSync': _dereq_('./BackboneDBSync'),
  'WBDatabase': _dereq_('./WBDatabase'),
  'WBLocalStorage': _dereq_('./WBLocalStorage'),
  'WBSchema': _dereq_('./WBSchema')
};

},{"./BackboneDBSync":37,"./WBDatabase":42,"./WBLocalStorage":43,"./WBSchema":44}],46:[function(_dereq_,module,exports){
module.exports = {
  'Array': 'ARRAY',
  'Boolean': 'BOOLEAN',
  'DateTime': 'DATETIME',
  'Float': 'FLOAT',
  'Integer': 'INTEGER',
  'Object': 'OBJECT',
  'Text': 'TEXT'
};
},{}],47:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBSingleton = core.WBSingleton;

function parse (jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn('Unable to parse "' + jsonString + '"');
  }
  return;
}

var SafeParse = WBSingleton.extend({
  'json': parse
});

module.exports = SafeParse;

},{"wunderbits.core":10}],48:[function(_dereq_,module,exports){
'use strict';

function replacer () {
  return (Math.random() * 16 | 0).toString(16);
}

// Auto-generate IDs for new objects
function autoID () {
  return 'lw' + (new Array(31)).join('x').replace(/x/g, replacer);
}

module.exports = autoID;

},{}],49:[function(_dereq_,module,exports){
'use strict';

module.exports = window;

},{}],50:[function(_dereq_,module,exports){
'use strict';

// Generate SQLs, WebSQL's formatter blows
function printf (text) {

  var i = 1;
  var args = arguments;

  return text.replace(/\?/g, function () {
    var value = args[i++];
    if (value === undefined) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value;
  });
}

module.exports = printf;

},{}],51:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBClass = core.WBClass;
var WBDeferred = core.WBDeferred;

var Global = _dereq_('../lib/global');

var localStorage;
try {
  localStorage = Global.localStorage;
}
catch (e) {
  console.warn(e);
}

var WBBrowserLocalStorage = WBClass.extend({

  'getItem': function (key) {

    var deferred = new WBDeferred();
    var value = localStorage.getItem(key);
    return deferred.resolve().promise(value);
  },

  'setItem': function (key, value) {

    var deferred = new WBDeferred();
    try {
      localStorage.setItem(key, value);
      deferred.resolve();
    }
    catch (e) {
      deferred.reject(e);
    }
    return deferred.promise();
  },

  'removeItem': function (key) {

    var deferred = new WBDeferred();
    localStorage.getItem(key);
    return deferred.resolve().promise();
  },

  'clear': function () {

    var deferred = new WBDeferred();
    localStorage.clear();
    return deferred.resolve().promise();
  }
});

module.exports = WBBrowserLocalStorage;

},{"../lib/global":49,"wunderbits.core":10}],52:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBClass = core.WBClass;
var WBDeferred = core.WBDeferred;

var Global = _dereq_('../lib/global');

var chrome = Global.chrome;
var localStorage = chrome && chrome.storage && chrome.storage.local;

var WBChromeLocalStorage = WBClass.extend({

  'getItem': function (key) {

    var deferred = new WBDeferred();

    localStorage.get(key, function (data) {

      if (chrome.runtime.lastError) {
        deferred.reject(chrome.runtime.lastError);
      }
      else {
        var value = data[key];
        deferred.resolve(value);
      }
    });

    return deferred.promise();
  },

  'setItem': function (key, value) {

    var deferred = new WBDeferred();

    var data = {};
    data[key] = value;

    localStorage.set(data, function () {

      if (chrome.runtime.lastError) {
        deferred.reject(chrome.runtime.lastError);
      }
      else {
        deferred.resolve();
      }
    });

    return deferred.promise();
  },

  'removeItem': function (key) {

    var deferred = new WBDeferred();

    localStorage.remove(key, function () {

      if (chrome.runtime.lastError) {
        deferred.reject(chrome.runtime.lastError);
      }
      else {
        deferred.resolve();
      }
    });

    return deferred.promis();
  },

  'clear': function () {

    var deferred = new WBDeferred();

    localStorage.clear(function () {

      if (chrome.runtime.lastError) {
        deferred.reject(chrome.runtime.lastError);
      }
      else {
        deferred.resolve();
      }
    });

    return deferred.promise();
  }
});

module.exports = WBChromeLocalStorage;

},{"../lib/global":49,"wunderbits.core":10}]},{},[45])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvQmFzZUV2ZW50RW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL0Jhc2VTaW5nbGV0b24uanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9XQkNsYXNzLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvV0JEZWZlcnJlZC5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL1dCRXZlbnRFbWl0dGVyLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvV0JNaXhpbi5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL1dCUHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL1dCU2luZ2xldG9uLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvV0JTdGF0ZU1vZGVsLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9saWIvYXNzZXJ0LmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL2NyZWF0ZVVJRC5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi9kZWZlci5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi9kZWxheS5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi9ldmVudHMuanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9saWIvZXh0ZW5kLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL2ZvckVhY2guanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9saWIvZnJvbVN1cGVyLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL2Z1bmN0aW9ucy5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi9pbmhlcml0cy5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi9pc0VxdWFsLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL21lcmdlLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL3NpemUuanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9saWIvdG9BcnJheS5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL2xpYi93aGVuLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbGliL3doZXJlLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbWl4aW5zL0NvbnRyb2xsZXJNaXhpbi5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL21peGlucy9PYnNlcnZhYmxlSGFzaE1peGluLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbWl4aW5zL1dCQmluZGFibGVNaXhpbi5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL21peGlucy9XQkRlc3Ryb3lhYmxlTWl4aW4uanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9taXhpbnMvV0JFdmVudHNNaXhpbi5qcyIsIm5vZGVfbW9kdWxlcy93dW5kZXJiaXRzLmNvcmUvcHVibGljL21peGlucy9XQlN0YXRlTWl4aW4uanMiLCJub2RlX21vZHVsZXMvd3VuZGVyYml0cy5jb3JlL3B1YmxpYy9taXhpbnMvV0JVdGlsc01peGluLmpzIiwibm9kZV9tb2R1bGVzL3d1bmRlcmJpdHMuY29yZS9wdWJsaWMvbWl4aW5zL2luZGV4LmpzIiwicHVibGljL0JhY2tib25lREJTeW5jLmpzIiwicHVibGljL0JhY2tlbmRzL0Fic3RyYWN0QmFja2VuZC5qcyIsInB1YmxpYy9CYWNrZW5kcy9JbmRleGVkREJCYWNrZW5kLmpzIiwicHVibGljL0JhY2tlbmRzL01lbW9yeUJhY2tlbmQuanMiLCJwdWJsaWMvQmFja2VuZHMvV2ViU1FMQmFja2VuZC5qcyIsInB1YmxpYy9XQkRhdGFiYXNlLmpzIiwicHVibGljL1dCTG9jYWxTdG9yYWdlLmpzIiwicHVibGljL1dCU2NoZW1hLmpzIiwicHVibGljL2luZGV4LmpzIiwicHVibGljL2xpYi9GaWVsZFR5cGVzLmpzIiwicHVibGljL2xpYi9TYWZlUGFyc2UuanMiLCJwdWJsaWMvbGliL2dlbmVyYXRlSWQuanMiLCJwdWJsaWMvbGliL2dsb2JhbC5qcyIsInB1YmxpYy9saWIvcHJpbnRmLmpzIiwicHVibGljL2xvY2FsU3RvcmFnZS9XQkJyb3dzZXJMb2NhbFN0b3JhZ2UuanMiLCJwdWJsaWMvbG9jYWxTdG9yYWdlL1dCQ2hyb21lTG9jYWxTdG9yYWdlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIEJhc2VFbWl0dGVyID0gcmVxdWlyZSgnLi9XQkV2ZW50RW1pdHRlcicpLmV4dGVuZCh7XG4gICdtaXhpbnMnOiBbXG4gICAgcmVxdWlyZSgnLi9taXhpbnMvV0JEZXN0cm95YWJsZU1peGluJyksXG4gICAgcmVxdWlyZSgnLi9taXhpbnMvV0JVdGlsc01peGluJyksXG4gICAgcmVxdWlyZSgnLi9taXhpbnMvT2JzZXJ2YWJsZUhhc2hNaXhpbicpXG4gIF1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhc2VFbWl0dGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgQmFzZVNpbmdsZXRvbiA9IHJlcXVpcmUoJy4vV0JTaW5nbGV0b24nKS5leHRlbmQoe1xuICAnbWl4aW5zJzogW1xuICAgIHJlcXVpcmUoJy4vbWl4aW5zL1dCRXZlbnRzTWl4aW4nKSxcbiAgICByZXF1aXJlKCcuL21peGlucy9XQkJpbmRhYmxlTWl4aW4nKSxcbiAgICByZXF1aXJlKCcuL21peGlucy9XQkRlc3Ryb3lhYmxlTWl4aW4nKSxcbiAgICByZXF1aXJlKCcuL21peGlucy9XQlV0aWxzTWl4aW4nKSxcbiAgICByZXF1aXJlKCcuL21peGlucy9PYnNlcnZhYmxlSGFzaE1peGluJylcbiAgXVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFzZVNpbmdsZXRvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnLi9saWIvaW5oZXJpdHMnKTtcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi9leHRlbmQnKTtcbnZhciBjbG9uZSA9IHJlcXVpcmUoJy4vbGliL2Nsb25lJyk7XG52YXIgY3JlYXRlVUlEID0gcmVxdWlyZSgnLi9saWIvY3JlYXRlVUlEJyk7XG52YXIgZnJvbVN1cGVyID0gcmVxdWlyZSgnLi9saWIvZnJvbVN1cGVyJyk7XG5cbi8vIFNlbGYtcHJvcGFnYXRpbmcgZXh0ZW5kIGZ1bmN0aW9uLlxuLy8gQ3JlYXRlIGEgbmV3IGNsYXNzLFxuLy8gdGhhdCBpbmhlcml0cyBmcm9tIHRoZSBjbGFzcyBmb3VuZCBpbiB0aGUgYHRoaXNgIGNvbnRleHQgb2JqZWN0LlxuLy8gVGhpcyBmdW5jdGlvbiBpcyBtZWFudCB0byBiZSBjYWxsZWQsXG4vLyBpbiB0aGUgY29udGV4dCBvZiBhIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLlxuZnVuY3Rpb24gZXh0ZW5kU2VsZiAocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgLyoganNoaW50IHZhbGlkdGhpczp0cnVlICovXG5cbiAgdmFyIHBhcmVudCA9IHRoaXM7XG5cbiAgcHJvdG9Qcm9wcyA9IHByb3RvUHJvcHMgfHwge307XG5cbiAgLy8gZXh0cmFjdCBtaXhpbnMsIGlmIGFueVxuICB2YXIgbWl4aW5zID0gcHJvdG9Qcm9wcy5taXhpbnMgfHwgW107XG4gIGRlbGV0ZSBwcm90b1Byb3BzLm1peGlucztcblxuICAvLyBjcmVhdGUgdGhlIGRlcml2ZWQgY2xhc3NcbiAgdmFyIGNoaWxkID0gaW5oZXJpdHMocGFyZW50LCBwcm90b1Byb3BzLCBzdGF0aWNQcm9wcyk7XG5cbiAgLy8gYXBwbHkgbWl4aW5zIHRvIHRoZSBkZXJpdmVkIGNsYXNzXG4gIHZhciBtaXhpbjtcbiAgd2hpbGUgKG1peGlucy5sZW5ndGgpIHtcbiAgICBtaXhpbiA9IG1peGlucy5zaGlmdCgpO1xuICAgICh0eXBlb2YgbWl4aW4uYXBwbHlUb0NsYXNzID09PSAnZnVuY3Rpb24nKSAmJlxuICAgICAgbWl4aW4uYXBwbHlUb0NsYXNzKGNoaWxkKTtcbiAgfVxuXG4gIC8vIG1ha2UgdGhlIGNoaWxkIGNsYXNzIGV4dGVuc2libGVcbiAgY2hpbGQuZXh0ZW5kID0gcGFyZW50LmV4dGVuZCB8fCBleHRlbmRTZWxmO1xuICByZXR1cm4gY2hpbGQ7XG59XG5cbmZ1bmN0aW9uIFdCQ2xhc3MgKG9wdGlvbnMpIHtcblxuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gQXNzaWduIGEgdW5pcXVlIGlkZW50aWZpZXIgdG8gdGhlIGluc3RhbmNlXG4gIHNlbGYudWlkID0gc2VsZi51aWQgfHwgY3JlYXRlVUlEKCk7XG5cbiAgLy8gc2F2ZSBvcHRpb25zLCBtYWtlIHN1cmUgaXQncyBhdCBsZWFzdCBhbiBlbXB0eSBvYmplY3RcbiAgc2VsZi5vcHRpb25zID0gb3B0aW9ucyB8fCBzZWxmLm9wdGlvbnM7XG5cbiAgLy8gYXVnbWVudCBwcm9wZXJ0aWVzIGZyb20gbWl4aW5zXG4gIHNlbGYuYXVnbWVudFByb3BlcnRpZXMoKTtcblxuICAvLyBpbml0aWFsaXplIHRoZSBpbnN0YW5jZVxuICBzZWxmLmluaXRpYWxpemUuYXBwbHkoc2VsZiwgYXJndW1lbnRzKTtcblxuICAvLyBpbml0aWFsaXplIGFsbCB0aGUgbWl4aW5zLCBpZiBuZWVkZWRcbiAgLy8gZG9uJ3Qga2VlcCB0aGlzIGluIHRoZSBpbml0aWFsaXplLFxuICAvLyBpbml0aWFsaXplIGNhbiBiZSBvdmVyd3JpdHRlblxuICBzZWxmLmluaXRNaXhpbnMuYXBwbHkoc2VsZiwgYXJndW1lbnRzKTtcbn1cblxudmFyIHByb3RvID0ge1xuXG4gICdpbml0aWFsaXplJzogZnVuY3Rpb24gKCkge1xuXG4gICAgLy8gUmV0dXJuIHNlbGYgdG8gYWxsb3cgZm9yIHN1YmNsYXNzIHRvIGFzc2lnblxuICAgIC8vIHN1cGVyIGluaXRpYWxpemVyIHZhbHVlIHRvIHNlbGZcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHNlbGY7XG4gIH0sXG5cbiAgLy8gSWYgYW55IG1peGlucyB3ZXJlIGFwcGxpZWQgdG8gdGhlIHByb3RvdHlwZSwgaW5pdGlhbGl6ZSB0aGVtXG4gICdpbml0TWl4aW5zJzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBpbml0aWFsaXplcnMgPSBmcm9tU3VwZXIuY29uY2F0KHNlbGYsICdpbml0aWFsaXplcnMnKTtcblxuICAgIHZhciBpbml0aWFsaXplcjtcbiAgICB3aGlsZSAoaW5pdGlhbGl6ZXJzLmxlbmd0aCkge1xuICAgICAgaW5pdGlhbGl6ZXIgPSBpbml0aWFsaXplcnMuc2hpZnQoKTtcbiAgICAgICh0eXBlb2YgaW5pdGlhbGl6ZXIgPT09ICdmdW5jdGlvbicpICYmXG4gICAgICAgIGluaXRpYWxpemVyLmFwcGx5KHNlbGYsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9LFxuXG4gIC8vIElmIGFueSBwcm9lcnRpZXMgd2VyZSBkZWZpbmVkIGluIHRoZSBtaXhpbnMsIGF1Z21lbnQgdGhlbSB0byB0aGUgaW5zdGFuY2VcbiAgJ2F1Z21lbnRQcm9wZXJ0aWVzJzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBwcm9wZXJ0aWVzID0gZnJvbVN1cGVyLm1lcmdlKHNlbGYsICdwcm9wZXJ0aWVzJyk7XG5cbiAgICBmdW5jdGlvbiBhdWdtZW50UHJvcGVydHkgKHByb3BlcnR5LCB2YWx1ZSkge1xuXG4gICAgICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcblxuICAgICAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgc2VsZltwcm9wZXJ0eV0gPSB2YWx1ZS5jYWxsKHNlbGYpO1xuICAgICAgfVxuICAgICAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgc2VsZltwcm9wZXJ0eV0gPSBjbG9uZSh2YWx1ZSwgdHJ1ZSk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgc2VsZltwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gcHJvcGVydGllcykge1xuICAgICAgYXVnbWVudFByb3BlcnR5KGtleSwgcHJvcGVydGllc1trZXldKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4dGVuZChXQkNsYXNzLnByb3RvdHlwZSwgcHJvdG8pO1xuV0JDbGFzcy5leHRlbmQgPSBleHRlbmRTZWxmO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdCQ2xhc3M7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBXQkNsYXNzID0gcmVxdWlyZSgnLi9XQkNsYXNzJyk7XG52YXIgV0JQcm9taXNlID0gcmVxdWlyZSgnLi9XQlByb21pc2UnKTtcbnZhciBhc3NlcnQgPSByZXF1aXJlKCcuL2xpYi9hc3NlcnQnKTtcbnZhciB0b0FycmF5ID0gcmVxdWlyZSgnLi9saWIvdG9BcnJheScpO1xuXG52YXIgc3RhdGVzID0ge1xuICAncGVuZGluZyc6IDAsXG4gICdyZXNvbHZlZCc6IDIsXG4gICdyZWplY3RlZCc6IDRcbn07XG5cbnZhciBzdGF0ZU5hbWVzID0ge1xuICAwOiBbJ3BlbmRpbmcnXSxcbiAgMjogWydyZXNvbHZlZCcsICdyZXNvbHZlJ10sXG4gIDQ6IFsncmVqZWN0ZWQnLCAncmVqZWN0J11cbn07XG5cbnZhciBwcm90byA9IHtcblxuICAnY29uc3RydWN0b3InOiBmdW5jdGlvbiAoY29udGV4dCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9jb250ZXh0ID0gY29udGV4dDtcbiAgICBzZWxmLl9zdGF0ZSA9IHN0YXRlcy5wZW5kaW5nO1xuICAgIHNlbGYuX2FyZ3MgPSBbXTtcbiAgICBzZWxmLmhhbmRsZXJzID0gW107XG4gIH0sXG5cbiAgJ3N0YXRlJzogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gc3RhdGVOYW1lc1tzZWxmLl9zdGF0ZV1bMF07XG4gIH0sXG5cbiAgJ3RyaWdnZXInOiBmdW5jdGlvbiAod2l0aENvbnRleHQpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fc3RhdGUgPT09IHN0YXRlcy5wZW5kaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGhhbmRsZXJzID0gc2VsZi5oYW5kbGVycywgaGFuZGxlO1xuICAgIHdoaWxlIChoYW5kbGVycy5sZW5ndGgpIHtcbiAgICAgIGhhbmRsZSA9IGhhbmRsZXJzLnNoaWZ0KCk7XG4gICAgICBzZWxmLmludm9rZShoYW5kbGUsIHdpdGhDb250ZXh0IHx8IHNlbGYuX2NvbnRleHQpO1xuICAgIH1cbiAgfSxcblxuICAnaW52b2tlJzogZnVuY3Rpb24gKGRlZmVycmVkUmVzcG9uc2UsIHdpdGhDb250ZXh0KSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIHN0YXRlID0gc2VsZi5fc3RhdGU7XG4gICAgdmFyIGNvbnRleHQgPSBkZWZlcnJlZFJlc3BvbnNlLmNvbnRleHQgfHwgd2l0aENvbnRleHQgfHwgc2VsZjtcbiAgICB2YXIgYXJncyA9IGRlZmVycmVkUmVzcG9uc2UuYXJncztcblxuICAgIHNlbGYuX2FyZ3MuZm9yRWFjaChmdW5jdGlvbiAoYXJnKSB7XG4gICAgICAvLyBzZW5kIHNpbmdsZSBhcmd1bWVudHMgYXMgdGhlIGl0ZW0sIG90aGVyd2lzZSBzZW5kIGl0IGFzIGFuIGFycmF5XG4gICAgICBhcmdzLnB1c2goYXJnKTtcbiAgICB9KTtcblxuICAgIHZhciB0eXBlID0gZGVmZXJyZWRSZXNwb25zZS50eXBlO1xuICAgIHZhciBpc0NvbXBsZXRlZCA9ICh0eXBlID09PSAndGhlbicpIHx8XG4gICAgICAodHlwZSA9PT0gJ2RvbmUnICYmIHN0YXRlID09PSBzdGF0ZXMucmVzb2x2ZWQpIHx8XG4gICAgICAodHlwZSA9PT0gJ2ZhaWwnICYmIHN0YXRlID09PSBzdGF0ZXMucmVqZWN0ZWQpO1xuXG4gICAgaXNDb21wbGV0ZWQgJiYgZGVmZXJyZWRSZXNwb25zZS5mbi5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgfSxcblxuICAncHJvbWlzZSc6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5fcHJvbWlzZSA9IHNlbGYuX3Byb21pc2UgfHwgbmV3IFdCUHJvbWlzZSh0aGlzKTtcbiAgICByZXR1cm4gc2VsZi5fcHJvbWlzZTtcbiAgfVxufTtcblxuWyd0aGVuJywgJ2RvbmUnLCAnZmFpbCddLmZvckVhY2goZnVuY3Rpb24gKG1ldGhvZCkge1xuICBwcm90b1ttZXRob2RdID0gZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gc3RvcmUgcmVmZXJlbmNlcyB0byB0aGUgY29udGV4dCwgY2FsbGJhY2tzLCBhbmQgYXJiaXRyYXJ5IGFyZ3VtZW50c1xuICAgIHZhciBhcmdzID0gdG9BcnJheShhcmd1bWVudHMpO1xuICAgIHZhciBmbiA9IGFyZ3Muc2hpZnQoKTtcbiAgICB2YXIgY29udGV4dCA9IGFyZ3Muc2hpZnQoKTtcblxuICAgIGFzc2VydC5mdW5jdGlvbihmbiwgbWV0aG9kICsgJyBhY2NlcHRzIG9ubHkgZnVuY3Rpb25zJyk7XG5cbiAgICBzZWxmLmhhbmRsZXJzLnB1c2goe1xuICAgICAgJ3R5cGUnOiBtZXRob2QsXG4gICAgICAnY29udGV4dCc6IGNvbnRleHQsXG4gICAgICAnZm4nOiBmbixcbiAgICAgICdhcmdzJzogYXJnc1xuICAgIH0pO1xuXG4gICAgLy8gaWYgdGhlIGRlZmVyZWQgaXMgbm90IHBlbmRpbmcgYW55bW9yZSwgY2FsbCB0aGUgY2FsbGJhY2tzXG4gICAgc2VsZi50cmlnZ2VyKCk7XG5cbiAgICByZXR1cm4gc2VsZjtcbiAgfTtcbn0pO1xuXG4vLyBBbGlhcyBgYWx3YXlzYCB0byBgdGhlbmAgb24gRGVmZXJyZWQncyBwcm90b3R5cGVcbnByb3RvLmFsd2F5cyA9IHByb3RvLnRoZW47XG5cbmZ1bmN0aW9uIHJlc29sdmVyIChzdGF0ZSwgaXNXaXRoLCBmbk5hbWUpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGNvbXBsZXRlICgpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmICghKHNlbGYgaW5zdGFuY2VvZiBXQkRlZmVycmVkKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGZuTmFtZSArICcgaW52b2tlZCB3aXRoIHdyb25nIGNvbnRleHQnKTtcbiAgICB9XG5cbiAgICAvLyBjYW4ndCBjaGFuZ2Ugc3RhdGUgb25jZSByZXNvbHZlZCBvciByZWplY3RlZFxuICAgIGlmIChzZWxmLl9zdGF0ZSAhPT0gc3RhdGVzLnBlbmRpbmcpIHtcbiAgICAgIHJldHVybiBzZWxmO1xuICAgIH1cblxuICAgIHNlbGYuX2FyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG4gICAgdmFyIGNvbnRleHQgPSBpc1dpdGggPyBzZWxmLl9hcmdzLnNoaWZ0KCkgOiB1bmRlZmluZWQ7XG5cbiAgICBzZWxmLl9zdGF0ZSA9IHN0YXRlO1xuICAgIHNlbGYudHJpZ2dlcihjb250ZXh0KTtcblxuICAgIHJldHVybiBzZWxmO1xuICB9O1xufVxuXG5bc3RhdGVzLnJlc29sdmVkLCBzdGF0ZXMucmVqZWN0ZWRdLmZvckVhY2goZnVuY3Rpb24gKHN0YXRlKSB7XG4gIHZhciBmbk5hbWUgPSBzdGF0ZU5hbWVzW3N0YXRlXVsxXTtcbiAgcHJvdG9bZm5OYW1lXSA9IHJlc29sdmVyKHN0YXRlLCBmYWxzZSwgZm5OYW1lKTtcbiAgcHJvdG9bZm5OYW1lICsgJ1dpdGgnXSA9IHJlc29sdmVyKHN0YXRlLCB0cnVlLCBmbk5hbWUpO1xufSk7XG5cbnZhciBXQkRlZmVycmVkID0gV0JDbGFzcy5leHRlbmQocHJvdG8pO1xubW9kdWxlLmV4cG9ydHMgPSBXQkRlZmVycmVkO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgV0JFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCcuL1dCQ2xhc3MnKS5leHRlbmQoe1xuICAnbWl4aW5zJzogW1xuICAgIHJlcXVpcmUoJy4vbWl4aW5zL1dCQmluZGFibGVNaXhpbicpLFxuICAgIHJlcXVpcmUoJy4vbWl4aW5zL1dCRXZlbnRzTWl4aW4nKVxuICBdXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXQkV2ZW50RW1pdHRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL2V4dGVuZCcpO1xudmFyIGNsb25lID0gcmVxdWlyZSgnLi9saWIvY2xvbmUnKTtcbnZhciBhc3NlcnQgPSByZXF1aXJlKCcuL2xpYi9hc3NlcnQnKTtcbnZhciBXQlNpbmdsZXRvbiA9IHJlcXVpcmUoJy4vV0JTaW5nbGV0b24nKTtcblxudmFyIFdCTWl4aW4gPSBXQlNpbmdsZXRvbi5leHRlbmQoe1xuXG4gIC8vIEFwcGx5IHRoZSBtaXhpbiB0byBhbiBpbnN0YW5jZSBvZiBhIGNsYXNzXG4gICdhcHBseVRvJzogZnVuY3Rpb24gKGluc3RhbmNlKSB7XG5cbiAgICB2YXIgYmVoYXZpb3IgPSBjbG9uZSh0aGlzLkJlaGF2aW9yLCB0cnVlKTtcblxuICAgIC8vIGFwcGx5IG1peGluJ3MgaW5pdGlhbGl6ZSAmIHJlbW92ZSBpdCBmcm9tIHRoZSBpbnN0YW5jZVxuICAgIHZhciBpbml0aWFsaXplcjtcbiAgICBpZiAodHlwZW9mIGJlaGF2aW9yLmluaXRpYWxpemUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGluaXRpYWxpemVyID0gYmVoYXZpb3IuaW5pdGlhbGl6ZTtcbiAgICAgIGRlbGV0ZSBiZWhhdmlvci5pbml0aWFsaXplO1xuICAgIH1cblxuICAgIC8vIGF1Z21lbnQgbWl4aW4ncyBwcm9wZXJ0aWVzIG9iamVjdCBpbnRvIHRoZSBpbnN0YW5jZVxuICAgIHZhciBwcm9wZXJ0aWVzID0gYmVoYXZpb3IucHJvcGVydGllcztcbiAgICBkZWxldGUgYmVoYXZpb3IucHJvcGVydGllcztcblxuICAgIC8vIG1peGluIHRoZSBiZWhhdmlvclxuICAgIGV4dGVuZChpbnN0YW5jZSwgYmVoYXZpb3IpO1xuXG4gICAgLy8gYXBwbHkgdGhlIGluaXRpYWxpemVyLCBpZiBhbnlcbiAgICBpbml0aWFsaXplciAmJiBpbml0aWFsaXplci5hcHBseShpbnN0YW5jZSk7XG5cbiAgICAvLyBhdWdtZW50IHByb2VydGllcyB0byB0aGUgaW5zdGFuY2VcbiAgICBwcm9wZXJ0aWVzICYmIGV4dGVuZChpbnN0YW5jZSwgcHJvcGVydGllcyk7XG5cbiAgICByZXR1cm4gaW5zdGFuY2U7XG4gIH0sXG5cbiAgLy8gQXBwbHkgdGhlIG1peGluIHRvIHRoZSBjbGFzcyBkaXJlY3RseVxuICAnYXBwbHlUb0NsYXNzJzogZnVuY3Rpb24gKGtsYXNzKSB7XG5cbiAgICAvLyB2YWxpZGF0ZSBjbGFzc1xuICAgIGFzc2VydC5jbGFzcyhrbGFzcywgJ2FwcGx5VG9DbGFzcyBleHBlY3RzIGEgY2xhc3MnKTtcblxuICAgIHZhciBwcm90byA9IGtsYXNzLnByb3RvdHlwZTtcbiAgICB2YXIgYmVoYXZpb3IgPSBjbG9uZSh0aGlzLkJlaGF2aW9yLCB0cnVlKTtcblxuICAgIC8vIGNhY2hlIHRoZSBtaXhpbidzIGluaXRpYWxpemVyLCB0byBiZSBhcHBsaWVkIGxhdGVyXG4gICAgdmFyIGluaXRpYWxpemUgPSBiZWhhdmlvci5pbml0aWFsaXplO1xuICAgIGlmICh0eXBlb2YgaW5pdGlhbGl6ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgKCFwcm90by5oYXNPd25Qcm9wZXJ0eSgnaW5pdGlhbGl6ZXJzJykpICYmIChwcm90by5pbml0aWFsaXplcnMgPSBbXSk7XG4gICAgICBwcm90by5pbml0aWFsaXplcnMucHVzaChpbml0aWFsaXplKTtcbiAgICAgIGRlbGV0ZSBiZWhhdmlvci5pbml0aWFsaXplO1xuICAgIH1cblxuICAgIHZhciBwcm9wZXJ0aWVzID0gYmVoYXZpb3IucHJvcGVydGllcztcbiAgICBkZWxldGUgYmVoYXZpb3IucHJvcGVydGllcztcblxuICAgIC8vIGV4dGVuZCB0aGUgcHJvdG90eXBlXG4gICAgZXh0ZW5kKHByb3RvLCBiZWhhdmlvcik7XG5cbiAgICAvLyBjYWNoZSB0aGUgcHJvcGVydGllcywgdG8gYmUgYXBwbGllZCBsYXRlclxuICAgICghcHJvdG8uaGFzT3duUHJvcGVydHkoJ3Byb3BlcnRpZXMnKSkgJiYgKHByb3RvLnByb3BlcnRpZXMgPSB7fSk7XG4gICAgcHJvcGVydGllcyAmJiBleHRlbmQocHJvdG8ucHJvcGVydGllcywgcHJvcGVydGllcyk7XG5cbiAgICByZXR1cm4ga2xhc3M7XG4gIH1cbn0pO1xuXG4vLyBUaGUgb25seSByZWFsIGNoYW5nZSBmcm9tIGEgc2ltcGxlIHNpbmdsZXRvbiBpc1xuLy8gdGhlIGFsdGVyZWQgZXh0ZW5kIGNsYXNzIG1ldGhvZCwgd2hpY2ggd2lsbCBzYXZlXG4vLyBcIm1peGluUHJvcHNcIiBpbnRvIGEgc3BlY2lmaWMgbWVtYmVyLCBmb3IgZWFzeVxuLy8gYW5kIGNsZWFuIGFwcGxpY2F0aW9uIHVzaW5nICNhcHBseVRvXG5XQk1peGluLmV4dGVuZCA9IGZ1bmN0aW9uIChtaXhpblByb3BzLCBzdGF0aWNQcm9wcykge1xuXG4gIG1peGluUHJvcHMgfHwgKG1peGluUHJvcHMgPSB7fSk7XG4gIHN0YXRpY1Byb3BzIHx8IChzdGF0aWNQcm9wcyA9IHt9KTtcblxuICB2YXIgY3VycmVudCA9IGNsb25lKHRoaXMuQmVoYXZpb3IsIHRydWUpO1xuICBzdGF0aWNQcm9wcy5CZWhhdmlvciA9IGV4dGVuZChjdXJyZW50LCBtaXhpblByb3BzKTtcbiAgdmFyIG1peGluID0gV0JTaW5nbGV0b24uZXh0ZW5kLmNhbGwodGhpcywgc3RhdGljUHJvcHMpO1xuXG4gIG1peGluLmV4dGVuZCA9IFdCTWl4aW4uZXh0ZW5kO1xuXG4gIHJldHVybiBtaXhpbjtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gV0JNaXhpbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFdCQ2xhc3MgPSByZXF1aXJlKCcuL1dCQ2xhc3MnKTtcblxuZnVuY3Rpb24gcHJveHkgKG5hbWUpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgZGVmZXJyZWQgPSB0aGlzLmRlZmVycmVkO1xuICAgIGRlZmVycmVkW25hbWVdLmFwcGx5KGRlZmVycmVkLCBhcmd1bWVudHMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG52YXIgcHJvdG8gPSB7XG4gICdjb25zdHJ1Y3Rvcic6IGZ1bmN0aW9uIChkZWZlcnJlZCkge1xuICAgIHRoaXMuZGVmZXJyZWQgPSBkZWZlcnJlZDtcbiAgfSxcblxuICAncHJvbWlzZSc6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICAnc3RhdGUnOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVmZXJyZWQuc3RhdGUoKTtcbiAgfVxufTtcblxuW1xuICAnZG9uZScsXG4gICdmYWlsJyxcbiAgJ3RoZW4nXG5dLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgcHJvdG9bbmFtZV0gPSBwcm94eShuYW1lKTtcbn0pO1xuXG5wcm90by5hbHdheXMgPSBwcm90by50aGVuO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdCQ2xhc3MuZXh0ZW5kKHByb3RvKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL2V4dGVuZCcpO1xudmFyIGNyZWF0ZVVJRCA9IHJlcXVpcmUoJy4vbGliL2NyZWF0ZVVJRCcpO1xuXG5mdW5jdGlvbiBhcHBseU1peGlucyAobWl4aW5zLCBpbnN0YW5jZSkge1xuICB2YXIgbWl4aW47XG4gIHdoaWxlIChtaXhpbnMubGVuZ3RoKSB7XG4gICAgbWl4aW4gPSBtaXhpbnMuc2hpZnQoKTtcbiAgICAodHlwZW9mIG1peGluLmFwcGx5VG8gPT09ICdmdW5jdGlvbicpICYmXG4gICAgICBtaXhpbi5hcHBseVRvKGluc3RhbmNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBleHRlbmRTZWxmIChzdGF0aWNQcm9wcykge1xuICAvKiBqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cblxuICBzdGF0aWNQcm9wcyA9IHN0YXRpY1Byb3BzIHx8IHt9O1xuXG4gIC8vIGV4dGVuZCBmcm9tIHRoZSBiYXNlIHNpbmdsZXRvblxuICB2YXIgQmFzZVNpbmdsZXRvbiA9IHRoaXMgfHwgV0JTaW5nbGV0b247XG5cbiAgLy8gY3JlYXRlIGEgbmV3IGluc3RhbmNlXG4gIEN0b3IucHJvdG90eXBlID0gQmFzZVNpbmdsZXRvbjtcbiAgdmFyIHNpbmdsZXRvbiA9IG5ldyBDdG9yKCk7XG5cbiAgLy8gZXh0cmFjdCBtaXhpbnNcbiAgdmFyIG1peGlucyA9IHN0YXRpY1Byb3BzLm1peGlucyB8fCBbXTtcbiAgc3RhdGljUHJvcHMubWl4aW5zID0gdW5kZWZpbmVkO1xuXG4gIC8vIGFwcGx5IG1peGlucyB0byB0aGUgaW5zdGFuY2VcbiAgYXBwbHlNaXhpbnMobWl4aW5zLCBzaW5nbGV0b24pO1xuXG4gIC8vIGFwcGVuZCB0aGUgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIHNpbmdsZXRvblxuICBleHRlbmQoc2luZ2xldG9uLCBzdGF0aWNQcm9wcyk7XG5cbiAgLy8gbWFrZSB0aGUgc2luZ2xldG9uIGV4dGVuZGFibGVcbiAgLy8gRG8gdGhpcyBhZnRlciBhcHBseWluZyBtaXhpbnMsXG4gIC8vIHRvIGVuc3VyZSB0aGF0IG5vIG1peGluIGNhbiBvdmVycmlkZSBgZXh0ZW5kYCBtZXRob2RcbiAgc2luZ2xldG9uLmV4dGVuZCA9IGV4dGVuZFNlbGY7XG5cbiAgLy8gZXZlcnkgc2lnbmxldG9uIGdldHMgYSBVSURcbiAgc2luZ2xldG9uLnVpZCA9IGNyZWF0ZVVJRCgpO1xuXG4gIHJldHVybiBzaW5nbGV0b247XG59XG5cbnZhciBDdG9yID0gZnVuY3Rpb24gKCkge307XG5DdG9yLnByb3RvdHlwZSA9IHtcbiAgJ2V4dGVuZCc6IGV4dGVuZFNlbGZcbn07XG5cbnZhciBXQlNpbmdsZXRvbiA9IG5ldyBDdG9yKCk7XG5tb2R1bGUuZXhwb3J0cyA9IFdCU2luZ2xldG9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgV0JDbGFzcyA9IHJlcXVpcmUoJy4vV0JDbGFzcycpO1xuXG52YXIgV0JEZXN0cm95YWJsZU1peGluID0gcmVxdWlyZSgnLi9taXhpbnMvV0JEZXN0cm95YWJsZU1peGluJyk7XG52YXIgb3JpZ2luYWxEZXN0cm95ID0gV0JEZXN0cm95YWJsZU1peGluLkJlaGF2aW9yLmRlc3Ryb3k7XG5cbnZhciBXQlN0YXRlTW9kZWwgPSBXQkNsYXNzLmV4dGVuZCh7XG5cbiAgJ21peGlucyc6IFtcbiAgICByZXF1aXJlKCcuL21peGlucy9XQkV2ZW50c01peGluJyksXG4gICAgcmVxdWlyZSgnLi9taXhpbnMvV0JTdGF0ZU1peGluJyksXG4gICAgcmVxdWlyZSgnLi9taXhpbnMvV0JCaW5kYWJsZU1peGluJyksXG4gICAgV0JEZXN0cm95YWJsZU1peGluXG4gIF0sXG5cbiAgJ2luaXRpYWxpemUnOiBmdW5jdGlvbiAoYXR0cmlidXRlcykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKGF0dHJpYnV0ZXMpIHtcbiAgICAgIHNlbGYuYXR0cmlidXRlcyA9IGF0dHJpYnV0ZXM7XG4gICAgfVxuICB9LFxuXG4gICdzeW5jJzogIGZ1bmN0aW9uIChtZXRob2QsIGluc3RhbmNlLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMuc3VjY2VzcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgb3B0aW9ucy5zdWNjZXNzKCk7XG4gICAgfVxuICB9LFxuXG4gICdmZXRjaCc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBzdWNjZXNzID0gb3B0aW9ucy5zdWNjZXNzO1xuICAgIHZhciBtb2RlbCA9IHRoaXM7XG4gICAgb3B0aW9ucy5zdWNjZXNzID0gZnVuY3Rpb24gKHJlc3ApIHtcbiAgICAgIGlmICghbW9kZWwuc2V0KHJlc3AsIG9wdGlvbnMpKSByZXR1cm4gZmFsc2U7XG4gICAgICBpZiAoc3VjY2Vzcykgc3VjY2Vzcyhtb2RlbCwgcmVzcCwgb3B0aW9ucyk7XG4gICAgICBtb2RlbC50cmlnZ2VyKCdzeW5jJywgbW9kZWwsIHJlc3AsIG9wdGlvbnMpO1xuICAgIH07XG4gICAgcmV0dXJuIHNlbGYuc3luYygncmVhZCcsIHNlbGYsIG9wdGlvbnMpO1xuICB9LFxuXG4gICdzYXZlJzogZnVuY3Rpb24gKGtleSwgdmFsLCBvcHRpb25zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLmRlc3Ryb3lpbmcpIHtcbiAgICAgIC8vIHNldCB0aGUgYXR0cmlidXRlc1xuICAgICAgc2VsZi5zZXQoa2V5LCB2YWwsIG9wdGlvbnMpO1xuICAgICAgLy8gc3luY1xuICAgICAgKHR5cGVvZiBrZXkgPT09ICdvYmplY3QnKSAmJiAob3B0aW9ucyA9IHZhbCk7XG4gICAgICBzZWxmLnN5bmMoJ3VwZGF0ZScsIHNlbGYsIG9wdGlvbnMpO1xuICAgIH1cbiAgICByZXR1cm4gc2VsZjtcbiAgfSxcblxuICAnZGVzdHJveSc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLmRlc3Ryb3lpbmcpIHtcbiAgICAgIHNlbGYuZGVzdHJveWluZyA9IHRydWU7XG4gICAgICBvcmlnaW5hbERlc3Ryb3kuY2FsbChzZWxmLCBvcHRpb25zKTtcbiAgICAgIHNlbGYuYXR0cmlidXRlcyA9IHt9O1xuICAgICAgc2VsZi5zeW5jKCdkZWxldGUnLCBzZWxmLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdCU3RhdGVNb2RlbDtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICdsaWInOiByZXF1aXJlKCcuL2xpYicpLFxuICAnQmFzZUV2ZW50RW1pdHRlcic6IHJlcXVpcmUoJy4vQmFzZUV2ZW50RW1pdHRlcicpLFxuICAnQmFzZVNpbmdsZXRvbic6IHJlcXVpcmUoJy4vQmFzZVNpbmdsZXRvbicpLFxuICAnV0JDbGFzcyc6IHJlcXVpcmUoJy4vV0JDbGFzcycpLFxuICAnV0JEZWZlcnJlZCc6IHJlcXVpcmUoJy4vV0JEZWZlcnJlZCcpLFxuICAnV0JFdmVudEVtaXR0ZXInOiByZXF1aXJlKCcuL1dCRXZlbnRFbWl0dGVyJyksXG4gICdXQk1peGluJzogcmVxdWlyZSgnLi9XQk1peGluJyksXG4gICdXQlNpbmdsZXRvbic6IHJlcXVpcmUoJy4vV0JTaW5nbGV0b24nKSxcbiAgJ1dCU3RhdGVNb2RlbCc6IHJlcXVpcmUoJy4vV0JTdGF0ZU1vZGVsJyksXG4gICdtaXhpbnMnOiByZXF1aXJlKCcuL21peGlucycpXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhc3NlcnQgKGNvbmRpdGlvbiwgbWVzc2FnZSkge1xuICBpZiAoIWNvbmRpdGlvbikge1xuICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICcnKTtcbiAgfVxufVxuXG52YXIgbmF0aXZlSXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5hc3NlcnQuZW1wdHkgPSBmdW5jdGlvbiAob2JqZWN0LCBtZXNzYWdlKSB7XG4gIHZhciBrZXlzID0gbmF0aXZlSXNBcnJheShvYmplY3QpID8gb2JqZWN0IDogT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgYXNzZXJ0KGtleXMubGVuZ3RoID09PSAwLCBtZXNzYWdlKTtcbn07XG5cbmFzc2VydC5hcnJheSA9IGZ1bmN0aW9uIChhcnJheSwgbWVzc2FnZSkge1xuICBhc3NlcnQobmF0aXZlSXNBcnJheShhcnJheSksIG1lc3NhZ2UpO1xufTtcblxuYXNzZXJ0LmNsYXNzID0gZnVuY3Rpb24gKGtsYXNzLCBtZXNzYWdlKSB7XG4gIHZhciBwcm90byA9IGtsYXNzLnByb3RvdHlwZTtcbiAgYXNzZXJ0KHByb3RvICYmIHByb3RvLmNvbnN0cnVjdG9yID09PSBrbGFzcywgbWVzc2FnZSk7XG59O1xuXG52YXIgdHlwZXMgPSBbXG4gICd1bmRlZmluZWQnLFxuICAnYm9vbGVhbicsXG4gICdudW1iZXInLFxuICAnc3RyaW5nJyxcbiAgJ2Z1bmN0aW9uJyxcbiAgJ29iamVjdCdcbl07XG5cbmZ1bmN0aW9uIHR5cGVjaGVjayAodHlwZSkge1xuICBhc3NlcnRbdHlwZV0gPSBmdW5jdGlvbiAobywgbWVzc2FnZSkge1xuICAgIGFzc2VydCh0eXBlb2YgbyA9PT0gdHlwZSwgbWVzc2FnZSk7XG4gIH07XG59XG5cbndoaWxlICh0eXBlcy5sZW5ndGgpIHtcbiAgdHlwZWNoZWNrKHR5cGVzLnNoaWZ0KCkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFzc2VydDsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBuYXRpdmVJc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcblxuZnVuY3Rpb24gY2xvbmVBcnJheSAoYXJyLCBpc0RlZXApIHtcbiAgYXJyID0gYXJyLnNsaWNlKCk7XG4gIGlmIChpc0RlZXApIHtcbiAgICB2YXIgbmV3QXJyID0gW10sIHZhbHVlO1xuICAgIHdoaWxlIChhcnIubGVuZ3RoKSB7XG4gICAgICB2YWx1ZSA9IGFyci5zaGlmdCgpO1xuICAgICAgdmFsdWUgPSAodmFsdWUgaW5zdGFuY2VvZiBPYmplY3QpID8gY2xvbmUodmFsdWUsIGlzRGVlcCkgOiB2YWx1ZTtcbiAgICAgIG5ld0Fyci5wdXNoKHZhbHVlKTtcbiAgICB9XG4gICAgYXJyID0gbmV3QXJyO1xuICB9XG4gIHJldHVybiBhcnI7XG59XG5cbmZ1bmN0aW9uIGNsb25lRGF0ZSAoZGF0ZSkge1xuICByZXR1cm4gbmV3IERhdGUoZGF0ZSk7XG59XG5cbmZ1bmN0aW9uIGNsb25lT2JqZWN0IChzb3VyY2UsIGlzRGVlcCkge1xuICB2YXIgb2JqZWN0ID0ge307XG4gIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHNvdXJjZVtrZXldO1xuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3Rba2V5XSA9IGNsb25lRGF0ZSh2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgaXNEZWVwKSB7XG4gICAgICAgIG9iamVjdFtrZXldID0gY2xvbmUodmFsdWUsIGlzRGVlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3Rba2V5XSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBjbG9uZSAob2JqLCBpc0RlZXApIHtcblxuICBpZiAobmF0aXZlSXNBcnJheShvYmopKSB7XG4gICAgcmV0dXJuIGNsb25lQXJyYXkob2JqLCBpc0RlZXApO1xuICB9XG5cbiAgcmV0dXJuIGNsb25lT2JqZWN0KG9iaiwgaXNEZWVwKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gcmVwbGFjZXIgKG1hdGNoKSB7XG4gIHZhciByYW5kID0gTWF0aC5yYW5kb20oKSAqIDE2IHwgMDtcbiAgdmFyIGNociA9IChtYXRjaCA9PT0gJ3gnKSA/IHJhbmQgOiAocmFuZCAmIDB4MyB8IDB4OCk7XG4gIHJldHVybiBjaHIudG9TdHJpbmcoMTYpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVVSUQgKHByZWZpeCkge1xuICB2YXIgdWlkID0gJ3h4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcucmVwbGFjZSgvW3h5XS9nLCByZXBsYWNlcik7XG4gIHJldHVybiBTdHJpbmcoIXByZWZpeCA/ICcnIDogcHJlZml4KSArIHVpZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVVSUQ7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0b0FycmF5ID0gcmVxdWlyZSgnLi90b0FycmF5Jyk7XG52YXIgZGVsYXkgPSByZXF1aXJlKCcuL2RlbGF5Jyk7XG5cbmZ1bmN0aW9uIGRlZmVyIChmbikge1xuICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgYXJnc1swXSA9IDE7XG4gIGFyZ3MudW5zaGlmdChmbik7XG4gIHJldHVybiBkZWxheS5hcHBseShudWxsLCBhcmdzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWZlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRvQXJyYXkgPSByZXF1aXJlKCcuL3RvQXJyYXknKTtcblxuZnVuY3Rpb24gZGVsYXkgKGZuLCB0aW1lLCBjb250ZXh0KSB7XG4gIHZhciBhcmdzID0gdG9BcnJheShhcmd1bWVudHMsIDMpO1xuICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgZGVzdHJveWVkID0gY29udGV4dCAmJiBjb250ZXh0LmRlc3Ryb3llZDtcbiAgICAhZGVzdHJveWVkICYmIGZuLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICB9LCB0aW1lKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWxheTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFzc2VydCA9IHJlcXVpcmUoJy4vYXNzZXJ0Jyk7XG52YXIgdG9BcnJheSA9IHJlcXVpcmUoJy4vdG9BcnJheScpO1xudmFyIGNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xuXG52YXIgZXZlbnRTcGxpdHRlciA9IC9cXHMrLztcblxudmFyIHZhbGlkYXRpb25FcnJvcnMgPSB7XG4gICd0cmlnZ2VyJzogJ0Nhbm5vdCB0cmlnZ2VyIGV2ZW50KHMpIHdpdGhvdXQgZXZlbnQgbmFtZShzKScsXG4gICdldmVudHMnOiAnQ2Fubm90IGJpbmQvdW5iaW5kIHdpdGhvdXQgdmFsaWQgZXZlbnQgbmFtZShzKScsXG4gICdjYWxsYmFjayc6ICdDYW5ub3QgYmluZC91bmJpbmQgdG8gYW4gZXZlbnQgd2l0aG91dCB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbidcbn07XG5cbnZhciBldmVudHMgPSB7XG5cbiAgJ3Byb3BlcnRpZXMnOiB7XG4gICAgJ19ldmVudHMnOiB7fSxcbiAgICAnX2NhY2hlJzoge31cbiAgfSxcblxuICAnb24nOiBmdW5jdGlvbiAoZXZlbnRzLCBjYWxsYmFjaywgY29udGV4dCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gdmFsaWRhdGUgYXJndW1lbnRzXG4gICAgYXNzZXJ0LnN0cmluZyhldmVudHMsIHZhbGlkYXRpb25FcnJvcnMuZXZlbnRzKTtcbiAgICBhc3NlcnQuZnVuY3Rpb24oY2FsbGJhY2ssIHZhbGlkYXRpb25FcnJvcnMuY2FsbGJhY2spO1xuXG4gICAgLy8gbG9vcCB0aHJvdWdoIHRoZSBldmVudHMgJiBiaW5kIHRoZW1cbiAgICBzZWxmLml0ZXJhdGUoZXZlbnRzLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgLy8ga2VlcCB0aGUgYmluZGluZ1xuICAgICAgc2VsZi5iaW5kKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KTtcblxuICAgICAgLy8gaWYgdGhpcyB3YXMgYSBwdWJsaXNoZWQgZXZlbnQsIGRvIGFuIGltbWVkaWF0ZSB0cmlnZ2VyXG4gICAgICB2YXIgY2FjaGUgPSBzZWxmLl9jYWNoZTtcbiAgICAgIGlmIChjYWNoZVtuYW1lXSkge1xuICAgICAgICBjYWxsYmFjay5hcHBseShjb250ZXh0IHx8IHNlbGYsIGNhY2hlW25hbWVdKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBzZWxmO1xuICB9LFxuXG4gICdvZmYnOiBmdW5jdGlvbiAoZXZlbnRzLCBjYWxsYmFjaywgY29udGV4dCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gdmFsaWRhdGUgZXZlbnRzIG9ubHkgaWYgYSB0cnV0aHkgdmFsdWUgaXMgcGFzc2VkXG4gICAgZXZlbnRzICYmIGFzc2VydC5zdHJpbmcoZXZlbnRzLCB2YWxpZGF0aW9uRXJyb3JzLmV2ZW50cyk7XG5cbiAgICAvLyBpZiBubyBhcmd1bWVudHMgd2VyZSBwYXNzZWQsIHVuYmluZCBldmVyeXRoaW5nXG4gICAgaWYgKCFldmVudHMgJiYgIWNhbGxiYWNrICYmICFjb250ZXh0KSB7XG4gICAgICBzZWxmLl9ldmVudHMgPSB7fTtcbiAgICAgIHJldHVybiBzZWxmO1xuICAgIH1cblxuICAgIC8vIGlmIG5vIGV2ZW50cyBhcmUgcGFzc2VkLCB1bmJpbmQgYWxsIGV2ZW50cyB3aXRoIHRoaXMgY2FsbGJhY2tcbiAgICBldmVudHMgPSBldmVudHMgfHwgT2JqZWN0LmtleXMoc2VsZi5fZXZlbnRzKTtcblxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUgZXZlbnRzICYgYmluZCB0aGVtXG4gICAgc2VsZi5pdGVyYXRlKGV2ZW50cywgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNlbGYudW5iaW5kKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBzZWxmO1xuICB9LFxuXG4gICdvbmNlJzogZnVuY3Rpb24gKGV2ZW50cywgY2FsbGJhY2ssIGNvbnRleHQpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcblxuICAgIC8vIGNyZWF0ZSBhIG9uZSB0aW1lIGJpbmRpbmdcbiAgICBhcmdzWzFdID0gZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5vZmYuYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgICBjYWxsYmFjay5hcHBseShjb250ZXh0IHx8IHNlbGYsIGFyZ3VtZW50cyk7XG4gICAgfTtcblxuICAgIHNlbGYub24uYXBwbHkoc2VsZiwgYXJncyk7XG5cbiAgICByZXR1cm4gc2VsZjtcbiAgfSxcblxuICAncHVibGlzaCc6IGZ1bmN0aW9uIChldmVudHMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcblxuICAgIC8vIHZhbGlkYXRlIGV2ZW50c1xuICAgIGFzc2VydC5zdHJpbmcoZXZlbnRzLCB2YWxpZGF0aW9uRXJyb3JzLmV2ZW50cyk7XG5cbiAgICBzZWxmLml0ZXJhdGUoZXZlbnRzLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGNhY2hlID0gc2VsZi5fY2FjaGU7XG4gICAgICBpZiAoIWNhY2hlW25hbWVdKSB7XG4gICAgICAgIGNhY2hlW25hbWVdID0gYXJncy5zbGljZSgxKTtcbiAgICAgICAgYXJnc1swXSA9IG5hbWU7XG4gICAgICAgIHNlbGYudHJpZ2dlci5hcHBseShzZWxmLCBhcmdzKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBzZWxmO1xuICB9LFxuXG4gICd1bnB1Ymxpc2gnOiBmdW5jdGlvbiAoZXZlbnRzKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyB2YWxpZGF0ZSBldmVudHNcbiAgICBhc3NlcnQuc3RyaW5nKGV2ZW50cywgdmFsaWRhdGlvbkVycm9ycy5ldmVudHMpO1xuXG4gICAgLy8gcmVtb3ZlIHRoZSBjYWNoZSBmb3IgdGhlIGV2ZW50c1xuICAgIHNlbGYuaXRlcmF0ZShldmVudHMsIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBzZWxmLl9jYWNoZVtuYW1lXSA9IHVuZGVmaW5lZDtcbiAgICB9KTtcblxuICAgIHJldHVybiBzZWxmO1xuICB9LFxuXG4gICd1bnB1Ymxpc2hBbGwnOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuX2NhY2hlID0ge307XG4gICAgcmV0dXJuIHNlbGY7XG4gIH0sXG5cbiAgJ3RyaWdnZXInOiBmdW5jdGlvbiAoZXZlbnRzKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyB2YWxpZGF0ZSBhcmd1bWVudHNcbiAgICBhc3NlcnQuc3RyaW5nKGV2ZW50cywgdmFsaWRhdGlvbkVycm9ycy50cmlnZ2VyKTtcblxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUgZXZlbnRzICYgdHJpZ2dlciB0aGVtXG4gICAgdmFyIHBhcmFtcyA9IHRvQXJyYXkoYXJndW1lbnRzLCAxKTtcbiAgICBzZWxmLml0ZXJhdGUoZXZlbnRzLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc2VsZi50cmlnZ2VyRXZlbnQobmFtZSwgcGFyYW1zKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBzZWxmO1xuICB9LFxuXG4gICd0cmlnZ2VyRXZlbnQnOiBmdW5jdGlvbiAobmFtZSwgcGFyYW1zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGV2ZW50cyA9IHNlbGYuX2V2ZW50cyB8fCB7fTtcblxuICAgIC8vIGNhbGwgc3ViLWV2ZW50IGhhbmRsZXJzXG4gICAgdmFyIGN1cnJlbnQgPSBbXTtcbiAgICB2YXIgZnJhZ21lbnRzID0gbmFtZS5zcGxpdCgnOicpO1xuICAgIHdoaWxlIChmcmFnbWVudHMubGVuZ3RoKSB7XG4gICAgICBjdXJyZW50LnB1c2goZnJhZ21lbnRzLnNoaWZ0KCkpO1xuICAgICAgbmFtZSA9IGN1cnJlbnQuam9pbignOicpO1xuICAgICAgaWYgKG5hbWUgaW4gZXZlbnRzKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlclNlY3Rpb24obmFtZSwgZnJhZ21lbnRzLCBwYXJhbXMpO1xuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICAndHJpZ2dlclNlY3Rpb24nOiBmdW5jdGlvbiAobmFtZSwgZnJhZ21lbnRzLCBwYXJhbXMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZXZlbnRzID0gc2VsZi5fZXZlbnRzIHx8IHt9O1xuICAgIHZhciBidWNrZXQgPSBldmVudHNbbmFtZV0gfHwgW107XG5cbiAgICBidWNrZXQuZm9yRWFjaChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgdmFyIGFyZ3M7XG4gICAgICBpZiAoZnJhZ21lbnRzLmxlbmd0aCkge1xuICAgICAgICBhcmdzID0gY2xvbmUocGFyYW1zKTtcbiAgICAgICAgYXJncy51bnNoaWZ0KGZyYWdtZW50cyk7XG4gICAgICB9XG4gICAgICBpdGVtLmNhbGxiYWNrLmFwcGx5KGl0ZW0uY29udGV4dCB8fCBzZWxmLCBhcmdzIHx8IHBhcmFtcyk7XG4gICAgfSk7XG4gIH0sXG5cbiAgJ2l0ZXJhdGUnOiBmdW5jdGlvbiAoZXZlbnRzLCBpdGVyYXRvcikge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKHR5cGVvZiBldmVudHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICBldmVudHMgPSBldmVudHMuc3BsaXQoZXZlbnRTcGxpdHRlcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFzc2VydC5hcnJheShldmVudHMpO1xuICAgIH1cblxuICAgIHdoaWxlIChldmVudHMubGVuZ3RoKSB7XG4gICAgICBpdGVyYXRvci5jYWxsKHNlbGYsIGV2ZW50cy5zaGlmdCgpKTtcbiAgICB9XG4gIH0sXG5cbiAgJ2JpbmQnOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIC8vIHN0b3JlIHRoZSByZWZlcmVuY2UgdG8gdGhlIGNhbGxiYWNrICsgY29udGV4dFxuICAgIHZhciBldmVudHMgPSBzZWxmLl9ldmVudHMgfHwge307XG4gICAgdmFyIGJ1Y2tldCA9IGV2ZW50c1tuYW1lXSB8fCAoZXZlbnRzW25hbWVdID0gW10pO1xuICAgIGJ1Y2tldC5wdXNoKHtcbiAgICAgICdjYWxsYmFjayc6IGNhbGxiYWNrLFxuICAgICAgJ2NvbnRleHQnOiBjb250ZXh0XG4gICAgfSk7XG5cbiAgICByZXR1cm4gc2VsZjtcbiAgfSxcblxuICAndW5iaW5kJzogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBsb29rdXAgdGhlIHJlZmVyZW5jZSB0byBoYW5kbGVyICYgcmVtb3ZlIGl0XG4gICAgdmFyIGV2ZW50cyA9IHNlbGYuX2V2ZW50cztcbiAgICB2YXIgYnVja2V0ID0gZXZlbnRzW25hbWVdIHx8IFtdO1xuICAgIHZhciByZXRhaW4gPSBbXTtcblxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUgaGFuZGxlcnNcbiAgICB2YXIgaSA9IC0xLCBsID0gYnVja2V0Lmxlbmd0aCwgaXRlbTtcbiAgICB3aGlsZSAoKytpIDwgbCkge1xuICAgICAgaXRlbSA9IGJ1Y2tldFtpXTtcbiAgICAgIGlmICgoY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGl0ZW0uY2FsbGJhY2spIHx8XG4gICAgICAgICAgKGNvbnRleHQgJiYgY29udGV4dCAhPT0gaXRlbS5jb250ZXh0KSkge1xuICAgICAgICByZXRhaW4ucHVzaChpdGVtKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmbHVzaCBvdXQgZGV0YWNoZWQgaGFuZGxlcnNcbiAgICBldmVudHNbbmFtZV0gPSByZXRhaW47XG5cbiAgICByZXR1cm4gc2VsZjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBldmVudHM7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0b0FycmF5ID0gcmVxdWlyZSgnLi90b0FycmF5Jyk7XG52YXIgbWVyZ2UgPSByZXF1aXJlKCcuL21lcmdlJyk7XG52YXIgYXNzZXJ0ID0gcmVxdWlyZSgnLi9hc3NlcnQnKTtcblxuZnVuY3Rpb24gZXh0ZW5kICgpIHtcblxuICAvLyBjb252ZXJ0IHRoZSBhcmd1bWVudCBsaXN0IGludG8gYW4gYXJyYXlcbiAgdmFyIGFyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG5cbiAgLy8gdmFsaWRhdGUgaW5wdXRcbiAgYXNzZXJ0KGFyZ3MubGVuZ3RoID4gMCwgJ2V4dGVuZCBleHBlY3Qgb25lIG9yIG1vcmUgb2JqZWN0cycpO1xuXG4gIC8vIGxvb3AgdGhyb3VnaCB0aGUgYXJndW1lbnRzXG4gIC8vICYgbWVyZ2luZyB0aGVtIHJlY3Vyc2l2ZWx5XG4gIHZhciBvYmplY3QgPSBhcmdzLnNoaWZ0KCk7XG4gIHdoaWxlIChhcmdzLmxlbmd0aCkge1xuICAgIG1lcmdlKG9iamVjdCwgYXJncy5zaGlmdCgpKTtcbiAgfVxuXG4gIHJldHVybiBvYmplY3Q7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBmb3JBcnJheSAoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJyYXkubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgYXJyYXlbaV0sIGksIGFycmF5KSA9PT0gZmFsc2UpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZm9yT2JqZWN0IChvYmplY3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9iamVjdFtrZXldLCBrZXkpID09PSBmYWxzZSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2ggKGNvbGxlY3Rpb24sIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gIHZhciBoYW5kbGVyID0gQXJyYXkuaXNBcnJheShjb2xsZWN0aW9uKSA/IGZvckFycmF5IDogZm9yT2JqZWN0O1xuICBoYW5kbGVyKGNvbGxlY3Rpb24sIGl0ZXJhdG9yLCBjb250ZXh0KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbWVyZ2UgPSByZXF1aXJlKCcuL21lcmdlJyk7XG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKTtcblxuZnVuY3Rpb24gbWVyZ2VGcm9tU3VwZXIgKGluc3RhbmNlLCBrZXkpIHtcblxuICB2YXIgY29uc3RydWN0b3IgPSBpbnN0YW5jZS5jb25zdHJ1Y3RvcjtcbiAgdmFyIHByb3RvID0gY29uc3RydWN0b3IucHJvdG90eXBlO1xuXG4gIHZhciBiYXNlRGF0YSA9IHt9O1xuICBpZiAoaW5zdGFuY2UuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIGJhc2VEYXRhID0gaW5zdGFuY2Vba2V5XTtcbiAgfSBlbHNlIGlmIChwcm90by5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgYmFzZURhdGEgPSBwcm90b1trZXldO1xuICB9XG5cbiAgdmFyIF9zdXBlciA9IGNvbnN0cnVjdG9yICYmIGNvbnN0cnVjdG9yLl9fc3VwZXJfXztcbiAgaWYgKF9zdXBlcikge1xuICAgIGJhc2VEYXRhID0gbWVyZ2UobWVyZ2VGcm9tU3VwZXIoX3N1cGVyLCBrZXkpLCBiYXNlRGF0YSk7XG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKHt9LCBiYXNlRGF0YSk7XG59XG5cbmZ1bmN0aW9uIGNvbmNhdEZyb21TdXBlciAoaW5zdGFuY2UsIGtleSkge1xuXG4gIHZhciBjb25zdHJ1Y3RvciA9IGluc3RhbmNlLmNvbnN0cnVjdG9yO1xuICB2YXIgcHJvdG8gPSBjb25zdHJ1Y3Rvci5wcm90b3R5cGU7XG5cbiAgdmFyIGJhc2VEYXRhID0gW107XG4gIGlmIChpbnN0YW5jZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgYmFzZURhdGEgPSBpbnN0YW5jZVtrZXldO1xuICB9IGVsc2UgaWYgKHByb3RvLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBiYXNlRGF0YSA9IHByb3RvW2tleV07XG4gIH1cblxuICB2YXIgX3N1cGVyID0gY29uc3RydWN0b3IgJiYgY29uc3RydWN0b3IuX19zdXBlcl9fO1xuICBpZiAoX3N1cGVyKSB7XG4gICAgYmFzZURhdGEgPSBbXS5jb25jYXQoY29uY2F0RnJvbVN1cGVyKF9zdXBlciwga2V5KSwgYmFzZURhdGEpO1xuICB9XG5cbiAgcmV0dXJuIFtdLmNvbmNhdChiYXNlRGF0YSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAnbWVyZ2UnOiBtZXJnZUZyb21TdXBlcixcbiAgJ2NvbmNhdCc6IGNvbmNhdEZyb21TdXBlclxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gZnVuY3Rpb25zIChvYmopIHtcbiAgdmFyIGZ1bmNzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBmdW5jcy5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBmdW5jcztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbnM7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAnYXNzZXJ0JzogcmVxdWlyZSgnLi9hc3NlcnQnKSxcbiAgJ2Nsb25lJzogcmVxdWlyZSgnLi9jbG9uZScpLFxuICAnY3JlYXRlVUlEJzogcmVxdWlyZSgnLi9jcmVhdGVVSUQnKSxcbiAgJ2RlZmVyJzogcmVxdWlyZSgnLi9kZWZlcicpLFxuICAnZGVsYXknOiByZXF1aXJlKCcuL2RlbGF5JyksXG4gICdldmVudHMnOiByZXF1aXJlKCcuL2V2ZW50cycpLFxuICAnZXh0ZW5kJzogcmVxdWlyZSgnLi9leHRlbmQnKSxcbiAgJ2ZvckVhY2gnOiByZXF1aXJlKCcuL2ZvckVhY2gnKSxcbiAgJ2Zyb21TdXBlcic6IHJlcXVpcmUoJy4vZnJvbVN1cGVyJyksXG4gICdmdW5jdGlvbnMnOiByZXF1aXJlKCcuL2Z1bmN0aW9ucycpLFxuICAnaW5oZXJpdHMnOiByZXF1aXJlKCcuL2luaGVyaXRzJyksXG4gICdpc0VxdWFsJzogcmVxdWlyZSgnLi9pc0VxdWFsJyksXG4gICdtZXJnZSc6IHJlcXVpcmUoJy4vbWVyZ2UnKSxcbiAgJ3NpemUnOiByZXF1aXJlKCcuL3NpemUnKSxcbiAgJ3RvQXJyYXknOiByZXF1aXJlKCcuL3RvQXJyYXknKSxcbiAgJ3doZW4nOiByZXF1aXJlKCcuL3doZW4nKSxcbiAgJ3doZXJlJzogcmVxdWlyZSgnLi93aGVyZScpXG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJyk7XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBjb3JyZWN0bHkgc2V0IHVwIHRoZSBwcm90b3R5cGUgY2hhaW4sIGZvciBzdWJjbGFzc2VzLlxuLy8gU2ltaWxhciB0byBgZ29vZy5pbmhlcml0c2AsIGJ1dCB1c2VzIGEgaGFzaCBvZiBwcm90b3R5cGUgcHJvcGVydGllcyBhbmRcbi8vIGNsYXNzIHByb3BlcnRpZXMgdG8gYmUgZXh0ZW5kZWQuXG5mdW5jdGlvbiBpbmhlcml0cyAocGFyZW50LCBwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuXG4gIHZhciBjaGlsZDtcblxuICAvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG4gIC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuICAvLyBieSB1cyB0byBzaW1wbHkgY2FsbCBgc3VwZXIoKWAuXG4gIGlmIChwcm90b1Byb3BzICYmIHByb3RvUHJvcHMuaGFzT3duUHJvcGVydHkoJ2NvbnN0cnVjdG9yJykpIHtcbiAgICBjaGlsZCA9IHByb3RvUHJvcHMuY29uc3RydWN0b3I7XG4gIH1cbiAgZWxzZSB7XG4gICAgY2hpbGQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gcGFyZW50LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIEluaGVyaXQgY2xhc3MgKHN0YXRpYykgcHJvcGVydGllcyBmcm9tIHBhcmVudC5cbiAgZXh0ZW5kKGNoaWxkLCBwYXJlbnQpO1xuXG4gIC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG4gIC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG4gIGNoaWxkLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUocGFyZW50LnByb3RvdHlwZSk7XG5cbiAgLy8gQWRkIHByb3RvdHlwZSBwcm9wZXJ0aWVzIChpbnN0YW5jZSBwcm9wZXJ0aWVzKSB0byB0aGUgc3ViY2xhc3MsXG4gIC8vIGlmIHN1cHBsaWVkLlxuICBleHRlbmQoY2hpbGQucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcblxuICAvLyBDb3JyZWN0bHkgc2V0IGNoaWxkJ3MgYHByb3RvdHlwZS5jb25zdHJ1Y3RvcmAuXG4gIGNoaWxkLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGNoaWxkO1xuXG4gIC8vIEFkZCBzdGF0aWMgcHJvcGVydGllcyB0byB0aGUgY29uc3RydWN0b3IgZnVuY3Rpb24sIGlmIHN1cHBsaWVkLlxuICBleHRlbmQoY2hpbGQsIHN0YXRpY1Byb3BzKTtcblxuICAvLyBTZXQgYSBjb252ZW5pZW5jZSBwcm9wZXJ0eVxuICAvLyBpbiBjYXNlIHRoZSBwYXJlbnQncyBwcm90b3R5cGUgaXMgbmVlZGVkIGxhdGVyLlxuICBjaGlsZC5fX3N1cGVyX18gPSBwYXJlbnQucHJvdG90eXBlO1xuXG4gIHJldHVybiBjaGlsZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpbmhlcml0cztcbiIsIid1c2Ugc3RyaWN0JztcblxuLy8gVE9ETzogaW1wbGVtZW50IGRlZXBFcXVhbFxuZnVuY3Rpb24gaXNFcXVhbCAoYSwgYikge1xuICByZXR1cm4gYSA9PT0gYjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0VxdWFsO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdG9BcnJheSA9IHJlcXVpcmUoJy4vdG9BcnJheScpO1xuXG5mdW5jdGlvbiBtZXJnZSAob2JqZWN0LCBzb3VyY2UpIHtcbiAgdmFyIHNvdXJjZXMgPSB0b0FycmF5KGFyZ3VtZW50cywgMSk7XG4gIHdoaWxlIChzb3VyY2VzLmxlbmd0aCkge1xuICAgIHNvdXJjZSA9IHNvdXJjZXMuc2hpZnQoKTtcbiAgICBmb3IgKHZhciBrZXkgaW4gc291cmNlKSB7XG4gICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgb2JqZWN0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtZXJnZTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gc2l6ZSAoY29sbGVjdGlvbikge1xuICAhQXJyYXkuaXNBcnJheShjb2xsZWN0aW9uKSAmJiAoY29sbGVjdGlvbiA9IE9iamVjdC5rZXlzKGNvbGxlY3Rpb24pKTtcbiAgcmV0dXJuIGNvbGxlY3Rpb24ubGVuZ3RoO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNpemU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbmZ1bmN0aW9uIHRvQXJyYXkgKG9iaiwgc2tpcCkge1xuICByZXR1cm4gc2xpY2UuY2FsbChvYmosIHNraXAgfHwgMCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdG9BcnJheTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFdCRGVmZXJyZWQgPSByZXF1aXJlKCcuLi9XQkRlZmVycmVkJyk7XG52YXIgdG9BcnJheSA9IHJlcXVpcmUoJy4vdG9BcnJheScpO1xuXG5mdW5jdGlvbiBXaGVuICgpIHtcblxuICB2YXIgY29udGV4dCA9IHRoaXM7XG4gIHZhciBtYWluID0gbmV3IFdCRGVmZXJyZWQoY29udGV4dCk7XG4gIHZhciBkZWZlcnJlZHMgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG5cbiAgLy8gc3VwcG9ydCBwYXNzaW5nIGFuIGFycmF5IG9mIGRlZmVycmVkcywgdG8gYXZvaWQgYGFwcGx5YFxuICBpZiAoZGVmZXJyZWRzLmxlbmd0aCA9PT0gMSAmJiBBcnJheS5pc0FycmF5KGRlZmVycmVkc1swXSkpIHtcbiAgICBkZWZlcnJlZHMgPSBkZWZlcnJlZHNbMF07XG4gIH1cblxuICB2YXIgY291bnQgPSBkZWZlcnJlZHMubGVuZ3RoO1xuICB2YXIgYXJncyA9IG5ldyBBcnJheShjb3VudCk7XG5cbiAgZnVuY3Rpb24gRmFpbCAoKSB7XG4gICAgbWFpbi5yZWplY3RXaXRoKHRoaXMpO1xuICB9XG5cbiAgZnVuY3Rpb24gRG9uZSAoKSB7XG5cbiAgICBpZiAobWFpbi5zdGF0ZSgpID09PSAncmVqZWN0ZWQnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGluZGV4ID0gY291bnQgLSBkZWZlcnJlZHMubGVuZ3RoIC0gMTtcbiAgICBhcmdzW2luZGV4XSA9IHRvQXJyYXkoYXJndW1lbnRzKTtcblxuICAgIGlmIChkZWZlcnJlZHMubGVuZ3RoKSB7XG4gICAgICB2YXIgbmV4dCA9IGRlZmVycmVkcy5zaGlmdCgpO1xuICAgICAgbmV4dC5kb25lKERvbmUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzLnVuc2hpZnQodGhpcyk7XG4gICAgICBtYWluLnJlc29sdmVXaXRoLmFwcGx5KG1haW4sIGFyZ3MpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChkZWZlcnJlZHMubGVuZ3RoKSB7XG5cbiAgICBkZWZlcnJlZHMuZm9yRWFjaChmdW5jdGlvbiAoZGVmZXJyZWQpIHtcbiAgICAgIGRlZmVycmVkLmZhaWwoRmFpbCk7XG4gICAgfSk7XG5cbiAgICB2YXIgY3VycmVudCA9IGRlZmVycmVkcy5zaGlmdCgpO1xuICAgIGN1cnJlbnQuZG9uZShEb25lKTtcbiAgfSBlbHNlIHtcbiAgICBtYWluLnJlc29sdmUoKTtcbiAgfVxuXG4gIHJldHVybiBtYWluLnByb21pc2UoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXaGVuO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZm9yRWFjaCA9IHJlcXVpcmUoJy4vZm9yRWFjaCcpO1xuXG5mdW5jdGlvbiB3aGVyZSAoY29sbGVjdGlvbiwgcHJvcGVydGllcykge1xuICB2YXIgbWF0Y2hlcyA9IFtdO1xuICBmb3JFYWNoKGNvbGxlY3Rpb24sIGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgZm9yICh2YXIga2V5IGluIHByb3BlcnRpZXMpIHtcbiAgICAgIGlmIChpdGVtW2tleV0gIT09IHByb3BlcnRpZXNba2V5XSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBtYXRjaGVzLnB1c2goaXRlbSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG1hdGNoZXM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gd2hlcmU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBXQk1peGluID0gcmVxdWlyZSgnLi4vV0JNaXhpbicpO1xudmFyIGZyb21TdXBlciA9IHJlcXVpcmUoJy4uL2xpYi9mcm9tU3VwZXInKTtcblxudmFyIENvbnRyb2xsZXJNaXhpbiA9IFdCTWl4aW4uZXh0ZW5kKHtcblxuICAnaW5pdGlhbGl6ZSc6IGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuY29udHJvbGxlcnMgPSBbXTtcbiAgICBzZWxmLmltcGxlbWVudGVkID0gW107XG5cbiAgICBzZWxmLmltcGxlbWVudHMgPSBmcm9tU3VwZXIuY29uY2F0KHNlbGYsICdpbXBsZW1lbnRzJyk7XG4gICAgc2VsZi5jcmVhdGVDb250cm9sbGVySW5zdGFuY2VzKCk7XG5cbiAgICBzZWxmLmJpbmRUbyhzZWxmLCAnZGVzdHJveScsICdkZXN0cm95Q29udHJvbGxlcnMnKTtcbiAgfSxcblxuICAnY3JlYXRlQ29udHJvbGxlckluc3RhbmNlcyc6IGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgQ29udHJvbGxlckNsYXNzLCBjb250cm9sbGVySW5zdGFuY2UsIGk7XG4gICAgdmFyIENvbnRyb2xsZXJzID0gc2VsZi5pbXBsZW1lbnRzO1xuXG4gICAgZm9yIChpID0gQ29udHJvbGxlcnMubGVuZ3RoOyBpLS07KSB7XG4gICAgICBDb250cm9sbGVyQ2xhc3MgPSBDb250cm9sbGVyc1tpXTtcblxuICAgICAgLy8gSWYgd2UgaGF2ZSBhbHJlYWR5IGltcGxlbWVudGVkIGEgY29udHJvbGxlciB0aGF0IGluaGVyaXRzIGZyb21cbiAgICAgIC8vIHRoaXMgY29udHJvbGxlciwgd2UgZG9uJ3QgbmVlZCBhbm90aGVyIG9uZS4uLlxuICAgICAgaWYgKHNlbGYuaW1wbGVtZW50ZWQuaW5kZXhPZihDb250cm9sbGVyQ2xhc3MudG9TdHJpbmcoKSkgPCAwKSB7XG5cbiAgICAgICAgY29udHJvbGxlckluc3RhbmNlID0gbmV3IENvbnRyb2xsZXJDbGFzcyhzZWxmKTtcbiAgICAgICAgc2VsZi5jb250cm9sbGVycy5wdXNoKGNvbnRyb2xsZXJJbnN0YW5jZSk7XG4gICAgICAgIGNvbnRyb2xsZXJJbnN0YW5jZS5wYXJlbnQgPSBzZWxmO1xuXG4gICAgICAgIHNlbGYudHJhY2tJbXBsZW1lbnRlZFN1cGVyQ29uc3RydWN0b3JzKGNvbnRyb2xsZXJJbnN0YW5jZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGYuaW1wbGVtZW50ZWQ7XG4gIH0sXG5cbiAgJ3RyYWNrSW1wbGVtZW50ZWRTdXBlckNvbnN0cnVjdG9ycyc6IGZ1bmN0aW9uIChDb250cm9sbGVyKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIF9zdXBlciA9IENvbnRyb2xsZXIuX19zdXBlcl9fO1xuICAgIHZhciBzdXBlckNvbnN0cnVjdG9yID0gX3N1cGVyICYmIF9zdXBlci5jb25zdHJ1Y3RvcjtcblxuICAgIGlmIChzdXBlckNvbnN0cnVjdG9yKSB7XG4gICAgICBzZWxmLmltcGxlbWVudGVkLnB1c2goc3VwZXJDb25zdHJ1Y3Rvci50b1N0cmluZygpKTtcbiAgICAgIHNlbGYudHJhY2tJbXBsZW1lbnRlZFN1cGVyQ29uc3RydWN0b3JzKHN1cGVyQ29uc3RydWN0b3IpO1xuICAgIH1cbiAgfSxcblxuICAnZGVzdHJveUNvbnRyb2xsZXJzJzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gTG9vcCBhbmQgZGVzdHJveVxuICAgIHZhciBjb250cm9sbGVyO1xuICAgIHZhciBjb250cm9sbGVycyA9IHNlbGYuY29udHJvbGxlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gY29udHJvbGxlcnMubGVuZ3RoOyBpLS07KSB7XG5cbiAgICAgIC8vIEEgY29udHJvbGxlciBjYW4gZXhpc3QgbXVsdGlwbGUgdGltZXMgaW4gdGhlIGxpc3QsXG4gICAgICAvLyBzaW5jZSBpdCdzIGJhc2VkIG9uIHRoZSBldmVudCBuYW1lLFxuICAgICAgLy8gc28gbWFrZSBzdXJlIHRvIG9ubHkgZGVzdHJveSBlYWNoIG9uZSBvbmNlXG4gICAgICBjb250cm9sbGVyID0gY29udHJvbGxlcnNbaV07XG4gICAgICBjb250cm9sbGVyLmRlc3Ryb3llZCB8fCBjb250cm9sbGVyLmRlc3Ryb3koKTtcbiAgICB9XG5cbiAgICBkZWxldGUgc2VsZi5jb250cm9sbGVycztcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQ29udHJvbGxlck1peGluO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgV0JNaXhpbiA9IHJlcXVpcmUoJy4uL1dCTWl4aW4nKTtcbnZhciBmcm9tU3VwZXIgPSByZXF1aXJlKCcuLi9saWIvZnJvbVN1cGVyJyk7XG52YXIgY2xvbmUgPSByZXF1aXJlKCcuLi9saWIvY2xvbmUnKTtcblxudmFyIE9ic2VydmFibGVIYXNoTWl4aW4gPSBXQk1peGluLmV4dGVuZCh7XG5cbiAgJ2luaXRpYWxpemUnOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgb2JzZXJ2ZXNIYXNoID0gZnJvbVN1cGVyLm1lcmdlKHNlbGYsICdvYnNlcnZlcycpO1xuICAgIGZvciAodmFyIHRhcmdldCBpbiBvYnNlcnZlc0hhc2gpIHtcbiAgICAgIHNlbGYuYmluZFRvVGFyZ2V0KHNlbGYucmVzb2x2ZVRhcmdldCh0YXJnZXQpLCBvYnNlcnZlc0hhc2hbdGFyZ2V0XSk7XG4gICAgfVxuICB9LFxuXG4gICdiaW5kVG9UYXJnZXQnOiBmdW5jdGlvbiAodGFyZ2V0LCBldmVudHMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGZvciAodmFyIGV2ZW50U3RyaW5nIGluIGV2ZW50cykge1xuICAgICAgc2VsZi5iaW5kSGFuZGxlcnModGFyZ2V0LCBldmVudFN0cmluZywgZXZlbnRzW2V2ZW50U3RyaW5nXSk7XG4gICAgfVxuICB9LFxuXG4gICdiaW5kSGFuZGxlcnMnOiBmdW5jdGlvbiAodGFyZ2V0LCBldmVudFN0cmluZywgaGFuZGxlcnMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmICh0eXBlb2YgaGFuZGxlcnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICBoYW5kbGVycyA9IFtoYW5kbGVyc107XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZXJzID0gY2xvbmUoaGFuZGxlcnMpO1xuICAgIH1cblxuICAgIHdoaWxlIChoYW5kbGVycy5sZW5ndGgpIHtcbiAgICAgIHNlbGYuYmluZFRvKHRhcmdldCwgZXZlbnRTdHJpbmcsIGhhbmRsZXJzLnNoaWZ0KCkpO1xuICAgIH1cbiAgfSxcblxuICAncmVzb2x2ZVRhcmdldCc6IGZ1bmN0aW9uIChrZXkpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIC8vIGFsbG93IG9ic2VydmluZyBzZWxmXG4gICAgaWYgKGtleSA9PT0gJ3NlbGYnKSB7XG4gICAgICByZXR1cm4gc2VsZjtcbiAgICB9XG5cbiAgICB2YXIgdGFyZ2V0ID0gc2VsZltrZXldO1xuICAgIGlmICghdGFyZ2V0ICYmIHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIGtleS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAga2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICB0YXJnZXQgPSBzZWxmO1xuICAgICAgd2hpbGUgKGtleS5sZW5ndGggJiYgdGFyZ2V0KSB7XG4gICAgICAgIHRhcmdldCA9IHRhcmdldFtrZXkuc2hpZnQoKV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRhcmdldDtcbiAgfVxuXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBPYnNlcnZhYmxlSGFzaE1peGluO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgV0JNaXhpbiA9IHJlcXVpcmUoJy4uL1dCTWl4aW4nKTtcbi8vIHZhciBhc3NlcnQgPSByZXF1aXJlKCcuLi9saWIvYXNzZXJ0Jyk7XG52YXIgY3JlYXRlVUlEID0gcmVxdWlyZSgnLi4vbGliL2NyZWF0ZVVJRCcpO1xuXG52YXIgV0JCaW5kYWJsZU1peGluID0gV0JNaXhpbi5leHRlbmQoe1xuXG4gICdwcm9wZXJ0aWVzJzoge1xuICAgICdfYmluZGluZ3MnOiB7fSxcbiAgICAnX25hbWVkRXZlbnRzJzoge31cbiAgfSxcblxuICAvLyBrZWVwcyBjYWxsYmFjayBjbG9zdXJlIGluIG93biBleGVjdXRpb24gY29udGV4dCB3aXRoXG4gIC8vIG9ubHkgY2FsbGJhY2sgYW5kIGNvbnRleHRcbiAgJ2NhbGxiYWNrRmFjdG9yeSc6IGZ1bmN0aW9uICAoY2FsbGJhY2ssIGNvbnRleHQpIHtcblxuICAgIHZhciBiaW5kQ2FsbGJhY2s7XG5cbiAgICB2YXIgZm9yU3RyaW5nID0gZnVuY3Rpb24gc3RyaW5nQ2FsbGJhY2sgKCkge1xuICAgICAgY29udGV4dFtjYWxsYmFja10uYXBwbHkoY29udGV4dCwgYXJndW1lbnRzKTtcbiAgICB9O1xuXG4gICAgdmFyIGZvckZ1bmN0aW9uID0gZnVuY3Rpb24gZnVuY3Rpb25DYWxsYmFjayAoKSB7XG4gICAgICBjYWxsYmFjay5hcHBseShjb250ZXh0LCBhcmd1bWVudHMpO1xuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnc3RyaW5nJykge1xuICAgICAgYmluZENhbGxiYWNrID0gZm9yU3RyaW5nO1xuICAgICAgLy8gY2FuY2VsIGFsdGVybmF0ZSBjbG9zdXJlIGltbWVkaWF0ZWx5XG4gICAgICBmb3JGdW5jdGlvbiA9IG51bGw7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYmluZENhbGxiYWNrID0gZm9yRnVuY3Rpb247XG4gICAgICBmb3JTdHJpbmcgPSBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBiaW5kQ2FsbGJhY2s7XG4gIH0sXG5cbiAgJ2JpbmRUbyc6IGZ1bmN0aW9uICh0YXJnZXQsIGV2ZW50LCBjYWxsYmFjaywgY29udGV4dCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuY2hlY2tCaW5kaW5nQXJncy5hcHBseShzZWxmLCBhcmd1bWVudHMpO1xuXG4gICAgLy8gZGVmYXVsdCB0byBzZWxmIGlmIGNvbnRleHQgbm90IHByb3ZpZGVkXG4gICAgY29udGV4dCA9IGNvbnRleHQgfHwgc2VsZjtcblxuICAgIC8vIGlmIHRoaXMgYmluZGluZyBhbHJlYWR5IG1hZGUsIHJldHVybiBpdFxuICAgIHZhciBib3VuZCA9IHNlbGYuaXNBbHJlYWR5Qm91bmQodGFyZ2V0LCBldmVudCwgY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgIGlmIChib3VuZCkge1xuICAgICAgcmV0dXJuIGJvdW5kO1xuICAgIH1cblxuXG4gICAgdmFyIGNhbGxiYWNrRnVuYywgYXJncztcblxuICAgIC8vIGlmIGEganF1ZXJ5IG9iamVjdFxuICAgIGlmICh0YXJnZXQuY29uc3RydWN0b3IgJiYgdGFyZ2V0LmNvbnN0cnVjdG9yLmZuICYmIHRhcmdldC5jb25zdHJ1Y3Rvci5mbi5vbiA9PT0gdGFyZ2V0Lm9uKSB7XG4gICAgICAvLyBqcXVlcnkgZG9lcyBub3QgdGFrZSBjb250ZXh0IGluIC5vbigpXG4gICAgICAvLyBjYW5ub3QgYXNzdW1lIG9uIHRha2VzIGNvbnRleHQgYXMgYSBwYXJhbSBmb3IgYmluZGFibGUgb2JqZWN0XG4gICAgICAvLyBjcmVhdGUgYSBjYWxsYmFjayB3aGljaCB3aWxsIGFwcGx5IHRoZSBvcmlnaW5hbCBjYWxsYmFjayBpbiB0aGUgY29ycmVjdCBjb250ZXh0XG4gICAgICBjYWxsYmFja0Z1bmMgPSBzZWxmLmNhbGxiYWNrRmFjdG9yeShjYWxsYmFjaywgY29udGV4dCk7XG4gICAgICBhcmdzID0gW2V2ZW50LCBjYWxsYmFja0Z1bmNdO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBCYWNrYm9uZSBhY2NlcHRzIGNvbnRleHQgd2hlbiBiaW5kaW5nLCBzaW1wbHkgcGFzcyBpdCBvblxuICAgICAgY2FsbGJhY2tGdW5jID0gKHR5cGVvZiBjYWxsYmFjayA9PT0gJ3N0cmluZycpID8gY29udGV4dFtjYWxsYmFja10gOiBjYWxsYmFjaztcbiAgICAgIGFyZ3MgPSBbZXZlbnQsIGNhbGxiYWNrRnVuYywgY29udGV4dF07XG4gICAgfVxuXG4gICAgLy8gY3JlYXRlIGJpbmRpbmcgb24gdGFyZ2V0XG4gICAgdGFyZ2V0Lm9uLmFwcGx5KHRhcmdldCwgYXJncyk7XG5cbiAgICB2YXIgYmluZGluZyA9IHtcbiAgICAgICd1aWQnOiBjcmVhdGVVSUQoKSxcbiAgICAgICd0YXJnZXQnOiB0YXJnZXQsXG4gICAgICAnZXZlbnQnOiBldmVudCxcbiAgICAgICdvcmlnaW5hbENhbGxiYWNrJzogY2FsbGJhY2ssXG4gICAgICAnY2FsbGJhY2snOiBjYWxsYmFja0Z1bmMsXG4gICAgICAnY29udGV4dCc6IGNvbnRleHRcbiAgICB9O1xuXG4gICAgc2VsZi5fYmluZGluZ3NbYmluZGluZy51aWRdID0gYmluZGluZztcbiAgICBzZWxmLmFkZFRvTmFtZWRCaW5kaW5ncyhldmVudCwgYmluZGluZyk7XG5cbiAgICByZXR1cm4gYmluZGluZztcbiAgfSxcblxuICAnYmluZE9uY2VUbyc6IGZ1bmN0aW9uICh0YXJnZXQsIGV2ZW50LCBjYWxsYmFjaywgY29udGV4dCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuY2hlY2tCaW5kaW5nQXJncy5hcHBseShzZWxmLCBhcmd1bWVudHMpO1xuXG4gICAgY29udGV4dCA9IGNvbnRleHQgfHwgc2VsZjtcblxuICAgIC8vIGlmIHRoaXMgYmluZGluZyBhbHJlYWR5IG1hZGUsIHJldHVybiBpdFxuICAgIHZhciBib3VuZCA9IHNlbGYuaXNBbHJlYWR5Qm91bmQodGFyZ2V0LCBldmVudCwgY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgIGlmIChib3VuZCkge1xuICAgICAgcmV0dXJuIGJvdW5kO1xuICAgIH1cblxuXG4gICAgLy8gdGhpcyBpcyBhIHdyYXBwZXJcbiAgICB2YXIgb25jZUJpbmRpbmcgPSBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICgodHlwZW9mIGNhbGxiYWNrID09PSAnc3RyaW5nJykgPyBjb250ZXh0W2NhbGxiYWNrXSA6IGNhbGxiYWNrKS5hcHBseShjb250ZXh0LCBhcmd1bWVudHMpO1xuICAgICAgc2VsZi51bmJpbmRGcm9tKGJpbmRpbmcpO1xuICAgIH07XG5cbiAgICB2YXIgYmluZGluZyA9IHtcbiAgICAgICd1aWQnOiBjcmVhdGVVSUQoKSxcbiAgICAgICd0YXJnZXQnOiB0YXJnZXQsXG4gICAgICAnZXZlbnQnOiBldmVudCxcbiAgICAgICdvcmlnaW5hbENhbGxiYWNrJzogY2FsbGJhY2ssXG4gICAgICAnY2FsbGJhY2snOiBvbmNlQmluZGluZyxcbiAgICAgICdjb250ZXh0JzogY29udGV4dFxuICAgIH07XG5cbiAgICB0YXJnZXQub24oZXZlbnQsIG9uY2VCaW5kaW5nLCBjb250ZXh0KTtcblxuICAgIHNlbGYuX2JpbmRpbmdzW2JpbmRpbmcudWlkXSA9IGJpbmRpbmc7XG4gICAgc2VsZi5hZGRUb05hbWVkQmluZGluZ3MoZXZlbnQsIGJpbmRpbmcpO1xuXG4gICAgcmV0dXJuIGJpbmRpbmc7XG4gIH0sXG5cbiAgJ3VuYmluZEZyb20nOiBmdW5jdGlvbiAoYmluZGluZykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdmFyIHVpZCA9IGJpbmRpbmcgJiYgYmluZGluZy51aWQ7XG4gICAgaWYgKCFiaW5kaW5nIHx8ICh0eXBlb2YgdWlkICE9PSAnc3RyaW5nJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVuYmluZCBmcm9tIHVuZGVmaW5lZCBvciBpbnZhbGlkIGJpbmRpbmcnKTtcbiAgICB9XG5cbiAgICB2YXIgZXZlbnQgPSBiaW5kaW5nLmV2ZW50O1xuICAgIHZhciBjb250ZXh0ID0gYmluZGluZy5jb250ZXh0O1xuICAgIHZhciBjYWxsYmFjayA9IGJpbmRpbmcuY2FsbGJhY2s7XG4gICAgdmFyIHRhcmdldCA9IGJpbmRpbmcudGFyZ2V0O1xuXG4gICAgLy8gYSBiaW5kaW5nIG9iamVjdCB3aXRoIG9ubHkgdWlkLCBpLmUuIGEgZGVzdHJveWVkL3VuYm91bmRcbiAgICAvLyBiaW5kaW5nIG9iamVjdCBoYXMgYmVlbiBwYXNzZWQgLSBqdXN0IGRvIG5vdGhpbmdcbiAgICBpZiAoIWV2ZW50IHx8ICFjYWxsYmFjayB8fCAhdGFyZ2V0IHx8ICFjb250ZXh0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGFyZ2V0Lm9mZihldmVudCwgY2FsbGJhY2ssIGNvbnRleHQpO1xuXG4gICAgLy8gY2xlYW4gdXAgYmluZGluZyBvYmplY3QsIGJ1dCBrZWVwIHVpZCB0b1xuICAgIC8vIG1ha2Ugc3VyZSBvbGQgYmluZGluZ3MsIHRoYXQgaGF2ZSBhbHJlYWR5IGJlZW5cbiAgICAvLyBjbGVhbmVkLCBhcmUgc3RpbGwgcmVjb2duaXplZCBhcyBiaW5kaW5nc1xuICAgIGZvciAodmFyIGtleSBpbiBiaW5kaW5nKSB7XG4gICAgICBpZiAoa2V5ICE9PSAndWlkJykge1xuICAgICAgICBkZWxldGUgYmluZGluZ1trZXldO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRlbGV0ZSBzZWxmLl9iaW5kaW5nc1t1aWRdO1xuXG4gICAgdmFyIG5hbWVkRXZlbnRzID0gc2VsZi5fbmFtZWRFdmVudHM7XG4gICAgdmFyIGV2ZW50cyA9IG5hbWVkRXZlbnRzW2V2ZW50XTtcblxuICAgIGlmIChldmVudHMpIHtcbiAgICAgIHZhciBjbG9uZWQgPSBldmVudHMgJiYgZXZlbnRzLnNsaWNlKDApO1xuICAgICAgZm9yICh2YXIgaSA9IGV2ZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBpZiAoZXZlbnRzW2ldLnVpZCA9PT0gdWlkKSB7XG4gICAgICAgICAgY2xvbmVkLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBuYW1lZEV2ZW50c1tldmVudF0gPSBjbG9uZWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuO1xuICB9LFxuXG4gICd1bmJpbmRGcm9tVGFyZ2V0JzogZnVuY3Rpb24gKHRhcmdldCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKCF0YXJnZXQgfHwgKHR5cGVvZiB0YXJnZXQub24gIT09ICdmdW5jdGlvbicpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1bmJpbmQgZnJvbSB1bmRlZmluZWQgb3IgaW52YWxpZCBiaW5kaW5nIHRhcmdldCcpO1xuICAgIH1cblxuICAgIHZhciBiaW5kaW5nO1xuICAgIGZvciAodmFyIGtleSBpbiBzZWxmLl9iaW5kaW5ncykge1xuICAgICAgYmluZGluZyA9IHNlbGYuX2JpbmRpbmdzW2tleV07XG4gICAgICBpZiAoYmluZGluZy50YXJnZXQgPT09IHRhcmdldCkge1xuICAgICAgICBzZWxmLnVuYmluZEZyb20oYmluZGluZyk7XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gICd1bmJpbmRBbGwnOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgYmluZGluZztcbiAgICBmb3IgKHZhciBrZXkgaW4gc2VsZi5fYmluZGluZ3MpIHtcbiAgICAgIGJpbmRpbmcgPSBzZWxmLl9iaW5kaW5nc1trZXldO1xuICAgICAgc2VsZi51bmJpbmRGcm9tKGJpbmRpbmcpO1xuICAgIH1cbiAgfSxcblxuICAnY2hlY2tCaW5kaW5nQXJncyc6IGZ1bmN0aW9uICh0YXJnZXQsIGV2ZW50LCBjYWxsYmFjaywgY29udGV4dCkge1xuXG4gICAgY29udGV4dCA9IGNvbnRleHQgfHwgdGhpcztcblxuICAgIC8vIGRvIG5vdCBjaGFuZ2UgdGhlc2UgbWVzc2FnZXMgd2l0aG91dCB1cGRhdGluZyB0aGUgc3BlY3NcbiAgICBpZiAoIXRhcmdldCB8fCAodHlwZW9mIHRhcmdldC5vbiAhPT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGJpbmQgdG8gdW5kZWZpbmVkIHRhcmdldCBvciB0YXJnZXQgd2l0aG91dCAjb24gbWV0aG9kJyk7XG4gICAgfVxuXG4gICAgaWYgKCFldmVudCB8fCAodHlwZW9mIGV2ZW50ICE9PSAnc3RyaW5nJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGJpbmQgdG8gdGFyZ2V0IGV2ZW50IHdpdGhvdXQgZXZlbnQgbmFtZScpO1xuICAgIH1cblxuICAgIGlmICghY2FsbGJhY2sgfHwgKCh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpICYmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdzdHJpbmcnKSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGJpbmQgdG8gdGFyZ2V0IGV2ZW50IHdpdGhvdXQgYSBmdW5jdGlvbiBvciBtZXRob2QgbmFtZSBhcyBjYWxsYmFjaycpO1xuICAgIH1cblxuICAgIGlmICgodHlwZW9mIGNhbGxiYWNrID09PSAnc3RyaW5nJykgJiYgIWNvbnRleHRbY2FsbGJhY2tdKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBiaW5kIHRvIHRhcmdldCB1c2luZyBhIG1ldGhvZCBuYW1lIHRoYXQgZG9lcyBub3QgZXhpc3QgZm9yIHRoZSBjb250ZXh0Jyk7XG4gICAgfVxuICB9LFxuXG4gICdpc0FscmVhZHlCb3VuZCc6IGZ1bmN0aW9uICh0YXJnZXQsIGV2ZW50LCBjYWxsYmFjaywgY29udGV4dCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIGNoZWNrIGZvciBzYW1lIGNhbGxiYWNrIG9uIHRoZSBzYW1lIHRhcmdldCBpbnN0YW5jZVxuICAgIC8vIHJldHVybiBlYXJseSB3aXRodGhlIGV2ZW50IGJpbmRpbmdcbiAgICB2YXIgZXZlbnRzID0gc2VsZi5fbmFtZWRFdmVudHNbZXZlbnRdO1xuICAgIGlmIChldmVudHMpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBtYXggPSBldmVudHMubGVuZ3RoOyBpIDwgbWF4OyBpKyspIHtcblxuICAgICAgICB2YXIgY3VycmVudCA9IGV2ZW50c1tpXSB8fCB7fTtcblxuICAgICAgICAvLyB0aGUgYmVsb3cgIWJvdW5kVGFyZ2V0IGNoZWNrIHNlZW1zIHVucmVhY2hhYmxlXG4gICAgICAgIC8vIHdhcyBhZGRlZCBpbiB0aGlzIGNvbW1pdCBvZiB0aGUgd2ViIGFwcDogYzc1ZDUwNzdjMGE4NjI5YjYwY2I2ZGQxY2Q3OGQzYmM3N2ZjYWM0OFxuICAgICAgICAvLyBuZWVkIHRvIGFzayBBZGFtIHVuZGVyIHdoYXQgY29uZGl0aW9ucyB0aGlzIHdvdWxkIGJlIHBvc3NpYmxlXG4gICAgICAgIHZhciBib3VuZFRhcmdldCA9IGN1cnJlbnQudGFyZ2V0O1xuICAgICAgICBpZiAoIWJvdW5kVGFyZ2V0KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRhcmdldEJvdW5kID0gdGFyZ2V0LnVpZCA/IHRhcmdldC51aWQgPT09IGJvdW5kVGFyZ2V0LnVpZCA6IGZhbHNlO1xuICAgICAgICBpZiAoY3VycmVudC5vcmlnaW5hbENhbGxiYWNrID09PSBjYWxsYmFjayAmJlxuICAgICAgICAgICAgY3VycmVudC5jb250ZXh0ID09PSBjb250ZXh0ICYmIHRhcmdldEJvdW5kKSB7XG4gICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG5cbiAgJ2FkZFRvTmFtZWRCaW5kaW5ncyc6IGZ1bmN0aW9uIChldmVudCwgYmluZGluZykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghc2VsZi5fbmFtZWRFdmVudHNbZXZlbnRdKSB7XG4gICAgICBzZWxmLl9uYW1lZEV2ZW50c1tldmVudF0gPSBbXTtcbiAgICB9XG4gICAgc2VsZi5fbmFtZWRFdmVudHNbZXZlbnRdLnB1c2goYmluZGluZyk7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdCQmluZGFibGVNaXhpbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGZvckVhY2ggPSByZXF1aXJlKCcuLi9saWIvZm9yRWFjaCcpO1xudmFyIFdCTWl4aW4gPSByZXF1aXJlKCcuLi9XQk1peGluJyk7XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gQ2FsbCAoZm4pIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICAodHlwZW9mIGZuID09PSAnc3RyaW5nJykgJiYgKGZuID0gc2VsZltmbl0pO1xuICAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSAmJiBmbi5jYWxsKHNlbGYpO1xufVxuXG52YXIgY2xlYW51cE1ldGhvZHMgPSBbJ3VuYmluZCcsICd1bmJpbmRBbGwnLCAnb25EZXN0cm95J107XG5cbnZhciBXQkRlc3Ryb3lhYmxlTWl4aW4gPSBXQk1peGluLmV4dGVuZCh7XG5cbiAgJ2Rlc3Ryb3knOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBjbGVhbiB1cFxuICAgIGZvckVhY2goY2xlYW51cE1ldGhvZHMsIENhbGwsIHNlbGYpO1xuXG4gICAgc2VsZi50cmlnZ2VyKCdkZXN0cm95Jyk7XG5cbiAgICBzZWxmLmRlc3Ryb3lPYmplY3Qoc2VsZik7XG5cbiAgICBzZWxmLmRlc3Ryb3llZCA9IHRydWU7XG4gIH0sXG5cbiAgJ2Rlc3Ryb3lPYmplY3QnOiBmdW5jdGlvbiAob2JqZWN0KSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgICAgc2VsZi5kZXN0cm95S2V5KGtleSwgb2JqZWN0KTtcbiAgICB9XG4gIH0sXG5cbiAgJ2Rlc3Ryb3lLZXknOiBmdW5jdGlvbiAoa2V5LCBjb250ZXh0KSB7XG5cbiAgICBpZiAoY29udGV4dC5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIGtleSAhPT0gJ3VpZCcgJiYga2V5ICE9PSAnY2lkJykge1xuICAgICAgLy8gbWFrZSBmdW5jdGlvbnMgbm9vcFxuICAgICAgaWYgKHR5cGVvZiBjb250ZXh0W2tleV0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY29udGV4dFtrZXldID0gbm9vcDtcbiAgICAgIH1cbiAgICAgIC8vIGFuZCBvdGhlcnMgdW5kZWZpbmVkXG4gICAgICBlbHNlIHtcbiAgICAgICAgY29udGV4dFtrZXldID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgIH1cbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV0JEZXN0cm95YWJsZU1peGluO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgV0JNaXhpbiA9IHJlcXVpcmUoJy4uL1dCTWl4aW4nKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuLi9saWIvZXZlbnRzJyk7XG5cbnZhciBXQkV2ZW50c01peGluID0gV0JNaXhpbi5leHRlbmQoZXZlbnRzKTtcblxubW9kdWxlLmV4cG9ydHMgPSBXQkV2ZW50c01peGluO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2xvbmUgPSByZXF1aXJlKCcuLi9saWIvY2xvbmUnKTtcbnZhciBtZXJnZSA9IHJlcXVpcmUoJy4uL2xpYi9tZXJnZScpO1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4uL2xpYi9leHRlbmQnKTtcbnZhciBpc0VxdWFsID0gcmVxdWlyZSgnLi4vbGliL2lzRXF1YWwnKTtcbnZhciBXQk1peGluID0gcmVxdWlyZSgnLi4vV0JNaXhpbicpO1xuXG52YXIgV0JTdGF0ZU1peGluID0gV0JNaXhpbi5leHRlbmQoe1xuXG4gICdhdHRyaWJ1dGVzJzoge30sXG4gICdvcHRpb25zJzoge30sXG5cbiAgJ2luaXRpYWxpemUnOiBmdW5jdGlvbiAoYXR0cmlidXRlcywgb3B0aW9ucykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuYXR0cmlidXRlcyA9IGV4dGVuZCh7fSwgc2VsZi5kZWZhdWx0cywgYXR0cmlidXRlcyk7XG4gICAgc2VsZi5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICBzZWxmLmNoYW5nZWQgPSB7fTtcbiAgfSxcblxuICAnZ2V0JzogZnVuY3Rpb24gKGtleSkge1xuICAgIGNvbnNvbGUud2FybignZ2V0dGVycyBhcmUgZGVwcmVjYXRlZCcpO1xuICAgIHJldHVybiB0aGlzLmF0dHJpYnV0ZXNba2V5XTtcbiAgfSxcblxuICAnc2V0JzogZnVuY3Rpb24gKGtleSwgdmFsLCBvcHRpb25zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKGtleSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHNlbGY7XG4gICAgfVxuXG4gICAgdmFyIGF0dHJzLCBhdHRyO1xuICAgIC8vIEhhbmRsZSBib3RoIGBcImtleVwiLCB2YWx1ZWAgYW5kIGB7a2V5OiB2YWx1ZX1gIC1zdHlsZSBhcmd1bWVudHMuXG4gICAgaWYgKHR5cGVvZiBrZXkgPT09ICdvYmplY3QnKSB7XG4gICAgICBhdHRycyA9IGtleTtcbiAgICAgIG9wdGlvbnMgPSB2YWw7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF0dHJzID0ge307XG4gICAgICBhdHRyc1trZXldID0gdmFsO1xuICAgIH1cblxuICAgIC8vIGRlZmF1bHQgb3B0aW9ucyBhcmUgZW1wdHlcbiAgICBvcHRpb25zIHx8IChvcHRpb25zID0ge30pO1xuXG4gICAgLy8gbm8gbmVlZCB0byB0cmFjayBjaGFuZ2VzIG9uIG9wdGlvbnMuc2lsZW50XG4gICAgaWYgKG9wdGlvbnMuc2lsZW50KSB7XG4gICAgICBtZXJnZShzZWxmLmF0dHJpYnV0ZXMsIGF0dHIpO1xuICAgIH1cbiAgICAvLyBGb3IgZWFjaCBgc2V0YCBhdHRyaWJ1dGUsIHVwZGF0ZSBvciBkZWxldGUgdGhlIGN1cnJlbnQgdmFsdWUuXG4gICAgZWxzZSB7XG4gICAgICB2YXIgY2hhbmdlcyA9IHNlbGYuY2hhbmdlcyhhdHRycywgb3B0aW9ucyk7XG4gICAgICBzZWxmLl90cmlnZ2VyKGF0dHJzLCBjaGFuZ2VzLCBvcHRpb25zKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZjtcbiAgfSxcblxuICAndW5zZXQnOiBmdW5jdGlvbiAoYXR0ciwgb3B0aW9ucykge1xuICAgIHJldHVybiB0aGlzLnNldChhdHRyLCB1bmRlZmluZWQsIGV4dGVuZCh7fSwgb3B0aW9ucywgeyAndW5zZXQnOiB0cnVlIH0pKTtcbiAgfSxcblxuICAnY2xlYXInOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gc2VsZi5zZXQoc2VsZi5kZWZhdWx0cywgb3B0aW9ucyk7XG4gIH0sXG5cbiAgJ2NoYW5nZXMnOiBmdW5jdGlvbiAoYXR0cnMsIG9wdGlvbnMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIga2V5LCB2YWw7XG4gICAgdmFyIGNoYW5nZXMgPSBbXTtcblxuICAgIHZhciBwcmV2ID0gY2xvbmUoc2VsZi5hdHRyaWJ1dGVzLCB0cnVlKTtcbiAgICB2YXIgY3VycmVudCA9IHNlbGYuYXR0cmlidXRlcztcbiAgICBzZWxmLmNoYW5nZWQgPSB7fTtcblxuICAgIGZvciAoa2V5IGluIGF0dHJzKSB7XG4gICAgICB2YWwgPSBhdHRyc1trZXldO1xuICAgICAgaWYgKCFpc0VxdWFsKGN1cnJlbnRba2V5XSwgdmFsKSkge1xuICAgICAgICBjaGFuZ2VzLnB1c2goa2V5KTtcbiAgICAgIH1cbiAgICAgIGlmICghaXNFcXVhbChwcmV2W2tleV0sIHZhbCkpIHtcbiAgICAgICAgc2VsZi5jaGFuZ2VkW2tleV0gPSB2YWw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWxldGUgc2VsZi5jaGFuZ2VkW2tleV07XG4gICAgICB9XG5cbiAgICAgIGN1cnJlbnRba2V5XSA9IG9wdGlvbnMudW5zZXQgPyB1bmRlZmluZWQgOiB2YWw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNoYW5nZXM7XG4gIH0sXG5cbiAgJ190cmlnZ2VyJzogZnVuY3Rpb24gKGF0dHJzLCBjaGFuZ2VzLCBvcHRpb25zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGN1cnJlbnQgPSBzZWxmLmF0dHJpYnV0ZXM7XG5cbiAgICAvLyBpZiBhbnkgY2hhbmdlcyBmb3VuZFxuICAgIC8vICYgaWYgdGhpcyBpcyBhbiBFdmVudEVtaXR0ZXIsXG4gICAgLy8gdHJpZ2dlciB0aGUgY2hhbmdlIGV2ZW50c1xuICAgIHZhciBhdHRyO1xuICAgIHdoaWxlIChjaGFuZ2VzICYmIGNoYW5nZXMubGVuZ3RoICYmIHNlbGYudHJpZ2dlcikge1xuICAgICAgYXR0ciA9IGNoYW5nZXMuc2hpZnQoKTtcbiAgICAgIHNlbGYudHJpZ2dlcignY2hhbmdlOicgKyBhdHRyLCBzZWxmLCBjdXJyZW50W2F0dHJdLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdCU3RhdGVNaXhpbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFdCTWl4aW4gPSByZXF1aXJlKCcuLi9XQk1peGluJyk7XG52YXIgV0JEZWZlcnJlZCA9IHJlcXVpcmUoJy4uL1dCRGVmZXJyZWQnKTtcbnZhciB3aGVuID0gcmVxdWlyZSgnLi4vbGliL3doZW4nKTtcbnZhciB0b0FycmF5ID0gcmVxdWlyZSgnLi4vbGliL3RvQXJyYXknKTtcbnZhciBmb3JFYWNoID0gcmVxdWlyZSgnLi4vbGliL2ZvckVhY2gnKTtcbnZhciBkZWxheSA9IHJlcXVpcmUoJy4uL2xpYi9kZWxheScpO1xudmFyIGRlZmVyID0gcmVxdWlyZSgnLi4vbGliL2RlZmVyJyk7XG52YXIgZnVuY3Rpb25zID0gcmVxdWlyZSgnLi4vbGliL2Z1bmN0aW9ucycpO1xuXG52YXIgV0JVdGlsc01peGluID0gV0JNaXhpbi5leHRlbmQoe1xuXG4gICdkZWZlcnJlZCc6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIG5ldyBXQkRlZmVycmVkKHNlbGYpO1xuICB9LFxuXG4gICd3aGVuJzogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gd2hlbi5hcHBseShzZWxmLCBhcmd1bWVudHMpO1xuICB9LFxuXG4gICdkZWZlcic6IGZ1bmN0aW9uIChmbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgICAvLyBkZWZhdWx0IGNvbnRleHQgdG8gc2VsZlxuICAgIGFyZ3NbMV0gPSBhcmdzWzFdIHx8IHRoaXM7XG4gICAgLy8gc3VwcG9ydCBzdHJpbmcgbmFtZXMgb2YgZnVuY3Rpb25zIG9uIHNlbGZcbiAgICAodHlwZW9mIGZuID09PSAnc3RyaW5nJykgJiYgKGFyZ3NbMF0gPSBzZWxmW2ZuXSk7XG4gICAgcmV0dXJuIGRlZmVyLmFwcGx5KG51bGwsIGFyZ3MpO1xuICB9LFxuXG4gICdkZWxheSc6IGZ1bmN0aW9uIChmbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgICAvLyBkZWZhdWx0IGNvbnRleHQgdG8gc2VsZlxuICAgIGFyZ3NbMl0gPSBhcmdzWzJdIHx8IHNlbGY7XG4gICAgLy8gc3VwcG9ydCBzdHJpbmcgbmFtZXMgb2YgZnVuY3Rpb25zIG9uIHNlbGZcbiAgICAodHlwZW9mIGZuID09PSAnc3RyaW5nJykgJiYgKGFyZ3NbMF0gPSBzZWxmW2ZuXSk7XG4gICAgcmV0dXJuIGRlbGF5LmFwcGx5KG51bGwsIGFyZ3MpO1xuICB9LFxuXG4gICdmb3JFYWNoJzogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIGZuLCBjb250ZXh0KSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC8vIGRlZmF1bHQgY29udGV4dCB0byBzZWxmXG4gICAgY29udGV4dCA9IGNvbnRleHQgfHwgc2VsZjtcbiAgICAvLyBzdXBwb3J0IHN0cmluZyBuYW1lcyBvZiBmdW5jdGlvbnMgb24gc2VsZlxuICAgICh0eXBlb2YgZm4gPT09ICdzdHJpbmcnKSAmJiAoZm4gPSBzZWxmW2ZuXSk7XG4gICAgZm9yRWFjaChjb2xsZWN0aW9uLCBmbiwgY29udGV4dCk7XG4gIH0sXG5cbiAgJ2Z1bmN0aW9ucyc6IGZ1bmN0aW9uIChvYmopIHtcbiAgICByZXR1cm4gZnVuY3Rpb25zKG9iaiB8fCB0aGlzKTtcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV0JVdGlsc01peGluO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgJ0NvbnRyb2xsZXJNaXhpbic6IHJlcXVpcmUoJy4vQ29udHJvbGxlck1peGluJyksXG4gICdPYnNlcnZhYmxlSGFzaE1peGluJzogcmVxdWlyZSgnLi9PYnNlcnZhYmxlSGFzaE1peGluJyksXG4gICdXQkJpbmRhYmxlTWl4aW4nOiByZXF1aXJlKCcuL1dCQmluZGFibGVNaXhpbicpLFxuICAnV0JEZXN0cm95YWJsZU1peGluJzogcmVxdWlyZSgnLi9XQkRlc3Ryb3lhYmxlTWl4aW4nKSxcbiAgJ1dCRXZlbnRzTWl4aW4nOiByZXF1aXJlKCcuL1dCRXZlbnRzTWl4aW4nKSxcbiAgJ1dCU3RhdGVNaXhpbic6IHJlcXVpcmUoJy4vV0JTdGF0ZU1peGluJyksXG4gICdXQlV0aWxzTWl4aW4nOiByZXF1aXJlKCcuL1dCVXRpbHNNaXhpbicpXG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNvcmUgPSByZXF1aXJlKCd3dW5kZXJiaXRzLmNvcmUnKTtcbnZhciBXQkV2ZW50RW1pdHRlciA9IGNvcmUuV0JFdmVudEVtaXR0ZXI7XG52YXIgY2xvbmUgPSBjb3JlLmxpYi5jbG9uZTtcbnZhciBhc3NlcnQgPSBjb3JlLmxpYi5hc3NlcnQ7XG5cbnZhciBnZW5lcmF0ZUlkID0gcmVxdWlyZSgnLi9saWIvZ2VuZXJhdGVJZCcpO1xuXG4vLyBEZWZhdWx0IGlkIEF0dHJpYnV0ZSB1c2VkXG52YXIgZGVmYXVsdEtleVBhdGggPSAnaWQnO1xuXG52YXIgQmFja2JvbmVEQlN5bmMgPSBXQkV2ZW50RW1pdHRlci5leHRlbmQoe1xuXG4gICdpbml0aWFsaXplJzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBhc3NlcnQub2JqZWN0KG9wdGlvbnMpO1xuICAgIGFzc2VydChvcHRpb25zLmRhdGFiYXNlKTtcblxuICAgIHNlbGYuZGF0YWJhc2UgPSBvcHRpb25zLmRhdGFiYXNlO1xuICB9LFxuXG4gICdnZW5lcmF0ZUlkJzogZnVuY3Rpb24gKGtleVBhdGgsIGlkLCBpbnN0YW5jZSkge1xuXG4gICAgaWYgKCFpZCkge1xuICAgICAgaWQgPSBnZW5lcmF0ZUlkKCk7XG4gICAgICBpZiAoaW5zdGFuY2UuY29sbGVjdGlvbikge1xuICAgICAgICB3aGlsZSAoaW5zdGFuY2UuY29sbGVjdGlvbi5nZXQoaWQpKSB7XG4gICAgICAgICAgaWQgPSBnZW5lcmF0ZUlkKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGluc3RhbmNlLnNldChrZXlQYXRoLCBpZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGlkO1xuICB9LFxuXG4gICdxdWVyeUNvbGxlY3Rpb24nOiBmdW5jdGlvbiAoY29sbGVjdGlvbikge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBjcnVkID0gc2VsZi5kYXRhYmFzZS5jcnVkO1xuICAgIHZhciBzdG9yZU5hbWUgPSBjb2xsZWN0aW9uLnN0b3JlTmFtZSB8fCBjb2xsZWN0aW9uLm1vZGVsLnByb3RvdHlwZS5zdG9yZU5hbWU7XG4gICAgcmV0dXJuIGNydWQucXVlcnkoc3RvcmVOYW1lKTtcbiAgfSxcblxuICAnb3BlcmF0ZU9uTW9kZWwnOiBmdW5jdGlvbiAobW9kZWwsIG1ldGhvZCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBjcnVkID0gc2VsZi5kYXRhYmFzZS5jcnVkO1xuICAgIHZhciBqc29uO1xuICAgIGlmICh0eXBlb2YgbW9kZWwudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBqc29uID0gbW9kZWwudG9KU09OKCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAganNvbiA9IGNsb25lKG1vZGVsLmF0dHJpYnV0ZXMpO1xuICAgIH1cbiAgICBqc29uLmlkIHx8IChqc29uLmlkID0gbW9kZWwuaWQpO1xuICAgIHJldHVybiBjcnVkW21ldGhvZF0obW9kZWwuc3RvcmVOYW1lLCBqc29uKTtcbiAgfSxcblxuICAnc3luYyc6IGZ1bmN0aW9uIChtZXRob2QsIGluc3RhbmNlLCBvcHRpb25zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB2YXIgc3RvcmVzID0gc2VsZi5kYXRhYmFzZS5zdG9yZXM7XG5cbiAgICB2YXIgY29sbGVjdGlvbiA9IGluc3RhbmNlLmNvbGxlY3Rpb247XG4gICAgdmFyIHN0b3JlTmFtZSA9IGluc3RhbmNlLnN0b3JlTmFtZSB8fCAoY29sbGVjdGlvbiAmJiBjb2xsZWN0aW9uLnN0b3JlTmFtZSk7XG4gICAgdmFyIHN0b3JlSW5mbyA9IHN0b3Jlc1tzdG9yZU5hbWVdO1xuICAgIHZhciBrZXlQYXRoID0gKHN0b3JlSW5mbyAmJiBzdG9yZUluZm8ua2V5UGF0aCkgfHwgZGVmYXVsdEtleVBhdGg7XG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBpbnN0YW5jZS5hdHRyaWJ1dGVzO1xuICAgIHZhciBpZCA9IGF0dHJpYnV0ZXMuaWQgfHwgYXR0cmlidXRlc1trZXlQYXRoXTtcbiAgICB2YXIgaXNBV3JpdGUgPSAvKGNyZWF0ZXx1cGRhdGUpLy50ZXN0KG1ldGhvZCk7XG5cbiAgICAvLyBBc3NpZ24gSURzIGF1dG9tYXRpY2FsbHkgaWYgbm90IHByZXNlbnRcbiAgICBpZiAoaXNBV3JpdGUpIHtcbiAgICAgIGlkID0gc2VsZi5nZW5lcmF0ZUlkKGtleVBhdGgsIGlkLCBpbnN0YW5jZSk7XG4gICAgfVxuXG4gICAgLy8gZm9yIHNwZWNzLCB3ZSBzaG91bGQgYmUgYWJsZSB0byBza2lwIHRoaXMgbWFnaWNcbiAgICBpZiAoIXN0b3JlTmFtZSB8fCBzdG9yZU5hbWUgPT09ICdub25lJykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnN1Y2Nlc3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgb3B0aW9ucy5zdWNjZXNzKCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gc2tpcCBpbnZhbGlkIGNydXAgb3BlcmF0aW9uIG9yIG1vZGVscyB0aGF0IGRvbid0IGhhdmUgYSB2YWxpZCBzdG9yZU5hbWVcbiAgICBpZiAoc3RvcmVOYW1lIGluIHN0b3Jlcykge1xuXG4gICAgICB2YXIgX3N1Y2Nlc3MgPSBvcHRpb25zLnN1Y2Nlc3M7XG4gICAgICBvcHRpb25zLnN1Y2Nlc3MgPSBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBfc3VjY2VzcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIF9zdWNjZXNzLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0cmlnZ2VyIGV2ZW50cyBmb3Igc3luY2luZ1xuICAgICAgICBpZiAoLyhjcmVhdGV8dXBkYXRlfGRlc3Ryb3kpLy50ZXN0KG1ldGhvZCkpIHtcbiAgICAgICAgICBzZWxmLmRhdGFiYXNlLnRyaWdnZXIobWV0aG9kLCBzdG9yZU5hbWUsIGlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZSBmdWxsLXRleHQgaW5kZXggd2hlbiBuZWVkZWRcbiAgICAgICAgaWYgKCdmdWxsVGV4dEluZGV4RmllbGRzJyBpbiBzdG9yZUluZm8pIHtcbiAgICAgICAgICBzZWxmLnRyaWdnZXIoJ2luZGV4JywgbWV0aG9kLCBzdG9yZU5hbWUsIGluc3RhbmNlKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgdmFyIHJlcXVlc3Q7XG5cbiAgICAgIC8vIHF1ZXJ5IGNvbGxlY3Rpb25zXG4gICAgICBpZiAobWV0aG9kID09PSAncmVhZCcgJiYgIWluc3RhbmNlLmlkICYmIGluc3RhbmNlLm1vZGVsKSB7XG4gICAgICAgIHJlcXVlc3QgPSBzZWxmLnF1ZXJ5Q29sbGVjdGlvbihpbnN0YW5jZSk7XG4gICAgICB9XG4gICAgICAvLyByZWd1bGFyIG1vZGVsc1xuICAgICAgZWxzZSB7XG4gICAgICAgIHJlcXVlc3QgPSBzZWxmLm9wZXJhdGVPbk1vZGVsKGluc3RhbmNlLCBtZXRob2QpO1xuICAgICAgfVxuXG4gICAgICBvcHRpb25zLnN1Y2Nlc3MgJiYgcmVxdWVzdC5kb25lKG9wdGlvbnMuc3VjY2Vzcyk7XG4gICAgICBvcHRpb25zLmVycm9yICYmIHJlcXVlc3QuZmFpbChvcHRpb25zLmVycm9yKTtcbiAgICB9XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lREJTeW5jO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY29yZSA9IHJlcXVpcmUoJ3d1bmRlcmJpdHMuY29yZScpO1xudmFyIFdCRXZlbnRFbWl0dGVyID0gY29yZS5XQkV2ZW50RW1pdHRlcjtcbnZhciBXQkRlZmVycmVkID0gY29yZS5XQkRlZmVycmVkO1xudmFyIHdoZW4gPSBjb3JlLmxpYi53aGVuO1xudmFyIGFzc2VydCA9IGNvcmUubGliLmFzc2VydDtcblxudmFyIEVycm9ycyA9IHtcbiAgJ2luaXQnOiAnRVJSX0FCU1RSQUNUX0JBQ0tFTkRfSU5JVElBTElaRUQnXG59O1xuXG52YXIgQWJzdHJhY3RCYWNrZW5kID0gV0JFdmVudEVtaXR0ZXIuZXh0ZW5kKHtcblxuICAnZGVmYXVsdEtleVBhdGgnOiAnaWQnLFxuXG4gICdpbml0aWFsaXplJzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgYXNzZXJ0KHNlbGYuY29uc3RydWN0b3IgIT09IEFic3RyYWN0QmFja2VuZCwgRXJyb3JzLmluaXQpO1xuXG4gICAgc2VsZi5yZWFkeSA9IG5ldyBXQkRlZmVycmVkKCk7XG4gIH0sXG5cbiAgJ2Nvbm5lY3QnOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYub3B0aW9ucyA9IHNlbGYub3B0aW9ucyB8fCB7fTtcbiAgICBzZWxmLm9wdGlvbnMuZGIgPSBvcHRpb25zO1xuICAgIHNlbGYuc3RvcmVzID0gb3B0aW9ucy5zdG9yZXM7XG4gICAgc2VsZi5vcGVuREIob3B0aW9ucy5uYW1lLCBvcHRpb25zLnZlcnNpb24pO1xuICAgIHJldHVybiBzZWxmLnJlYWR5LnByb21pc2UoKTtcbiAgfSxcblxuICAnb3BlblN1Y2Nlc3MnOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi50cmlnZ2VyKCdjb25uZWN0ZWQnKTtcbiAgICBzZWxmLnJlYWR5LnJlc29sdmUoKTtcbiAgfSxcblxuICAnb3BlbkZhaWx1cmUnOiBmdW5jdGlvbiAoY29kZSwgZXJyb3IpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLnRyaWdnZXIoJ2Vycm9yJywgY29kZSwgZXJyb3IpO1xuICAgIHNlbGYucmVhZHkucmVqZWN0KGNvZGUsIGVycm9yKTtcbiAgfSxcblxuICAvLyBoZWxwZXIgdG8gbG9vcCB0aHJvdWdoIHN0b3Jlc1xuICAnbWFwU3RvcmVzJzogZnVuY3Rpb24gKGl0ZXJhdG9yKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICB2YXIgc3RvcmVzID0gc2VsZi5zdG9yZXM7XG4gICAgdmFyIHN0b3JlTmFtZXMgPSBPYmplY3Qua2V5cyhzdG9yZXMpO1xuICAgIHZhciByZXN1bHQsIHN0b3JlTmFtZSwgc3RvcmVJbmZvO1xuXG4gICAgd2hpbGUgKHN0b3JlTmFtZXMubGVuZ3RoKSB7XG4gICAgICBzdG9yZU5hbWUgPSBzdG9yZU5hbWVzLnNoaWZ0KCk7XG4gICAgICBzdG9yZUluZm8gPSBzdG9yZXNbc3RvcmVOYW1lXTtcbiAgICAgIHJlc3VsdCA9IGl0ZXJhdG9yLmNhbGwoc2VsZiwgc3RvcmVOYW1lLCBzdG9yZUluZm8pO1xuICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0sXG5cbiAgJ3RydW5jYXRlJzogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBwYXVzZSBhbGwgREIgb3BlcmF0aW9uc1xuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG4gICAgc2VsZi5yZWFkeSA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICB2YXIgc3RvcmVDbGVhclByb21pc2VzID0gc2VsZi5tYXBTdG9yZXMoc2VsZi5jbGVhclN0b3JlKTtcbiAgICB3aGVuKHN0b3JlQ2xlYXJQcm9taXNlcykudGhlbihmdW5jdGlvbiAoKSB7XG5cbiAgICAgIC8vIHJlamVjdCBhbGwgREIgb3BlcmF0aW9uc1xuICAgICAgc2VsZi5yZWFkeS5yZWplY3QoKTtcbiAgICAgIGRlZmVycmVkLnJlc29sdmUoKTtcblxuICAgICAgLy8gTEVHQUNZOiByZW1vdmUgdGhpc1xuICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgfVxuXG4gICAgICBzZWxmLnRyaWdnZXIoJ3RydW5jYXRlZCcpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQWJzdHJhY3RCYWNrZW5kO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY29yZSA9IHJlcXVpcmUoJ3d1bmRlcmJpdHMuY29yZScpO1xudmFyIFdCRGVmZXJyZWQgPSBjb3JlLldCRGVmZXJyZWQ7XG5cbnZhciBBYnN0cmFjdEJhY2tlbmQgPSByZXF1aXJlKCcuL0Fic3RyYWN0QmFja2VuZCcpO1xudmFyIEdsb2JhbCA9IHJlcXVpcmUoJy4uL2xpYi9nbG9iYWwnKTtcblxudmFyIERPTUVycm9yID0gR2xvYmFsLkRPTUVycm9yIHx8IEdsb2JhbC5ET01FeGNlcHRpb247XG52YXIgaW5kZXhlZERCID0gR2xvYmFsLmluZGV4ZWREQiB8fFxuICAgICAgICAgICAgICAgIEdsb2JhbC53ZWJraXRJbmRleGVkREIgfHxcbiAgICAgICAgICAgICAgICBHbG9iYWwubW96SW5kZXhlZERCIHx8XG4gICAgICAgICAgICAgICAgR2xvYmFsLm1zSW5kZXhlZERCO1xuXG52YXIgQ29uc3RhbnRzID0ge1xuICAnUkVBRCc6ICdyZWFkb25seScsXG4gICdXUklURSc6ICdyZWFkd3JpdGUnXG59O1xuXG52YXIgRXJyb3JzID0ge1xuICAncHJpdmF0ZU1vZGUnOiAnRVJSX0lEQl9GSVJFRk9YX1BSSVZBVEVfTU9ERScsXG4gICdkb3duZ3JhZGUnOiAnRVJSX0lEQl9DQU5UX0RPV05HUkFERV9WRVJTSU9OJyxcbiAgJ3Vua25vd24nOiAnRVJSX0lEQl9VTktOT1dOJyxcbiAgJ3VwZ3JhZGVCcm93c2VyJzogJ0VSUl9JREJfVVBHUkFERV9CUk9XU0VSJyxcbiAgJ3N0b3JlQ3JlYXRpb25GYWlsZWQnOiAnRVJSX0lEQl9TVE9SRV9DUkVBVElPTl9GQUlMRUQnLFxuICAnc3RvcmVDbGVhckZhaWxlZCc6ICdFUlJfSURCX1NUT1JFX0NMRUFSX0ZBSUxFRCcsXG4gICdub3RGb3VuZCc6ICdFUlJfSURCX09CSkVDVF9OT1RfRk9VTkQnLFxuICAnZ2V0RmFpbGVkJzogJ0VSUl9JREJfU1RPUkVfR0VUX0ZBSUxFRCcsXG4gICdjdXJzb3JGYWlsZWQnOiAnRVJSX0lEQl9DQU5UX09QRU5fQ1VSU09SJyxcbiAgJ3F1ZXJ5RmFpbGVkJzogJ0VSUl9JREJfUVVFUllfRkFJTEVEJyxcbiAgJ3VwZGF0ZUZhaWxlZCc6ICdFUlJfSURCX1NUT1JFX1VQREFURV9GQUlMRUQnLFxuICAnZGVzdHJveUZhaWxlZCc6ICdFUlJfSURCX1NUT1JFX0RFU1RST1lfRkFJTEVEJ1xufTtcblxudmFyIEluZGV4ZWREQkJhY2tlbmQgPSBBYnN0cmFjdEJhY2tlbmQuZXh0ZW5kKHtcblxuICAnb3BlbkRCJzogZnVuY3Rpb24gKG5hbWUsIHZlcnNpb24pIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHZhciBvcGVuUmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKG5hbWUsIHZlcnNpb24pO1xuICAgIG9wZW5SZXF1ZXN0Lm9uZXJyb3IgPSBzZWxmLm9uUmVxdWVzdEVycm9yLmJpbmQoc2VsZik7XG4gICAgb3BlblJlcXVlc3Qub25zdWNjZXNzID0gc2VsZi5vblJlcXVlc3RTdWNjZXNzLmJpbmQoc2VsZik7XG4gICAgb3BlblJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gc2VsZi5vblVwZ3JhZGVOZWVkZWQuYmluZChzZWxmKTtcbiAgfSxcblxuICAnb25SZXF1ZXN0RXJyb3InOiBmdW5jdGlvbiAoZXZlbnQpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZXJyb3IgPSBldmVudC50YXJnZXQuZXJyb3I7XG4gICAgdmFyIGVycm9yTmFtZSA9IGVycm9yLm5hbWU7XG4gICAgdmFyIGlzRE9NRXJyb3IgPSAoZXJyb3IgaW5zdGFuY2VvZiBET01FcnJvcik7XG5cbiAgICBpZiAoZXJyb3JOYW1lID09PSAnSW52YWxpZFN0YXRlRXJyb3InICYmIGlzRE9NRXJyb3IpIHtcbiAgICAgIHNlbGYub3BlbkZhaWx1cmUoRXJyb3JzLnByaXZhdGVNb2RlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoZXJyb3JOYW1lID09PSAnVmVyc2lvbkVycm9yJyAmJiBpc0RPTUVycm9yKSB7XG4gICAgICBzZWxmLm9wZW5GYWlsdXJlKEVycm9ycy5kb3duZ3JhZGUpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHNlbGYub3BlbkZhaWx1cmUoRXJyb3JzLnVua25vd24sIGVycm9yKTtcbiAgICB9XG4gIH0sXG5cbiAgJ29uUmVxdWVzdFN1Y2Nlc3MnOiBmdW5jdGlvbiAoZXZlbnQpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmIChzZWxmLmRiKSB7XG4gICAgICBzZWxmLm9wZW5TdWNjZXNzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGRiID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICBpZiAodHlwZW9mIGRiLnZlcnNpb24gPT09ICdzdHJpbmcnKSB7XG4gICAgICBzZWxmLm9wZW5GYWlsdXJlKEVycm9ycy51cGdyYWRlQnJvd3Nlcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc2VsZi5kYiA9IGRiO1xuICAgIHNlbGYuc3RvcmVOYW1lcyA9IGRiLm9iamVjdFN0b3JlTmFtZXM7XG4gICAgc2VsZi5vcGVuU3VjY2VzcygpO1xuICB9LFxuXG4gICdvblVwZ3JhZGVOZWVkZWQnOiBmdW5jdGlvbiAoZXZlbnQpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGIgPSBldmVudC50YXJnZXQucmVzdWx0O1xuICAgIHNlbGYuZGIgPSBkYjtcbiAgICBzZWxmLnN0b3JlTmFtZXMgPSBkYi5vYmplY3RTdG9yZU5hbWVzO1xuXG4gICAgc2VsZi50cmlnZ2VyKCd1cGdyYWRpbmcnKTtcblxuICAgIHNlbGYubWFwU3RvcmVzKHNlbGYuY3JlYXRlU3RvcmUpO1xuICB9LFxuXG4gICdjcmVhdGVTdG9yZSc6IGZ1bmN0aW9uIChzdG9yZU5hbWUsIHN0b3JlSW5mbykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkYiA9IHNlbGYuZGI7XG5cbiAgICAvLyBjcmVhdGUgc3RvcmUsIG9ubHkgaWYgZG9lc24ndCBhbHJlYWR5IGV4aXN0XG4gICAgaWYgKCFzZWxmLnN0b3JlTmFtZXMuY29udGFpbnMoc3RvcmVOYW1lKSkge1xuICAgICAgdmFyIHJlcXVlc3QgPSBkYi5jcmVhdGVPYmplY3RTdG9yZShzdG9yZU5hbWUsIHtcbiAgICAgICAgJ2tleVBhdGgnOiBzdG9yZUluZm8ua2V5UGF0aCB8fCBzZWxmLmRlZmF1bHRLZXlQYXRoXG4gICAgICB9KTtcblxuICAgICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBFcnJvcnMuc3RvcmVDcmVhdGlvbkZhaWxlZCwgZXJyb3IsIHN0b3JlTmFtZSk7XG4gICAgICB9O1xuICAgIH1cbiAgfSxcblxuICAnY2xlYXJTdG9yZSc6IGZ1bmN0aW9uIChzdG9yZU5hbWUpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuXG4gICAgdmFyIHRyYW5zYWN0aW9uID0gc2VsZi5kYi50cmFuc2FjdGlvbihbc3RvcmVOYW1lXSwgQ29uc3RhbnRzLldSSVRFKTtcbiAgICB2YXIgc3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZShzdG9yZU5hbWUpO1xuXG4gICAgdmFyIHJlcXVlc3QgPSBzdG9yZS5jbGVhcigpO1xuXG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBkZWZlcnJlZC5yZXNvbHZlKCk7XG4gICAgfTtcblxuICAgIHJlcXVlc3Qub25lcnJvciA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsIEVycm9ycy5zdG9yZUNsZWFyRmFpbGVkLCBlcnJvciwgc3RvcmVOYW1lKTtcbiAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgIH07XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICdyZWFkJzogZnVuY3Rpb24gKHN0b3JlTmFtZSwganNvbikge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICB2YXIgdHJhbnNhY3Rpb24gPSBzZWxmLmRiLnRyYW5zYWN0aW9uKFtzdG9yZU5hbWVdLCBDb25zdGFudHMuUkVBRCk7XG4gICAgdmFyIHN0b3JlID0gdHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoc3RvcmVOYW1lKTtcbiAgICB2YXIgaWQgPSBqc29uW3N0b3JlLmtleVBhdGggfHwgc2VsZi5kZWZhdWx0S2V5UGF0aF0gfHwganNvbi5pZDtcblxuICAgIHZhciByZXF1ZXN0ID0gc3RvcmUuZ2V0KGlkKTtcblxuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICB2YXIganNvbiA9IGV2ZW50LnRhcmdldC5yZXN1bHQ7XG4gICAgICBpZiAoanNvbikge1xuICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKGpzb24pO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBFcnJvcnMubm90Rm91bmQsIG51bGwsIHN0b3JlTmFtZSwganNvbik7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBFcnJvcnMuZ2V0RmFpbGVkLCBlcnJvciwgc3RvcmVOYW1lLCBqc29uKTtcbiAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgIH07XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICdxdWVyeSc6IGZ1bmN0aW9uIChzdG9yZU5hbWUpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuXG4gICAgdmFyIHRyYW5zYWN0aW9uID0gc2VsZi5kYi50cmFuc2FjdGlvbihbc3RvcmVOYW1lXSwgQ29uc3RhbnRzLlJFQUQpO1xuICAgIHZhciBzdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHN0b3JlTmFtZSk7XG4gICAgdmFyIGVsZW1lbnRzID0gW107XG5cbiAgICB2YXIgcmVhZEN1cnNvciA9IHN0b3JlLm9wZW5DdXJzb3IoKTtcblxuICAgIGlmICghcmVhZEN1cnNvcikge1xuICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsIEVycm9ycy5jdXJzb3JGYWlsZWQsIG51bGwsIHN0b3JlTmFtZSk7XG4gICAgICBkZWZlcnJlZC5yZWplY3QoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZWFkQ3Vyc29yLm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsIEVycm9ycy5xdWVyeUZhaWxlZCwgZXJyb3IsIHN0b3JlTmFtZSk7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgICAgfTtcblxuICAgICAgcmVhZEN1cnNvci5vbnN1Y2Nlc3MgPSBmdW5jdGlvbiAoZSkge1xuXG4gICAgICAgIHZhciBjdXJzb3IgPSBlLnRhcmdldC5yZXN1bHQ7XG4gICAgICAgIC8vIFdlJ3JlIGRvbmUuIE5vIG1vcmUgZWxlbWVudHMuXG4gICAgICAgIGlmICghY3Vyc29yKSB7XG4gICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShlbGVtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgaGF2ZSBtb3JlIHJlY29yZHMgdG8gcHJvY2Vzc1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBlbGVtZW50cy5wdXNoKGN1cnNvci52YWx1ZSk7XG4gICAgICAgICAgY3Vyc29yWydjb250aW51ZSddKCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxuICAndXBkYXRlJzogZnVuY3Rpb24gKHN0b3JlTmFtZSwganNvbikge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICB2YXIgdHJhbnNhY3Rpb24gPSBzZWxmLmRiLnRyYW5zYWN0aW9uKFtzdG9yZU5hbWVdLCBDb25zdGFudHMuV1JJVEUpO1xuICAgIHZhciBzdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHN0b3JlTmFtZSk7XG5cbiAgICB2YXIgcmVxdWVzdCA9IHN0b3JlLnB1dChqc29uKTtcblxuICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgIH07XG5cbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBFcnJvcnMudXBkYXRlRmFpbGVkLCBlcnJvciwgc3RvcmVOYW1lLCBqc29uKTtcbiAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgIH07XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICdkZXN0cm95JzogZnVuY3Rpb24gKHN0b3JlTmFtZSwganNvbikge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICB2YXIgdHJhbnNhY3Rpb24gPSBzZWxmLmRiLnRyYW5zYWN0aW9uKFtzdG9yZU5hbWVdLCBDb25zdGFudHMuV1JJVEUpO1xuICAgIHZhciBzdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHN0b3JlTmFtZSk7XG4gICAgdmFyIGlkID0ganNvbltzdG9yZS5rZXlQYXRoIHx8IHNlbGYuZGVmYXVsdEtleVBhdGhdIHx8IGpzb24uaWQ7XG5cbiAgICB2YXIgcmVxdWVzdCA9IHN0b3JlWydkZWxldGUnXShpZCk7XG5cbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlZmVycmVkLnJlc29sdmUoKTtcbiAgICB9O1xuXG4gICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBzZWxmLnRyaWdnZXIoJ2Vycm9yJywgRXJyb3JzLmRlc3Ryb3lGYWlsZWQsIGVycm9yLCBzdG9yZU5hbWUsIGpzb24pO1xuICAgICAgZGVmZXJyZWQucmVqZWN0KCk7XG4gICAgfTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG4gIH0sXG5cbiAgJ251a2UnOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRiTmFtZSA9IHNlbGYub3B0aW9ucy5kYi5uYW1lO1xuXG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIHZhciByZXF1ZXN0ID0gaW5kZXhlZERCLmRlbGV0ZURhdGFiYXNlKGRiTmFtZSk7XG5cbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlZmVycmVkLnJlc29sdmUoKTtcbiAgICB9O1xuXG4gICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVmZXJyZWQucmVqZWN0KCk7XG4gICAgfTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEluZGV4ZWREQkJhY2tlbmQ7XG5cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNvcmUgPSByZXF1aXJlKCd3dW5kZXJiaXRzLmNvcmUnKTtcbnZhciBXQkRlZmVycmVkID0gY29yZS5XQkRlZmVycmVkO1xudmFyIGZvckVhY2ggPSBjb3JlLmxpYi5mb3JFYWNoO1xudmFyIHRvQXJyYXkgPSBjb3JlLmxpYi50b0FycmF5O1xuXG52YXIgQWJzdHJhY3RCYWNrZW5kID0gcmVxdWlyZSgnLi9BYnN0cmFjdEJhY2tlbmQnKTtcbnZhciBHbG9iYWwgPSByZXF1aXJlKCcuLi9saWIvZ2xvYmFsJyk7XG52YXIgU2FmZVBhcnNlID0gcmVxdWlyZSgnLi4vbGliL1NhZmVQYXJzZScpO1xuXG52YXIgaW5kZXhlZERCID0gR2xvYmFsLmluZGV4ZWREQiB8fFxuICAgICAgICAgICAgICAgIEdsb2JhbC53ZWJraXRJbmRleGVkREIgfHxcbiAgICAgICAgICAgICAgICBHbG9iYWwubW96SW5kZXhlZERCIHx8XG4gICAgICAgICAgICAgICAgR2xvYmFsLm1zSW5kZXhlZERCO1xuXG52YXIgTWVtb3J5QmFja2VuZCA9IEFic3RyYWN0QmFja2VuZC5leHRlbmQoe1xuXG4gICdjYWNoZSc6IHt9LFxuXG4gICdsb2NhbFN0b3JhZ2VBdmFpbGFibGUnOiB0cnVlLFxuXG4gICdpbml0aWFsaXplJzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYucmVhZHkgPSBuZXcgV0JEZWZlcnJlZCgpO1xuICB9LFxuXG4gICdjb25uZWN0JzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLnN0b3JlcyA9IG9wdGlvbnMuc3RvcmVzO1xuXG4gICAgc2VsZi5sb2NhbFN0b3JhZ2VBdmFpbGFibGUgPSBvcHRpb25zLmxvY2FsU3RvcmFnZUF2YWlsYWJsZTtcblxuICAgIC8vIE9uIGV2ZXJ5IHZlcnNpb24gY2hhbmdlLFxuICAgIC8vIGNsZWFyIG91dCB0aGUgbG9jYWxTdG9yYWdlICZcbiAgICAvLyB0cnkgYWdhaW4gZm9yIGEgYmV0dGVyIGJhY2tlbmRcbiAgICBpZiAoc2VsZi5sb2NhbFN0b3JhZ2VBdmFpbGFibGUpIHtcbiAgICAgIHZhciBzdG9yZSA9IEdsb2JhbC5sb2NhbFN0b3JhZ2U7XG4gICAgICBpZiAoc3RvcmUuZ2V0SXRlbSgnYXZhaWxhYmxlQmFja2VuZCcpID09PSAnbWVtb3J5JyAmJlxuICAgICAgICAgIHN0b3JlLmdldEl0ZW0oJ2RiVmVyc2lvbicpICE9PSAnJyArIG9wdGlvbnMudmVyc2lvbikge1xuXG4gICAgICAgIC8vIGNsZWFyIGxvY2FsU3RvcmFnZVxuICAgICAgICBzdG9yZS5jbGVhcigpO1xuXG4gICAgICAgIC8vIElmIElEQiBpcyBhdmFpbGFibGUsIGNsZWFyIHRoYXQgdG9vXG4gICAgICAgIGlmIChpbmRleGVkREIpIHtcbiAgICAgICAgICB2YXIgdHJhbnNhY3Rpb24gPSBpbmRleGVkREIuZGVsZXRlRGF0YWJhc2Uob3B0aW9ucy5uYW1lKTtcbiAgICAgICAgICAvLyBXYWl0IHRpbGwgdGhlIGRhdGFiYXNlIGlzIGRlbGV0ZWQgYmVmb3JlIHJlbG9hZGluZyB0aGUgYXBwXG4gICAgICAgICAgdHJhbnNhY3Rpb24ub25zdWNjZXNzID0gdHJhbnNhY3Rpb24ub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgR2xvYmFsLmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gT3RoZXJ3aXNlLCByZWxvYWQgcmlnaHQgYXdheVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBHbG9iYWwubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAhc2VsZi5jYWNoZSAmJiBzZWxmLnJlc2V0KCk7XG5cbiAgICBzZWxmLnJlYWR5LnJlc29sdmUoKTtcbiAgICByZXR1cm4gc2VsZi5yZWFkeS5wcm9taXNlKCk7XG4gIH0sXG5cbiAgJ3Jlc2V0JzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuY2FjaGUgPSB7fTtcbiAgICBmb3JFYWNoKHNlbGYuc3RvcmVzLCBmdW5jdGlvbiAobWV0YURhdGEsIHN0b3JlTmFtZSkge1xuICAgICAgc2VsZi5jYWNoZVtzdG9yZU5hbWVdID0ge307XG4gICAgfSk7XG4gIH0sXG5cbiAgJ3RydW5jYXRlJzogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcbiAgICBzZWxmLnJlYWR5ID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIHNlbGYucmVzZXQoKTtcbiAgICBzZWxmLmxvY2FsU3RvcmFnZUF2YWlsYWJsZSAmJiBHbG9iYWwubG9jYWxTdG9yYWdlLmNsZWFyKCk7XG5cbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblxuICAgICAgLy8gcmVqZWN0IGFsbCBEQiBvcGVyYXRpb25zXG4gICAgICBzZWxmLnJlYWR5LnJlamVjdCgpO1xuICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuXG4gICAgICAvLyBMRUdBQ1k6IHJlbW92ZSB0aGlzXG4gICAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICB9XG5cbiAgICAgIHNlbGYudHJpZ2dlcigndHJ1bmNhdGVkJyk7XG4gICAgfSwgNTApO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxuICAncmVhZCc6IGZ1bmN0aW9uIChzdG9yZU5hbWUsIGpzb24pIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuXG4gICAgdmFyIHZhbDtcbiAgICB2YXIgbWV0YSA9IHNlbGYuc3RvcmVzW3N0b3JlTmFtZV07XG5cbiAgICBpZiAoc2VsZi5sb2NhbFN0b3JhZ2VBdmFpbGFibGUgJiYgbWV0YS5jcml0aWNhbCkge1xuICAgICAgdmFyIGlkID0ganNvblttZXRhLmtleVBhdGhdIHx8IGpzb24uaWQ7XG4gICAgICB2YWwgPSBHbG9iYWwubG9jYWxTdG9yYWdlW3N0b3JlTmFtZSArICdfJyArIGlkXTtcbiAgICAgIHZhbCAmJiAodmFsID0gU2FmZVBhcnNlLmpzb24odmFsKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdmFsID0gc2VsZi5jYWNoZVtzdG9yZU5hbWVdW2pzb24uaWRdO1xuICAgIH1cblxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWwpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgICAgfVxuICAgIH0sIDUwKTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG4gIH0sXG5cbiAgJ3F1ZXJ5JzogZnVuY3Rpb24gKHN0b3JlTmFtZSkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG4gICAgdmFyIHJlc3VsdHMgPSB0b0FycmF5KHNlbGYuY2FjaGVbc3RvcmVOYW1lXSk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnJlc29sdmUocmVzdWx0cykucHJvbWlzZSgpO1xuICB9LFxuXG4gICd1cGRhdGUnOiBmdW5jdGlvbiAoc3RvcmVOYW1lLCBqc29uKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIHZhciBtZXRhID0gc2VsZi5zdG9yZXNbc3RvcmVOYW1lXTtcblxuICAgIGlmIChzZWxmLmxvY2FsU3RvcmFnZUF2YWlsYWJsZSAmJiBtZXRhLmNyaXRpY2FsKSB7XG4gICAgICB2YXIgaWQgPSBqc29uW21ldGEua2V5UGF0aF0gfHwganNvbi5pZDtcbiAgICAgIEdsb2JhbC5sb2NhbFN0b3JhZ2Vbc3RvcmVOYW1lICsgJ18nICsgaWRdID0gSlNPTi5zdHJpbmdpZnkoanNvbik7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgc2VsZi5jYWNoZVtzdG9yZU5hbWVdW2pzb24uaWRdID0ganNvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucmVzb2x2ZSgpLnByb21pc2UoKTtcbiAgfSxcblxuICAnZGVzdHJveSc6IGZ1bmN0aW9uIChzdG9yZU5hbWUsIGpzb24pIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuICAgIGRlbGV0ZSBzZWxmLmNhY2hlW3N0b3JlTmFtZV1banNvbi5pZF07XG4gICAgcmV0dXJuIGRlZmVycmVkLnJlc29sdmUoKS5wcm9taXNlKCk7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1lbW9yeUJhY2tlbmQ7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjb3JlID0gcmVxdWlyZSgnd3VuZGVyYml0cy5jb3JlJyk7XG52YXIgV0JEZWZlcnJlZCA9IGNvcmUuV0JEZWZlcnJlZDtcbnZhciB3aGVuID0gY29yZS5saWIud2hlbjtcblxudmFyIEFic3RyYWN0QmFja2VuZCA9IHJlcXVpcmUoJy4vQWJzdHJhY3RCYWNrZW5kJyk7XG52YXIgcHJpbnRmID0gcmVxdWlyZSgnLi4vbGliL3ByaW50ZicpO1xudmFyIEZpZWxkVHlwZXMgPSByZXF1aXJlKCcuLi9saWIvRmllbGRUeXBlcycpO1xuXG52YXIgR2xvYmFsID0gcmVxdWlyZSgnLi4vbGliL2dsb2JhbCcpO1xudmFyIFNhZmVQYXJzZSA9IHJlcXVpcmUoJy4uL2xpYi9TYWZlUGFyc2UnKTtcblxudmFyIG9wZW5Db25uZWN0aW9uID0gR2xvYmFsLm9wZW5EYXRhYmFzZTtcbnZhciBlc2NhcGUgPSBHbG9iYWwuZXNjYXBlO1xudmFyIHVuZXNjYXBlID0gR2xvYmFsLnVuZXNjYXBlO1xuXG52YXIgU1FMID0ge1xuICAnY3JlYXRlVGFibGUnOiAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgPyAoPyBURVhUIFBSSU1BUlkgS0VZLCA/KScsXG4gICd0cnVuY2F0ZVRhYmxlJzogJ0RFTEVURSBGUk9NID8nLFxuICAnZHJvcFRhYmxlJzogJ0RST1AgVEFCTEUgSUYgRVhJU1RTID8nLFxuXG4gICdyZWFkJzogJ1NFTEVDVCAqIGZyb20gPyBXSEVSRSA/PVxcJz9cXCcgTElNSVQgMScsXG4gICdxdWVyeSc6ICdTRUxFQ1QgKiBmcm9tID8nLFxuICAndXBzZXJ0JzogJ0lOU0VSVCBPUiBSRVBMQUNFIElOVE8gPyAoPykgVkFMVUVTICg/KScsXG4gICdkZXN0cm95JzogJ0RFTEVURSBGUk9NID8gV0hFUkUgPz1cXCc/XFwnJ1xufTtcblxuLy8gV2UgbmVlZCB0byBtYXAgc2NoZW1hIHR5cGVzIHRvIHdlYnNxbCB0eXBlc1xudmFyIFRZUEVTID0geyAnZGVmYXVsdCc6ICdURVhUJyB9O1xuVFlQRVNbRmllbGRUeXBlcy5GbG9hdF0gPSAnUkVBTCc7XG5UWVBFU1tGaWVsZFR5cGVzLkludGVnZXJdID0gJ0lOVEVHRVInO1xuXG52YXIgV2ViU1FMQmFja2VuZCA9IEFic3RyYWN0QmFja2VuZC5leHRlbmQoe1xuXG4gICdkYlNpemUnOiAoNSAqIDEwMjQgKiAxMDI0KSxcblxuICAnb3BlbkRCJzogZnVuY3Rpb24gKG5hbWUsIHZlcnNpb24pIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgcmVhZHlEZWZlcnJlZCA9IHNlbGYucmVhZHk7XG5cbiAgICAvLyBpbiBjYXNlIHNhZmFyaSBpcyBicm9rZW4gYWZ0ZXIgYW4gdXBkYXRlXG4gICAgdmFyIGluaXRUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLm9wZW5GYWlsdXJlKCdFUlJfV1NfQ09OTkVDVF9USU1FT1VUJyk7XG4gICAgfSwgMjAwMCk7XG5cbiAgICByZWFkeURlZmVycmVkLmRvbmUoZnVuY3Rpb24gKCkge1xuICAgICAgY2xlYXJUaW1lb3V0KGluaXRUaW1lb3V0KTtcbiAgICB9KTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBTYWZhcmkgbmVlZHMgdGhlIERCIHRvIGluaXRpYWxpemVkIHdpdGggKipleGFjdGx5KiogNSBtYiBzdG9yYWdlXG4gICAgICB2YXIgZGIgPSBvcGVuQ29ubmVjdGlvbihuYW1lLCAnJywgbmFtZSwgc2VsZi5kYlNpemUpO1xuICAgICAgc2VsZi5kYiA9IGRiO1xuXG4gICAgICAvLyBXZWJTUUwgdmVyc2lvbnMgYXJlIHN0cmluZ3NcbiAgICAgIHZlcnNpb24gPSAnJyArIHZlcnNpb247XG5cbiAgICAgIC8vIGNoZWNrIGlmIHdlIG5lZWQgdG8gdXBncmFkZSB0aGUgc2NoZW1hXG4gICAgICBpZiAoZGIudmVyc2lvbiAhPT0gdmVyc2lvbikge1xuICAgICAgICBzZWxmLm9uVXBncmFkZU5lZWRlZCgpXG4gICAgICAgICAgLmRvbmUoc2VsZi5vcGVuU3VjY2Vzcywgc2VsZilcbiAgICAgICAgICAuZmFpbChzZWxmLm9wZW5GYWlsdXJlLCBzZWxmKTtcbiAgICAgIH1cbiAgICAgIC8vIHNjaGVtYSBjb3JyZWN0XG4gICAgICBlbHNlIHtcbiAgICAgICAgc2VsZi5vcGVuU3VjY2VzcygpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBzZWxmLm9wZW5GYWlsdXJlKCdFUlJfV1NfQ09OTkVDVF9GQUlMRUQnLCBlcnJvcik7XG4gICAgfVxuICB9LFxuXG4gICdleGVjdXRlJzogZnVuY3Rpb24gKHNxbCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIC8vIGNyZWF0ZSBhIHRyYW5zYWN0aW9uXG4gICAgc2VsZi5kYi50cmFuc2FjdGlvbihmdW5jdGlvbiAodHJhbnNhY3Rpb24pIHtcbiAgICAgIC8vIGV4ZWN1dGUgdGhlIHNxbFxuICAgICAgdHJhbnNhY3Rpb24uZXhlY3V0ZVNxbChzcWwsIFtdLCBmdW5jdGlvbiAodHgsIHJlc3VsdCkge1xuICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICB9LCBmdW5jdGlvbiAodHgsIGVycikge1xuICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxuICAncGFyc2VHZW5lcmljJzogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICByZXR1cm4gU2FmZVBhcnNlLmpzb24odW5lc2NhcGUoZGF0YS5qc29uKSk7XG4gIH0sXG5cbiAgJ3BvcHVsYXRlR2VuZXJpYyc6IGZ1bmN0aW9uIChrZXlzLCB2YWx1ZXMsIGpzb24pIHtcblxuICAgIGtleXMucHVzaCgnanNvbicpO1xuICAgIHZhbHVlcy5wdXNoKCdcXCcnICsgZXNjYXBlKEpTT04uc3RyaW5naWZ5KGpzb24pKSArICdcXCcnKTtcbiAgfSxcblxuICAncGFyc2VGaWVsZHMnOiBmdW5jdGlvbiAoZGF0YSwgZmllbGRzKSB7XG4gICAgdmFyIG9iaiA9IHtcbiAgICAgICdpZCc6IGRhdGEuaWRcbiAgICB9O1xuXG4gICAgdmFyIG5hbWUsIHR5cGUsIHZhbHVlLCBwYXJzZWQ7XG4gICAgZm9yIChuYW1lIGluIGZpZWxkcykge1xuICAgICAgdHlwZSA9IGZpZWxkc1tuYW1lXTtcbiAgICAgIHZhbHVlID0gZGF0YVtuYW1lXTtcblxuICAgICAgaWYgKGRhdGFbbmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAodHlwZSA9PT0gRmllbGRUeXBlcy5JbnRlZ2VyKSB7XG4gICAgICAgICAgcGFyc2VkID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICBpZiAoaXNOYU4odmFsdWUpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ2ZhaWxlZCB0byBwYXJzZSAlcyBhcyBJbnRlZ2VyJywgdmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZSA9IHBhcnNlZCB8fCAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGUgPT09IEZpZWxkVHlwZXMuRmxvYXQpIHtcbiAgICAgICAgICBwYXJzZWQgPSBwYXJzZUZsb2F0KHZhbHVlLCAxMCk7XG4gICAgICAgICAgaWYgKGlzTmFOKHZhbHVlKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdmYWlsZWQgdG8gcGFyc2UgJXMgYXMgRmxvYXQnLCB2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbHVlID0gcGFyc2VkIHx8IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG5cbiAgICAgICAgICAvLyBkb24ndCB1bmVzY2FwZSBudWxscyAmIHVuZGVmaW5lZHNcbiAgICAgICAgICB2YWx1ZSA9IHZhbHVlICYmIHVuZXNjYXBlKHZhbHVlKTtcblxuICAgICAgICAgIGlmICh0eXBlID09PSBGaWVsZFR5cGVzLkJvb2xlYW4pIHtcbiAgICAgICAgICAgIHZhbHVlID0gKHZhbHVlID09PSAndHJ1ZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIGlmICh0eXBlID09PSBGaWVsZFR5cGVzLkFycmF5KSB7XG4gICAgICAgICAgICB2YWx1ZSA9IFNhZmVQYXJzZS5qc29uKHZhbHVlKSB8fCBbXTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSBpZiAodHlwZSA9PT0gRmllbGRUeXBlcy5PYmplY3QpIHtcbiAgICAgICAgICAgIHZhbHVlID0gU2FmZVBhcnNlLmpzb24odmFsdWUpIHx8IHt9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PT0gJycpIHtcbiAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgb2JqW25hbWVdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iajtcbiAgfSxcblxuICAncG9wdWxhdGVGaWVsZHMnOiBmdW5jdGlvbiAoa2V5cywgdmFsdWVzLCBqc29uLCBmaWVsZHMsIGtleVBhdGgpIHtcblxuICAgIHZhciBuYW1lLCB0eXBlLCB2YWx1ZTtcbiAgICBmb3IgKG5hbWUgaW4gZmllbGRzKSB7XG5cbiAgICAgIHR5cGUgPSBmaWVsZHNbbmFtZV07XG4gICAgICB2YWx1ZSA9IGpzb25bbmFtZV07XG5cbiAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIG5hbWUgIT09IGtleVBhdGgpIHtcblxuICAgICAgICBpZiAodHlwZSA9PT0gRmllbGRUeXBlcy5GbG9hdCB8fCB0eXBlID09PSBGaWVsZFR5cGVzLkludGVnZXIpIHtcbiAgICAgICAgICB2YWx1ZSA9ICghIXZhbHVlICYmICFpc05hTih2YWx1ZSkpID8gdmFsdWUgOiAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGUgPT09IEZpZWxkVHlwZXMuQXJyYXkgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICB2YWx1ZSA9ICdcXCcnICsgZXNjYXBlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgKyAnXFwnJztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlID09PSBGaWVsZFR5cGVzLk9iamVjdCkge1xuICAgICAgICAgIHZhbHVlID0gJ1xcJycgKyBlc2NhcGUoSlNPTi5zdHJpbmdpZnkodmFsdWUpKSArICdcXCcnO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIHZhbHVlID0gKHZhbHVlICE9PSBudWxsKSA/ICdcXCcnICsgZXNjYXBlKHZhbHVlKSArICdcXCcnIDogJ05VTEwnO1xuICAgICAgICB9XG5cbiAgICAgICAga2V5cy5wdXNoKCdcIicgKyBuYW1lICsgJ1wiJyk7XG4gICAgICAgIHZhbHVlcy5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgJ3RvQXJyYXknOiBmdW5jdGlvbiAocm93cywgZmllbGRzKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGNvdW50ID0gcm93cy5sZW5ndGg7XG4gICAgdmFyIHJldHVyblJvd3MgPSBuZXcgQXJyYXkoY291bnQpO1xuICAgIHZhciBwYXJzZSA9IHNlbGZbZmllbGRzID8gJ3BhcnNlRmllbGRzJyA6ICdwYXJzZUdlbmVyaWMnXTtcblxuICAgIHZhciBkYXRhO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBjb3VudDsgaW5kZXgrKykge1xuICAgICAgZGF0YSA9IHJvd3MuaXRlbShpbmRleCk7XG4gICAgICByZXR1cm5Sb3dzW2luZGV4XSA9IHBhcnNlLmNhbGwoc2VsZiwgZGF0YSwgZmllbGRzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmV0dXJuUm93cztcbiAgfSxcblxuICAnb25VcGdyYWRlTmVlZGVkJzogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYudHJpZ2dlcigndXBncmFkaW5nJyk7XG4gICAgdmFyIHN0b3JlQ3JlYXRpb25EZWZlcnJlZHMgPSBzZWxmLm1hcFN0b3JlcyhzZWxmLmNyZWF0ZVN0b3JlKTtcbiAgICByZXR1cm4gd2hlbihzdG9yZUNyZWF0aW9uRGVmZXJyZWRzKS5wcm9taXNlKCk7XG4gIH0sXG5cbiAgJ2NyZWF0ZVN0b3JlJzogZnVuY3Rpb24gKHN0b3JlTmFtZSwgc3RvcmVJbmZvKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuICAgIHZhciBrZXlQYXRoID0gc3RvcmVJbmZvLmtleVBhdGggfHwgc2VsZi5kZWZhdWx0S2V5UGF0aDtcbiAgICB2YXIgZmllbGRzID0gc3RvcmVJbmZvLmZpZWxkcztcblxuICAgIHZhciBzcWwgPSBTUUwuY3JlYXRlVGFibGU7XG4gICAgaWYgKCFmaWVsZHMpIHtcbiAgICAgIHNxbCA9IHByaW50ZihzcWwsIHN0b3JlTmFtZSwga2V5UGF0aCwgJ2pzb24gVEVYVCcpO1xuICAgIH1cbiAgICBlbHNlIHtcblxuICAgICAgaWYgKGtleVBhdGggPT09ICdpZCcpIHtcbiAgICAgICAgZGVsZXRlIGZpZWxkcy5pZDtcbiAgICAgIH1cblxuICAgICAgLy8gY29udmVydCBvdXIgRmllbGQgdHlwZXMgdG8gV2ViU1FMIHR5cGVzXG4gICAgICB2YXIgY29sdW1ucyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICAgIHJldHVybiAnXCInICsgdHlwZSArICdcIiAnICsgKFRZUEVTW2ZpZWxkc1t0eXBlXV0gfHwgVFlQRVMuZGVmYXVsdCk7XG4gICAgICB9KTtcblxuICAgICAgc3FsID0gcHJpbnRmKHNxbCwgc3RvcmVOYW1lLCBrZXlQYXRoLCBjb2x1bW5zLmpvaW4oJywgJykpO1xuICAgIH1cblxuICAgIHNlbGYuZXhlY3V0ZShzcWwpXG4gICAgICAuZG9uZShkZWZlcnJlZC5yZXNvbHZlLCBkZWZlcnJlZClcbiAgICAgIC5mYWlsKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICBzZWxmLnRyaWdnZXIoJ2Vycm9yJywgJ0VSUl9XU19TVE9SRV9DUkVBVElPTl9GQUlMRUQnLCBlcnJvciwgc3RvcmVOYW1lKTtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KCk7XG4gICAgICB9KTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG4gIH0sXG5cbiAgJ2NsZWFyU3RvcmUnOiBmdW5jdGlvbiAoc3RvcmVOYW1lKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIHZhciBzcWwgPSBwcmludGYoU1FMLnRydW5jYXRlVGFibGUsIHN0b3JlTmFtZSk7XG4gICAgc2VsZi5leGVjdXRlKHNxbClcbiAgICAgIC5kb25lKGRlZmVycmVkLnJlc29sdmUsIGRlZmVycmVkKVxuICAgICAgLmZhaWwoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCAnRVJSX1dTX0NMRUFSX0ZBSUxFRCcsIGVycm9yLCBzdG9yZU5hbWUpO1xuICAgICAgICBkZWZlcnJlZC5yZWplY3QoKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxuICAncmVhZCc6IGZ1bmN0aW9uIChzdG9yZU5hbWUsIGpzb24pIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICB2YXIgc3RvcmVJbmZvID0gc2VsZi5zdG9yZXNbc3RvcmVOYW1lXTtcbiAgICB2YXIgZmllbGRzID0gc3RvcmVJbmZvLmZpZWxkcztcblxuICAgIHZhciBrZXlQYXRoID0gc3RvcmVJbmZvLmtleVBhdGggfHwgc2VsZi5kZWZhdWx0S2V5UGF0aDtcbiAgICB2YXIgaWQgPSBqc29uW2tleVBhdGhdIHx8IGpzb24uaWQ7XG5cbiAgICB2YXIgc3FsID0gcHJpbnRmKFNRTC5yZWFkLCBzdG9yZU5hbWUsIGtleVBhdGgsIGlkKTtcbiAgICBzZWxmLmV4ZWN1dGUoc3FsKVxuICAgICAgLmRvbmUoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICBpZiAocmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsICdFUlJfV1NfT0JKRUNUX05PVF9GT1VORCcsIG51bGwsIHN0b3JlTmFtZSwganNvbik7XG4gICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gc2VsZi50b0FycmF5KHJlc3VsdC5yb3dzLCBmaWVsZHMpO1xuICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZWxlbWVudHNbMF0pO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmZhaWwoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCAnRVJSX1dTX1JFQURfRkFJTEVEJywgZXJyb3IsIHN0b3JlTmFtZSwganNvbik7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICdxdWVyeSc6IGZ1bmN0aW9uIChzdG9yZU5hbWUpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuXG4gICAgdmFyIHN0b3JlSW5mbyA9IHNlbGYuc3RvcmVzW3N0b3JlTmFtZV07XG4gICAgdmFyIGZpZWxkcyA9IHN0b3JlSW5mbyAmJiBzdG9yZUluZm8uZmllbGRzO1xuXG4gICAgdmFyIHNxbCA9IHByaW50ZihTUUwucXVlcnksIHN0b3JlTmFtZSk7XG4gICAgc2VsZi5leGVjdXRlKHNxbClcbiAgICAgIC5kb25lKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gc2VsZi50b0FycmF5KHJlc3VsdC5yb3dzLCBmaWVsZHMpO1xuICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKGVsZW1lbnRzKTtcbiAgICAgIH0pXG4gICAgICAuZmFpbChmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsICdFUlJfV1NfUVVFUllfRkFJTEVEJywgZXJyb3IsIHN0b3JlTmFtZSk7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICd1cGRhdGUnOiBmdW5jdGlvbiAoc3RvcmVOYW1lLCBqc29uKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIHZhciBzdG9yZUluZm8gPSBzZWxmLnN0b3Jlc1tzdG9yZU5hbWVdO1xuICAgIHZhciBmaWVsZHMgPSBzdG9yZUluZm8uZmllbGRzO1xuXG4gICAgdmFyIGtleVBhdGggPSBzdG9yZUluZm8ua2V5UGF0aCB8fCBzZWxmLmRlZmF1bHRLZXlQYXRoO1xuICAgIHZhciBpZCA9IGpzb25ba2V5UGF0aF0gfHwganNvbi5pZDtcblxuICAgIHZhciBrZXlzID0gW2tleVBhdGhdO1xuICAgIHZhciB2YWx1ZXMgPSBbJ1xcJycgKyBpZCArICdcXCcnXTtcblxuICAgIHZhciBwb3B1bGF0ZSA9IHNlbGZbZmllbGRzID8gJ3BvcHVsYXRlRmllbGRzJzogJ3BvcHVsYXRlR2VuZXJpYyddO1xuICAgIHBvcHVsYXRlLmNhbGwoc2VsZiwga2V5cywgdmFsdWVzLCBqc29uLCBmaWVsZHMsIGtleVBhdGgpO1xuXG4gICAgdmFyIHNxbCA9IHByaW50ZihTUUwudXBzZXJ0LCBzdG9yZU5hbWUsIGtleXMsIHZhbHVlcyk7XG4gICAgdHJ5IHtcblxuICAgICAgc2VsZi5leGVjdXRlKHNxbClcbiAgICAgICAgLmRvbmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmZhaWwoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsICdFUlJfV1NfVVBEQVRFX0ZBSUxFRCcsXG4gICAgICAgICAgICAgIGVycm9yLCBzdG9yZU5hbWUsIGpzb24pO1xuICAgICAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICBzZWxmLnRyaWdnZXIoJ2Vycm9yJywgJ0VSUl9XU19VUERBVEVfRkFJTEVEJyxcbiAgICAgICAgICBlcnJvciwgc3RvcmVOYW1lLCBqc29uKTtcbiAgICAgIGRlZmVycmVkLnJlamVjdCgpO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG4gIH0sXG5cbiAgJ2Rlc3Ryb3knOiBmdW5jdGlvbiAoc3RvcmVOYW1lLCBqc29uKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIHZhciBzdG9yZUluZm8gPSBzZWxmLnN0b3Jlc1tzdG9yZU5hbWVdO1xuICAgIHZhciBrZXlQYXRoID0gc3RvcmVJbmZvLmtleVBhdGggfHwgc2VsZi5kZWZhdWx0S2V5UGF0aDtcbiAgICB2YXIgaWQgPSBqc29uW2tleVBhdGhdIHx8IGpzb24uaWQ7XG5cbiAgICB2YXIgc3FsID0gcHJpbnRmKFNRTC5kZXN0cm95LCBzdG9yZU5hbWUsIGtleVBhdGgsIGlkKTtcbiAgICBzZWxmLmV4ZWN1dGUoc3FsKVxuICAgICAgLmRvbmUoZnVuY3Rpb24gKCkge1xuICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmZhaWwoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCAnRVJSX1dTX0RFU1RST1lfRkFJTEVEJyxcbiAgICAgICAgICAgIGVycm9yLCBzdG9yZU5hbWUsIGpzb24pO1xuICAgICAgICBkZWZlcnJlZC5yZWplY3QoKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxuICAnbnVrZSc6IGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBjb25zb2xlLndhcm4oJ2NhbnQgZGVsZXRlIHdlYnNxbCBkYXRhYmFzZScpO1xuICAgIHJldHVybiBzZWxmLnRydW5jYXRlKCk7XG4gIH1cblxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2ViU1FMQmFja2VuZDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNvcmUgPSByZXF1aXJlKCd3dW5kZXJiaXRzLmNvcmUnKTtcbnZhciBXQkV2ZW50RW1pdHRlciA9IGNvcmUuV0JFdmVudEVtaXR0ZXI7XG52YXIgV0JEZWZlcnJlZCA9IGNvcmUuV0JEZWZlcnJlZDtcbnZhciBhc3NlcnQgPSBjb3JlLmxpYi5hc3NlcnQ7XG52YXIgZXh0ZW5kID0gY29yZS5saWIuZXh0ZW5kO1xudmFyIGNsb25lID0gY29yZS5saWIuY2xvbmU7XG5cbnZhciBNZW1vcnlCYWNrZW5kID0gcmVxdWlyZSgnLi9CYWNrZW5kcy9NZW1vcnlCYWNrZW5kJyk7XG52YXIgV2ViU1FMQmFja2VuZCA9IHJlcXVpcmUoJy4vQmFja2VuZHMvV2ViU1FMQmFja2VuZCcpO1xudmFyIEluZGV4ZWREQkJhY2tlbmQgPSByZXF1aXJlKCcuL0JhY2tlbmRzL0luZGV4ZWREQkJhY2tlbmQnKTtcblxudmFyIEdsb2JhbCA9IHJlcXVpcmUoJy4vbGliL2dsb2JhbCcpO1xuXG52YXIgY2hyb21lID0gR2xvYmFsLmNocm9tZTtcbnZhciBpc0Nocm9tZUFwcCA9ICEhKGNocm9tZSAmJiBjaHJvbWUuYXBwICYmIGNocm9tZS5hcHAucnVudGltZSk7XG52YXIgbG9jYWxTdG9yYWdlQXZhaWxhYmxlID0gdHJ1ZTtcblxuLy8gdGVzdHMgZm9yIHN0b3JhZ2UgZW5naW5lIGF2YWlsYWJpbGl0eVxudmFyIGJhY2tlbmRUZXN0cyA9IHtcbiAgJ2luZGV4ZWRkYic6IFtcbiAgICAnaW5kZXhlZERCJyxcbiAgICAnd2Via2l0SW5kZXhlZERCJyxcbiAgICAnbW96SW5kZXhlZERCJyxcbiAgICAnbXNJbmRleGVkREInXG4gIF0sXG4gICd3ZWJzcWwnOiBbXG4gICAgJ29wZW5EYXRhYmFzZSdcbiAgXVxufTtcblxudmFyIGJhY2tlbmRzID0ge1xuICAnbWVtb3J5JzogTWVtb3J5QmFja2VuZCxcbiAgJ3dlYnNxbCc6IFdlYlNRTEJhY2tlbmQsXG4gICdpbmRleGVkZGInOiBJbmRleGVkREJCYWNrZW5kXG59O1xuXG52YXIgV0JEYXRhYmFzZSA9IFdCRXZlbnRFbWl0dGVyLmV4dGVuZCh7XG5cbiAgJ2NydWQnOiB7fSxcblxuICAnaW5pdGlhbGl6ZSc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgc2VsZi5yZWFkeSA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICBhc3NlcnQub2JqZWN0KG9wdGlvbnMuc2NoZW1hKTtcblxuICAgIHZhciBzY2hlbWEgPSBvcHRpb25zLnNjaGVtYTtcbiAgICBzZWxmLnN0b3JlcyA9IHNjaGVtYS5zdG9yZXM7XG5cbiAgICB2YXIgZGF0YWJhc2UgPSBzY2hlbWEuZGF0YWJhc2U7XG4gICAgc2VsZi5uYW1lID0gZGF0YWJhc2UubmFtZTtcblxuICAgIC8vIG1ha2UgdmVyc2lvbiBjaGFuZ2Ugd2l0aCBzY2hlbWFcbiAgICB2YXIgdmVyc2lvbiA9IChPYmplY3Qua2V5cyhzZWxmLnN0b3JlcykubGVuZ3RoICogMTBlNik7XG4gICAgdmVyc2lvbiArPSAocGFyc2VJbnQoZGF0YWJhc2UudmVyc2lvbiwgMTApIHx8IDEpO1xuICAgIHNlbGYudmVyc2lvbiA9IHZlcnNpb247XG4gIH0sXG5cbiAgJ2luaXQnOiBmdW5jdGlvbiAoYmFja2VuZE5hbWUpIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIC8vIEluaXRpYWxpemUgb25seSBvbmNlXG4gICAgdmFyIHJlYWR5ID0gc2VsZi5yZWFkeTtcbiAgICBpZiAocmVhZHkuc3RhdGUoKSA9PT0gJ3Jlc29sdmVkJykge1xuICAgICAgcmV0dXJuIHJlYWR5LnByb21pc2UoKTtcbiAgICB9XG5cbiAgICBiYWNrZW5kTmFtZSA9IHNlbGYuZmluZEF2YWlsYWJsZUJhY2tlbmQoYmFja2VuZE5hbWUpO1xuICAgIHNlbGYuYmFja2VuZE5hbWUgPSBiYWNrZW5kTmFtZTtcblxuICAgIHZhciBsb2dnZXJzID0gc2VsZi5pbml0TG9nZ2VyKGJhY2tlbmROYW1lLnRvVXBwZXJDYXNlKCkpO1xuICAgIHZhciBzdG9yZXMgPSBzZWxmLnN0b3JlcztcblxuICAgIC8vIHRyeSB0byBpbml0IHRoZSBhdmFpbGFibGUgYmFja2VuZFxuICAgIHNlbGYuaW5pdEJhY2tlbmQoYmFja2VuZE5hbWUsIHtcbiAgICAgICduYW1lJzogc2VsZi5uYW1lLFxuICAgICAgJ3ZlcnNpb24nOiBzZWxmLnZlcnNpb24sXG4gICAgICAnc3RvcmVzJzogc3RvcmVzLFxuICAgICAgJ2luZm9Mb2cnOiBsb2dnZXJzLmluZm8sXG4gICAgICAnZXJyb3JMb2cnOiBsb2dnZXJzLmVycm9yLFxuICAgICAgJ2xvY2FsU3RvcmFnZUF2YWlsYWJsZSc6IGxvY2FsU3RvcmFnZUF2YWlsYWJsZVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlYWR5LnByb21pc2UoKTtcbiAgfSxcblxuICAnY3VycmVudEJhY2tlbmQnOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBzZWxmLmJhY2tlbmROYW1lO1xuICB9LFxuXG4gIC8vIERlZmluZSB0aGUgbG9nZ2Vyc1xuICAnaW5pdExvZ2dlcic6IGZ1bmN0aW9uIChsYWJlbCkge1xuICAgIHJldHVybiB7XG4gICAgICAnaW5mbyc6IGNvbnNvbGUuaW5mby5iaW5kKGNvbnNvbGUsICdbJyArIGxhYmVsICsgJ10nKSxcbiAgICAgICdlcnJvcic6IGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlLCAnWycgKyBsYWJlbCArICddJylcbiAgICB9O1xuICB9LFxuXG4gICdpbml0QmFja2VuZCc6IGZ1bmN0aW9uIChiYWNrZW5kTmFtZSwgb3B0aW9ucykge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBCYWNrZW5kQ2xhc3MgPSBiYWNrZW5kc1tiYWNrZW5kTmFtZV07XG5cbiAgICB2YXIgYmFja2VuZCA9IHNlbGYuYmFja2VuZCA9IG5ldyBCYWNrZW5kQ2xhc3MoKTtcbiAgICBzZWxmLm9wdGlvbnMgPSBvcHRpb25zO1xuXG4gICAgLy8gcGlwZSBiYWNrZW5kIGVycm9yc1xuICAgIGJhY2tlbmQub24oJ2Vycm9yJywgZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi50cmlnZ2VyLmFwcGx5KHNlbGYsIGFyZ3VtZW50cyk7XG4gICAgfSk7XG5cbiAgICBiYWNrZW5kLmNvbm5lY3Qob3B0aW9ucylcbiAgICAgIC5kb25lKHNlbGYuaW5pdFN1Y2Nlc3MsIHNlbGYpXG4gICAgICAuZmFpbChzZWxmLmluaXRGYWlsdXJlLCBzZWxmKTtcbiAgfSxcblxuICAnaW5pdFN1Y2Nlc3MnOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGJhY2tlbmQgPSBzZWxmLmJhY2tlbmQ7XG5cbiAgICB2YXIgY3J1ZE9wcyA9IHtcbiAgICAgICdjcmVhdGUnOiBiYWNrZW5kLnVwZGF0ZSxcbiAgICAgICdyZWFkJzogYmFja2VuZC5yZWFkLFxuICAgICAgJ3VwZGF0ZSc6IGJhY2tlbmQudXBkYXRlLFxuICAgICAgJ2RlbGV0ZSc6IGJhY2tlbmQuZGVzdHJveSxcbiAgICAgICdxdWVyeSc6IGJhY2tlbmQucXVlcnlcbiAgICB9O1xuXG4gICAgLy8gYmluZCBjcnVkIG9wZXJhdGlvbnMgdG8gdGhlIGJhY2tlbmQgZm9yIGNvbnRleHRcbiAgICAvLyBhbHNvIGJsb2NrIGFsbCBEQiBvcGVyYXRpb25zIHRpbGwgZGIgaXMgcmVhZHlcbiAgICBPYmplY3Qua2V5cyhjcnVkT3BzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciBmbiA9IGNydWRPcHNba2V5XTtcbiAgICAgIGNydWRPcHNba2V5XSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG4gICAgICAgIHZhciByZWFkeSA9IGJhY2tlbmQucmVhZHk7XG4gICAgICAgIHJlYWR5LmRvbmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGZuLmFwcGx5KGJhY2tlbmQsIGFyZ3MpXG4gICAgICAgICAgICAuZG9uZShkZWZlcnJlZC5yZXNvbHZlLCBkZWZlcnJlZClcbiAgICAgICAgICAgIC5mYWlsKGRlZmVycmVkLnJlamVjdCwgZGVmZXJyZWQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVhZHkuZmFpbChkZWZlcnJlZC5yZWplY3QsIGRlZmVycmVkKTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBleHBvcnQgY3J1ZCBmdW5jdGlvbnNcbiAgICBleHRlbmQoc2VsZi5jcnVkLCBjcnVkT3BzKTtcblxuICAgIC8vIGFubm91bmNlIG9uY2UgYmFja2VuZCBpcyByZWFkeVxuICAgIHNlbGYucmVhZHkucmVzb2x2ZSgpO1xuICAgIHNlbGYucHVibGlzaCgncmVhZHknLCB7XG4gICAgICAnc3RvcmVzJzogc2VsZi5zdG9yZXNcbiAgICB9KTtcbiAgfSxcblxuICAnaW5pdEZhaWx1cmUnOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgLy8gYW5ub3VuY2UgZGIgZmFpbHVyZVxuICAgIHNlbGYucmVhZHkucmVqZWN0KCk7XG4gIH0sXG5cbiAgLy8gVGVzdCBmb3IgYXZhaWxhYmxlIHN0b3JhZ2UtYmFja2VuZHNcbiAgJ2ZpbmRBdmFpbGFibGVCYWNrZW5kJzogZnVuY3Rpb24gKHJlcXVlc3RlZEJhY2tlbmQpIHtcblxuICAgIC8vIHdheSB0byBmb3JjZSBhIHNwZWNpZmljIGJhY2tlbmQgb24gaW5pdCAodXNlZCBieSB0ZXN0cylcbiAgICBpZiAocmVxdWVzdGVkQmFja2VuZCBpbiBiYWNrZW5kVGVzdHMpIHtcbiAgICAgIHJldHVybiByZXF1ZXN0ZWRCYWNrZW5kO1xuICAgIH1cbiAgICBlbHNlIGlmIChjaHJvbWUgJiYgY2hyb21lLnN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiAnaW5kZXhlZGRiJztcbiAgICB9XG5cbiAgICAvLyBJRiB0aGlzIGNoZWNrIGhhcyBiZWVuIHJ1biBwcmV2aW91c2x5LCBsb2FkIGZyb20gbG9jYWxTdG9yYWdlXG4gICAgLy8gQnV0LCBkb24ndCBicmVhayB0aGUgYXBwIGlmIGxvY2FsIHN0b3JhZ2UgaXMgbm90IGF2YWlsYWJsZVxuICAgIC8vIChkaXNhYmxlZCBieSB0aGUgdXNlcikhXG4gICAgdHJ5IHtcbiAgICAgIC8vIHRocm93cyBleGNlcHRpb24gaW4gY2hyb21lIHdoZW4gY29va2llcyBhcmUgZGlzYWJsZWRcbiAgICAgIHZhciBhdmFpbGFibGVCYWNrZW5kID0gR2xvYmFsLmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdhdmFpbGFibGVCYWNrZW5kJyk7XG4gICAgICBpZiAoYXZhaWxhYmxlQmFja2VuZCBpbiBiYWNrZW5kVGVzdHMpIHtcbiAgICAgICAgcmV0dXJuIGF2YWlsYWJsZUJhY2tlbmQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAvLyBJZiBsb2NhbFN0b3JhZ2UgbG9va3VwIGZhaWxzLCB3ZSBwcm9iYWJseSBoYXZlIG5vIHN0b3JhZ2UgYXQgYWxsXG4gICAgICAvLyBVc2UgbWVtb3J5XG4gICAgICBsb2NhbFN0b3JhZ2VBdmFpbGFibGUgPSBmYWxzZTtcbiAgICAgIHJldHVybiAnbWVtb3J5JztcbiAgICAgIC8vZG9jdW1lbnQud3JpdGUoJ0hUTUw1IGxvY2FsIHN0b3JhZ2UgJyArXG4gICAgICAvLyAgJyhjb250cm9sbGVkIGJ5IHlvdXIgY29va2llIHNldHRpbmdzKSAnICtcbiAgICAgIC8vICAnaXMgcmVxdWlyZWQgaW4gb3JkZXIgdXNlIHd1bmRlcmxpc3QuJyk7XG4gICAgfVxuXG4gICAgLy8gVGVzdCBmb3IgYXZhaWxhYmxlIHN0b3JhZ2Ugb3B0aW9ucywgYnV0IHVzZSBtZW1vcnkgYmFja2VuZCBmb3IgdGVzdHNcbiAgICB2YXIgYXZhaWxhYmxlO1xuICAgIGZvciAodmFyIG5hbWUgaW4gYmFja2VuZFRlc3RzKSB7XG4gICAgICB2YXIgdGVzdHMgPSBjbG9uZShiYWNrZW5kVGVzdHNbbmFtZV0pO1xuICAgICAgd2hpbGUgKHRlc3RzLmxlbmd0aCAmJiAhYXZhaWxhYmxlKSB7XG4gICAgICAgIGlmICghIUdsb2JhbFt0ZXN0cy5zaGlmdCgpXSkge1xuICAgICAgICAgIGF2YWlsYWJsZSA9IG5hbWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBub25lLWF2YWlsYWJsZSwgdXNlIGluLW1lbW9yeSBhcyBkZWZhdWx0XG4gICAgcmV0dXJuIGF2YWlsYWJsZSB8fCAnbWVtb3J5JztcbiAgfSxcblxuICAvLyBEZWZpbmUgZ2V0QWxsIGZvciB0aGUgYXBwIHRvIGxvYWQgYWxsIGRhdGEgaW4gdGhlIGJlZ2lubmluZ1xuICAnZ2V0QWxsJzogZnVuY3Rpb24gKHN0b3JlTmFtZSwgY2FsbGJhY2spIHtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLnJlYWR5LmRvbmUoZnVuY3Rpb24gKCkge1xuXG4gICAgICB2YXIgcmVxdWVzdCA9IHNlbGYuYmFja2VuZC5xdWVyeShzdG9yZU5hbWUpO1xuICAgICAgcmVxdWVzdC5kb25lKGNhbGxiYWNrKTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBFbXB0eSB0aGUgZGF0YWJhc2UsIGJ1dCBkb24ndCBkZXN0cm95IHRoZSBzdHJ1Y3R1cmVcbiAgJ3RydW5jYXRlJzogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5yZWFkeS5kb25lKGZ1bmN0aW9uICgpIHtcblxuICAgICAgLy8gY2xlYXIgb3V0IGxvY2Fsc3RvcmFnZSBhcyB3ZWxsIChpbiBjYXNlIGFueXRoaW5nIGV2ZXIgd2FzIGxlZnQgdGhlcmUpXG4gICAgICBpZiAoc2VsZi5iYWNrZW5kTmFtZSAhPT0gJ21lbW9yeScgJiYgIWlzQ2hyb21lQXBwKSB7XG4gICAgICAgIGxvY2FsU3RvcmFnZUF2YWlsYWJsZSAmJiBHbG9iYWwubG9jYWxTdG9yYWdlLmNsZWFyKCk7XG4gICAgICB9XG5cbiAgICAgIHNlbGYuYmFja2VuZC50cnVuY2F0ZSgpLnRoZW4oY2FsbGJhY2spO1xuICAgIH0pO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXQkRhdGFiYXNlO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgR2xvYmFsID0gcmVxdWlyZSgnLi9saWIvZ2xvYmFsJyk7XG52YXIgY2hyb21lID0gR2xvYmFsLmNocm9tZTtcbnZhciBpc0Nocm9tZUFwcCA9IGNocm9tZSAmJiBjaHJvbWUuc3RvcmFnZTtcblxudmFyIGxvY2FsU3RvcmFnZUNsYXNzO1xuaWYgKGlzQ2hyb21lQXBwKSB7XG4gIGxvY2FsU3RvcmFnZUNsYXNzID0gcmVxdWlyZSgnLi9sb2NhbFN0b3JhZ2UvV0JDaHJvbWVMb2NhbFN0b3JhZ2UnKTtcbn0gZWxzZSB7XG4gIGxvY2FsU3RvcmFnZUNsYXNzID0gcmVxdWlyZSgnLi9sb2NhbFN0b3JhZ2UvV0JCcm93c2VyTG9jYWxTdG9yYWdlJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbG9jYWxTdG9yYWdlQ2xhc3M7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjb3JlID0gcmVxdWlyZSgnd3VuZGVyYml0cy5jb3JlJyk7XG52YXIgV0JTaW5nbGV0b24gPSBjb3JlLldCU2luZ2xldG9uO1xudmFyIGV4dGVuZCA9IGNvcmUubGliLmV4dGVuZDtcblxudmFyIEZpZWxkVHlwZXMgPSByZXF1aXJlKCcuL2xpYi9GaWVsZFR5cGVzJyk7XG5cbnZhciBCYXNlU2NoZW1hID0gV0JTaW5nbGV0b24uZXh0ZW5kKHtcbiAgJ0ZpZWxkVHlwZXMnOiBGaWVsZFR5cGVzLFxuICAnZmllbGRzJzoge31cbn0pO1xuXG52YXIgU3BlY2lhbEZpZWxkVHlwZXMgPSB7fTtcbk9iamVjdC5rZXlzKEZpZWxkVHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgU3BlY2lhbEZpZWxkVHlwZXNbdHlwZS50b0xvd2VyQ2FzZSgpICsgJ3MnXSA9IEZpZWxkVHlwZXNbdHlwZV07XG59KTtcblxuZnVuY3Rpb24gQ3VzdG9tRXh0ZW5kIChwcm9wZXJ0aWVzKSB7XG5cbiAgLy8gZXh0cmFjdCBmaWVsZHMsIHRvIGJlIG1lcmdlZCBsYXRlclxuICB2YXIgZmllbGRzID0gcHJvcGVydGllcy5maWVsZHM7XG4gIGRlbGV0ZSBwcm9wZXJ0aWVzLmZpZWxkcztcblxuICAvLyBleHRlbmQgdGhlIHNjaGVtYVxuICB2YXIgc2NoZW1hID0gV0JTaW5nbGV0b24uZXh0ZW5kLmNhbGwodGhpcywgcHJvcGVydGllcyk7XG4gIHNjaGVtYS5leHRlbmQgPSBDdXN0b21FeHRlbmQ7XG5cbiAgLy8gdHJhbnNsYXRlIHRoZSBhbHRlcm5hdGl2ZSBmb3JtYXQgc2NoZW1hXG4gIHZhciBrZXksIHZhbCwgdHlwZTtcbiAgZm9yIChrZXkgaW4gZmllbGRzKSB7XG4gICAgdmFsID0gZmllbGRzW2tleV07XG4gICAgdHlwZSA9IFNwZWNpYWxGaWVsZFR5cGVzW2tleV07XG4gICAgaWYgKHR5cGUgJiYgQXJyYXkuaXNBcnJheSh2YWwpKSB7XG4gICAgICB3aGlsZSh2YWwubGVuZ3RoKSB7XG4gICAgICAgIGZpZWxkc1t2YWwuc2hpZnQoKV0gPSB0eXBlO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGZpZWxkc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIC8vIG1lcmdlIGZpZWxkcyB3aXRoIHRoZSBwYXJlbnRcbiAgc2NoZW1hLmZpZWxkcyA9IGV4dGVuZCh7fSwgc2NoZW1hLmZpZWxkcywgZmllbGRzKTtcbiAgcmV0dXJuIHNjaGVtYTtcbn1cblxuQmFzZVNjaGVtYS5leHRlbmQgPSBDdXN0b21FeHRlbmQ7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFzZVNjaGVtYTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICdCYWNrYm9uZURCU3luYyc6IHJlcXVpcmUoJy4vQmFja2JvbmVEQlN5bmMnKSxcbiAgJ1dCRGF0YWJhc2UnOiByZXF1aXJlKCcuL1dCRGF0YWJhc2UnKSxcbiAgJ1dCTG9jYWxTdG9yYWdlJzogcmVxdWlyZSgnLi9XQkxvY2FsU3RvcmFnZScpLFxuICAnV0JTY2hlbWEnOiByZXF1aXJlKCcuL1dCU2NoZW1hJylcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgJ0FycmF5JzogJ0FSUkFZJyxcbiAgJ0Jvb2xlYW4nOiAnQk9PTEVBTicsXG4gICdEYXRlVGltZSc6ICdEQVRFVElNRScsXG4gICdGbG9hdCc6ICdGTE9BVCcsXG4gICdJbnRlZ2VyJzogJ0lOVEVHRVInLFxuICAnT2JqZWN0JzogJ09CSkVDVCcsXG4gICdUZXh0JzogJ1RFWFQnXG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNvcmUgPSByZXF1aXJlKCd3dW5kZXJiaXRzLmNvcmUnKTtcbnZhciBXQlNpbmdsZXRvbiA9IGNvcmUuV0JTaW5nbGV0b247XG5cbmZ1bmN0aW9uIHBhcnNlIChqc29uU3RyaW5nKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoanNvblN0cmluZyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oJ1VuYWJsZSB0byBwYXJzZSBcIicgKyBqc29uU3RyaW5nICsgJ1wiJyk7XG4gIH1cbiAgcmV0dXJuO1xufVxuXG52YXIgU2FmZVBhcnNlID0gV0JTaW5nbGV0b24uZXh0ZW5kKHtcbiAgJ2pzb24nOiBwYXJzZVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2FmZVBhcnNlO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiByZXBsYWNlciAoKSB7XG4gIHJldHVybiAoTWF0aC5yYW5kb20oKSAqIDE2IHwgMCkudG9TdHJpbmcoMTYpO1xufVxuXG4vLyBBdXRvLWdlbmVyYXRlIElEcyBmb3IgbmV3IG9iamVjdHNcbmZ1bmN0aW9uIGF1dG9JRCAoKSB7XG4gIHJldHVybiAnbHcnICsgKG5ldyBBcnJheSgzMSkpLmpvaW4oJ3gnKS5yZXBsYWNlKC94L2csIHJlcGxhY2VyKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhdXRvSUQ7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gd2luZG93O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBHZW5lcmF0ZSBTUUxzLCBXZWJTUUwncyBmb3JtYXR0ZXIgYmxvd3NcbmZ1bmN0aW9uIHByaW50ZiAodGV4dCkge1xuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvXFw/L2csIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdmFsdWUgPSBhcmdzW2krK107XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICByZXR1cm4gdmFsdWUuam9pbignLCAnKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBwcmludGY7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjb3JlID0gcmVxdWlyZSgnd3VuZGVyYml0cy5jb3JlJyk7XG52YXIgV0JDbGFzcyA9IGNvcmUuV0JDbGFzcztcbnZhciBXQkRlZmVycmVkID0gY29yZS5XQkRlZmVycmVkO1xuXG52YXIgR2xvYmFsID0gcmVxdWlyZSgnLi4vbGliL2dsb2JhbCcpO1xuXG52YXIgbG9jYWxTdG9yYWdlO1xudHJ5IHtcbiAgbG9jYWxTdG9yYWdlID0gR2xvYmFsLmxvY2FsU3RvcmFnZTtcbn1cbmNhdGNoIChlKSB7XG4gIGNvbnNvbGUud2FybihlKTtcbn1cblxudmFyIFdCQnJvd3NlckxvY2FsU3RvcmFnZSA9IFdCQ2xhc3MuZXh0ZW5kKHtcblxuICAnZ2V0SXRlbSc6IGZ1bmN0aW9uIChrZXkpIHtcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG4gICAgdmFyIHZhbHVlID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucmVzb2x2ZSgpLnByb21pc2UodmFsdWUpO1xuICB9LFxuXG4gICdzZXRJdGVtJzogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG4gICAgdHJ5IHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgdmFsdWUpO1xuICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgZGVmZXJyZWQucmVqZWN0KGUpO1xuICAgIH1cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICdyZW1vdmVJdGVtJzogZnVuY3Rpb24gKGtleSkge1xuXG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcbiAgICBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIHJldHVybiBkZWZlcnJlZC5yZXNvbHZlKCkucHJvbWlzZSgpO1xuICB9LFxuXG4gICdjbGVhcic6IGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG4gICAgbG9jYWxTdG9yYWdlLmNsZWFyKCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnJlc29sdmUoKS5wcm9taXNlKCk7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdCQnJvd3NlckxvY2FsU3RvcmFnZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNvcmUgPSByZXF1aXJlKCd3dW5kZXJiaXRzLmNvcmUnKTtcbnZhciBXQkNsYXNzID0gY29yZS5XQkNsYXNzO1xudmFyIFdCRGVmZXJyZWQgPSBjb3JlLldCRGVmZXJyZWQ7XG5cbnZhciBHbG9iYWwgPSByZXF1aXJlKCcuLi9saWIvZ2xvYmFsJyk7XG5cbnZhciBjaHJvbWUgPSBHbG9iYWwuY2hyb21lO1xudmFyIGxvY2FsU3RvcmFnZSA9IGNocm9tZSAmJiBjaHJvbWUuc3RvcmFnZSAmJiBjaHJvbWUuc3RvcmFnZS5sb2NhbDtcblxudmFyIFdCQ2hyb21lTG9jYWxTdG9yYWdlID0gV0JDbGFzcy5leHRlbmQoe1xuXG4gICdnZXRJdGVtJzogZnVuY3Rpb24gKGtleSkge1xuXG4gICAgdmFyIGRlZmVycmVkID0gbmV3IFdCRGVmZXJyZWQoKTtcblxuICAgIGxvY2FsU3RvcmFnZS5nZXQoa2V5LCBmdW5jdGlvbiAoZGF0YSkge1xuXG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGRhdGFba2V5XTtcbiAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9LFxuXG4gICdzZXRJdGVtJzogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICB2YXIgZGF0YSA9IHt9O1xuICAgIGRhdGFba2V5XSA9IHZhbHVlO1xuXG4gICAgbG9jYWxTdG9yYWdlLnNldChkYXRhLCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbiAgfSxcblxuICAncmVtb3ZlSXRlbSc6IGZ1bmN0aW9uIChrZXkpIHtcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBXQkRlZmVycmVkKCk7XG5cbiAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlKGtleSwgZnVuY3Rpb24gKCkge1xuXG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGRlZmVycmVkLnJlc29sdmUoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXMoKTtcbiAgfSxcblxuICAnY2xlYXInOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgV0JEZWZlcnJlZCgpO1xuXG4gICAgbG9jYWxTdG9yYWdlLmNsZWFyKGZ1bmN0aW9uICgpIHtcblxuICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICBkZWZlcnJlZC5yZWplY3QoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXQkNocm9tZUxvY2FsU3RvcmFnZTtcbiJdfQ==
(45)
});

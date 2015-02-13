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

},{"./WBEventEmitter":5,"./mixins/ObservableHashMixin":31,"./mixins/WBDestroyableMixin":33,"./mixins/WBUtilsMixin":36}],2:[function(_dereq_,module,exports){
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

},{"./WBSingleton":8,"./mixins/ObservableHashMixin":31,"./mixins/WBBindableMixin":32,"./mixins/WBDestroyableMixin":33,"./mixins/WBEventsMixin":34,"./mixins/WBUtilsMixin":36}],3:[function(_dereq_,module,exports){
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

},{"./lib/clone":12,"./lib/createUID":13,"./lib/extend":18,"./lib/fromSuper":20,"./lib/inherits":23}],4:[function(_dereq_,module,exports){
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

  'properties': {
    '_state': states.pending,
    '_args': [],
    'handlers': []
  },

  'initialize': function (context) {
    var self = this;
    self._context = context;
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

},{"./WBClass":3,"./WBPromise":7,"./lib/assert":11,"./lib/toArray":27}],5:[function(_dereq_,module,exports){
'use strict';

var WBEventEmitter = _dereq_('./WBClass').extend({
  'mixins': [
    _dereq_('./mixins/WBBindableMixin'),
    _dereq_('./mixins/WBEventsMixin')
  ]
});

module.exports = WBEventEmitter;

},{"./WBClass":3,"./mixins/WBBindableMixin":32,"./mixins/WBEventsMixin":34}],6:[function(_dereq_,module,exports){
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

},{"./WBSingleton":8,"./lib/assert":11,"./lib/clone":12,"./lib/extend":18}],7:[function(_dereq_,module,exports){
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

},{"./lib/createUID":13,"./lib/extend":18}],9:[function(_dereq_,module,exports){
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

},{"./WBClass":3,"./mixins/WBBindableMixin":32,"./mixins/WBDestroyableMixin":33,"./mixins/WBEventsMixin":34,"./mixins/WBStateMixin":35}],10:[function(_dereq_,module,exports){
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

},{"./BaseEventEmitter":1,"./BaseSingleton":2,"./WBClass":3,"./WBDeferred":4,"./WBEventEmitter":5,"./WBMixin":6,"./WBSingleton":8,"./WBStateModel":9,"./lib":22,"./mixins":37}],11:[function(_dereq_,module,exports){
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

assert.number = function (value, message) {
  assert(typeof value === 'number' && !isNaN(value), message);
};

var types = [
  'undefined',
  'boolean',
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
  return new Date(date.getTime());
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
// http://stackoverflow.com/a/21963136/933653
'use strict';

var ff = 0xff;
var lut = [];
for (var i = 0; i < 256; i++) {
  lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
}

var random = Math.random;
function randHex() {
  return (random() * 0xffffffff | 0);
}

function section0 () {
  var d0 = randHex();
  return lut[d0 & ff] + lut[d0 >> 8 & ff] +
           lut[d0 >> 16 & ff] + lut[d0 >> 24 & ff];
}

function section1 () {
  var d1 = randHex();
  return lut[d1 & ff] + lut[d1 >> 8 & ff] + '-' +
         lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & ff];
}

function section2 () {
  var d2 = randHex();
  return lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & ff] + '-' +
       lut[d2 >> 16 & ff] + lut[d2 >> 24 & ff];
}

function section3 () {
  var d3 = randHex();
  return lut[d3 & ff] + lut[d3 >> 8 & ff] +
       lut[d3 >> 16 & ff] + lut[d3 >> 24 & ff];
}

function createUID (prefix) {
  var uid = [section0(), section1(), section2(), section3()].join('-');
  return (!prefix ? '' : prefix).toString() + uid;
}

module.exports = createUID;

},{}],14:[function(_dereq_,module,exports){
'use strict';

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
// From: http://davidwalsh.name/function-debounce
function debounce (fn, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) {
        fn.apply(context, args);
      }
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) {
      fn.apply(context, args);
    }
  };
}

module.exports = debounce;
},{}],15:[function(_dereq_,module,exports){
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

},{"./delay":16,"./toArray":27}],16:[function(_dereq_,module,exports){
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

},{"./toArray":27}],17:[function(_dereq_,module,exports){
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
    var localEvents = events || Object.keys(self._events);

    // loop through the events & bind them
    self.iterate(localEvents, function (name) {
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
    var subName;
    while (fragments.length) {
      current.push(fragments.shift());
      subName = current.join(':');
      if (subName in events) {
        self.triggerSection(subName, fragments, params);
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
    var localEvents = events;

    if (typeof localEvents === 'string') {
      localEvents = localEvents.split(eventSplitter);
    } else {
      assert.array(localEvents);
    }

    while (localEvents.length) {
      iterator.call(self, localEvents.shift());
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

},{"./assert":11,"./clone":12,"./toArray":27}],18:[function(_dereq_,module,exports){
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

},{"./assert":11,"./merge":25,"./toArray":27}],19:[function(_dereq_,module,exports){
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

},{}],20:[function(_dereq_,module,exports){
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

},{"./extend":18,"./merge":25}],21:[function(_dereq_,module,exports){
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

},{}],22:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'assert': _dereq_('./assert'),
  'clone': _dereq_('./clone'),
  'createUID': _dereq_('./createUID'),
  'debounce': _dereq_('./debounce'),
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
},{"./assert":11,"./clone":12,"./createUID":13,"./debounce":14,"./defer":15,"./delay":16,"./events":17,"./extend":18,"./forEach":19,"./fromSuper":20,"./functions":21,"./inherits":23,"./isEqual":24,"./merge":25,"./size":26,"./toArray":27,"./when":28,"./where":29}],23:[function(_dereq_,module,exports){
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

},{"./extend":18}],24:[function(_dereq_,module,exports){
'use strict';

// TODO: implement deepEqual
function isEqual (a, b) {
  return a === b;
}

module.exports = isEqual;

},{}],25:[function(_dereq_,module,exports){
'use strict';

var toArray = _dereq_('./toArray');

function merge (object) {
  var localSource;
  var sources = toArray(arguments, 1);
  while (sources.length) {
    localSource = sources.shift();
    for (var key in localSource) {
      if (localSource.hasOwnProperty(key)) {
        object[key] = localSource[key];
      }
    }
  }
  return object;
}

module.exports = merge;

},{"./toArray":27}],26:[function(_dereq_,module,exports){
'use strict';

function size (collection) {
  !Array.isArray(collection) && (collection = Object.keys(collection));
  return collection.length;
}

module.exports = size;

},{}],27:[function(_dereq_,module,exports){
'use strict';

function getAllocatedArray (arrLength) {

  arrLength = arrLength > 0 ? arrLength : 0;
  return new Array(arrLength);
}

function toArray (arrayLikeObj, skip) {

  var localSkip = skip || 0;
  var length = arrayLikeObj.length;
  var arr = getAllocatedArray(length - localSkip);

  for (var i = localSkip; i < length; i++) {
    arr[i - localSkip] = arrayLikeObj[i];
  }

  return arr;
}

module.exports = toArray;
},{}],28:[function(_dereq_,module,exports){
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

},{"../WBDeferred":4,"./toArray":27}],29:[function(_dereq_,module,exports){
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

},{"./forEach":19}],30:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var fromSuper = _dereq_('../lib/fromSuper');

var ControllableMixin = WBMixin.extend({

  'initialize': function () {

    var self = this;

    self.controllers = [];
    self.implemented = [];

    self.implements = fromSuper.concat(self, 'implements');
    self.createControllerInstances();

    self.bindOnceTo(self, 'destroy', 'destroyControllers');
  },

  'createControllerInstances': function () {

    var self = this;

    var Controllers = self.implements;
    if (typeof Controllers === 'function') {
      Controllers = Controllers.call(self);
    }

    var ControllerClass, controllerInstance, i;

    // the order in which the controllers are implemented is important!
    for (i = Controllers.length; i--;) {
      ControllerClass = Controllers[i];

      // If we have already implemented a controller that inherits from
      // this controller, we don't need another one...
      if (self.implemented.indexOf(ControllerClass.toString()) < 0) {

        controllerInstance = new ControllerClass(self);
        self.controllers.push(controllerInstance);
        controllerInstance.parent = self;

        self.trackImplementedSuperConstructors(ControllerClass);
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

    while (controllers.length) {
      // A controller can exist multiple times in the list,
      // since it's based on the event name,
      // so make sure to only destroy each one once
      controller = controllers.shift();
      controller.destroyed || controller.destroy();
    }
  }
});

module.exports = ControllableMixin;

},{"../WBMixin":6,"../lib/fromSuper":20}],31:[function(_dereq_,module,exports){
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

},{"../WBMixin":6,"../lib/clone":12,"../lib/fromSuper":20}],32:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var createUID = _dereq_('../lib/createUID');

var WBBindableMixin = WBMixin.extend({

  'properties': {
    '_bindings': {},
    '_namedEvents': {}
  },

  // keeps callback closure in own execution context with
  // only callback and context
  'callbackFactory': function  (callback, context) {

    var self = this;
    var bindCallback;

    if (typeof callback === 'string') {
      bindCallback = self.stringCallbackFactory(callback, context);
    }
    else {
      bindCallback = self.functionCallbackFactory(callback, context);
    }

    return bindCallback;
  },

  'stringCallbackFactory': function (callback, context) {

    return function stringCallback () {
      context[callback].apply(context, arguments);
    };
  },

  'functionCallbackFactory': function (callback, context) {

    return function functionCallback () {
      callback.apply(context, arguments);
    };
  },

  'bindTo': function (target, event, callback, context) {

    var self = this;
    self.checkBindingArgs.apply(self, arguments);

    // default to self if context not provided
    var ctx = context || self;

    // if this binding already made, return it
    var bound = self.isAlreadyBound(target, event, callback, ctx);
    if (bound) {
      return bound;
    }

    var callbackFunc, args;
    // if a jquery object
    if (self.isTargetJquery(target)) {
      // jquery does not take context in .on()
      // cannot assume on takes context as a param for bindable object
      // create a callback which will apply the original callback
      // in the correct context
      callbackFunc = self.callbackFactory(callback, ctx);
      args = [event, callbackFunc];
    }
    else {
      // Backbone accepts context when binding, simply pass it on
      callbackFunc = (typeof callback === 'string') ? ctx[callback] : callback;
      args = [event, callbackFunc, ctx];
    }

    // create binding on target
    target.on.apply(target, args);

    var binding = {
      'uid': createUID(),
      'target': target,
      'event': event,
      'originalCallback': callback,
      'callback': callbackFunc,
      'context': ctx
    };

    self._bindings[binding.uid] = binding;
    self.addToNamedBindings(event, binding);

    return binding;
  },

  'isTargetJquery': function (target) {

    var constructor = target.constructor;
    return constructor && constructor.fn && constructor.fn.on === target.on;
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

},{"../WBMixin":6,"../lib/createUID":13}],33:[function(_dereq_,module,exports){
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

    self.trigger('destroy');

    // clean up
    forEach(cleanupMethods, Call, self);

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

},{"../WBMixin":6,"../lib/forEach":19}],34:[function(_dereq_,module,exports){
'use strict';

var WBMixin = _dereq_('../WBMixin');
var events = _dereq_('../lib/events');

var WBEventsMixin = WBMixin.extend(events);

module.exports = WBEventsMixin;

},{"../WBMixin":6,"../lib/events":17}],35:[function(_dereq_,module,exports){
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

},{"../WBMixin":6,"../lib/clone":12,"../lib/extend":18,"../lib/isEqual":24,"../lib/merge":25}],36:[function(_dereq_,module,exports){
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

},{"../WBDeferred":4,"../WBMixin":6,"../lib/defer":15,"../lib/delay":16,"../lib/forEach":19,"../lib/functions":21,"../lib/toArray":27,"../lib/when":28}],37:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'ControllableMixin': _dereq_('./ControllableMixin'),
  'ObservableHashMixin': _dereq_('./ObservableHashMixin'),
  'WBBindableMixin': _dereq_('./WBBindableMixin'),
  'WBDestroyableMixin': _dereq_('./WBDestroyableMixin'),
  'WBEventsMixin': _dereq_('./WBEventsMixin'),
  'WBStateMixin': _dereq_('./WBStateMixin'),
  'WBUtilsMixin': _dereq_('./WBUtilsMixin')
};
},{"./ControllableMixin":30,"./ObservableHashMixin":31,"./WBBindableMixin":32,"./WBDestroyableMixin":33,"./WBEventsMixin":34,"./WBStateMixin":35,"./WBUtilsMixin":36}],38:[function(_dereq_,module,exports){
'use strict';

var core = _dereq_('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var clone = core.lib.clone;
var assert = core.lib.assert;

var generateId = _dereq_('./lib/generateId');

// Default id Attribute used
var defaultKeyPath = 'id';
var noop = function () {};

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
    var isAWrite = self.isCreateUpdate(method);

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

    // skip invalid crud operation or models that don't have a valid storeName
    if (storeName in stores) {
      options.success = self.successFactory(
        options.success,
        method, storeName, storeInfo,
        id, instance
      );

      var request;
      // query collections
      if (method === 'read' && !instance.id && instance.model) {
        request = self.queryCollection(instance);
      }
      // regular models
      else {
        request = self.operateOnModel(instance, method);
      }

      request.done(options.success);
      options.error && request.fail(options.error);
    }
  },

  'successFactory': function (success, method, storeName, storeInfo, id, instance) {

    var self = this;

    var _success = (typeof success === 'function') ? success : noop;

    // trigger events for syncing
    var _dispatchCUD = self.isCreateUpdateDelete(method) ? function () {

      self.database.trigger(method, storeName, id);
    } : noop;

    // Update full-text index when needed
    var _index = ('fullTextIndexFields' in storeInfo) ? function () {

      self.trigger('index', method, storeName, instance);
    } : noop;

    var _dispatchWriteDestroy = self.isCreateUpdate(method) ? function () {

      self.trigger('write', storeName, id);
    } : self.isDelete(method) ? function () {

      self.trigger('destroy', storeName, id);
    } : noop;

    return function () {

      _success.apply(this, arguments);
      _dispatchCUD();
      _index();
      _dispatchWriteDestroy();
    };
  },

  'isCreateUpdateDelete': function (method) {

    return method === 'create' || method ==='update' || method === 'delete';
  },

  'isCreateUpdate': function (method) {

    return method === 'create' || method ==='update';
  },

  'isDelete': function (method) {

    return method === 'delete';
  }
});

module.exports = BackboneDBSync;

},{"./lib/generateId":49,"wunderbits.core":10}],39:[function(_dereq_,module,exports){
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
    self.openDB(options.name, options.version, options);
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

},{"wunderbits.core":10}],40:[function(_dereq_,module,exports){
(function (global){
'use strict';

var core = _dereq_('wunderbits.core');
var WBDeferred = core.WBDeferred;
var toArray = core.lib.toArray;
var when = core.lib.when;

var AbstractBackend = _dereq_('./AbstractBackend');

var DOMError = global.DOMError || global.DOMException;
var indexedDB = global.indexedDB ||
                global.webkitIndexedDB ||
                global.mozIndexedDB ||
                global.msIndexedDB;

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

var _super = AbstractBackend.prototype;
var IndexedDBBackend = AbstractBackend.extend({

  'initialize': function () {

    var self = this;
    _super.initialize.apply(self, arguments);

    self.transactionQueue = {};
    self.isFlushingTransactionQueue = {};
  },

  'flushNextTransactions': function (storeName, transaction) {

    var self = this;
    var queue = self.transactionQueue[storeName];
    var allDone = [];
    var limit = 100;

    if (queue.length) {
      self.isFlushingTransactionQueue[storeName] = true;

      var nextInLine = queue.splice(0, limit);

      nextInLine.forEach(function (operation) {

        var promise = operation(transaction);
        allDone.push(promise);
      });

      when(allDone).always(function nextDone (transaction) {

        var args = toArray(arguments);
        var lastArg = args[args.length - 1];
        transaction = lastArg && lastArg[1];

        if (queue.length) {
          self.flushNextTransactions(storeName, transaction);
        }
        else {
          self.isFlushingTransactionQueue[storeName] = false;
        }
      });
    }
  },

  'flushTransactionQueue': function (storeName) {

    var self = this;

    var queue = self.transactionQueue[storeName];
    var length = queue.length;
    var flushing = self.isFlushingTransactionQueue[storeName];

    if (length && !flushing) {
      self.flushNextTransactions(storeName);
    }
    else if (!length) {
      self.isFlushingTransactionQueue[storeName] = false;
    }
  },

  'queueTransactionOperation': function (storeName, transactionFunction) {

    var self = this;

    var queue = self.transactionQueue[storeName];
    if (!queue) {
      queue = self.transactionQueue[storeName] = [];
    }
    queue.push(transactionFunction);

    !self.isFlushingTransactionQueue[storeName] && self.flushTransactionQueue(storeName);
  },

  'openDB': function (name, version) {

    var self = this;

    if (indexedDB) {
      var openRequest = indexedDB.open(name, version);
      openRequest.onerror = self.onRequestError.bind(self);
      openRequest.onsuccess = self.onRequestSuccess.bind(self);
      openRequest.onupgradeneeded = self.onUpgradeNeeded.bind(self);
    }
    else {
      self.openFailure('ERR_IDB_CONNECT_FAILED');
    }
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

    if (!self.options.versionless) {
      self.trigger('upgrading');
      self.mapStores(self.createStore);
    }
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

  'getWriteTransaction': function (storeName) {

    var self = this;
    return self.db.transaction([storeName], Constants.WRITE);
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();
    var promise = deferred.promise();

    self.queueTransactionOperation(storeName, function updateTransaction (storeTransaction) {

      var transaction = storeTransaction ? storeTransaction : self.getWriteTransaction(storeName);
      var store = transaction.objectStore(storeName);

      var request = store.put(json);

      request.onsuccess = function () {
        // pass transaction as second argument as to not resolve db request with wrong data
        deferred.resolve(undefined, transaction);
      };

      request.onerror = function (error) {
        self.trigger('error', Errors.updateFailed, error, storeName, json);
        deferred.reject();
      };

      return promise;
    });

    return promise;
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();
    var promise = deferred.promise();

    self.queueTransactionOperation(storeName, function destroyTransaction (storeTransaction) {

      var transaction = storeTransaction ? storeTransaction : self.getWriteTransaction(storeName);
      var store = transaction.objectStore(storeName);
      var id = json[store.keyPath || self.defaultKeyPath] || json.id;

      var request = store['delete'](id);

      request.onsuccess = function () {
        deferred.resolve(undefined, transaction);
      };

      request.onerror = function (error) {
        self.trigger('error', Errors.destroyFailed, error, storeName, json);
        deferred.reject();
      };

      return promise;
    });

    return promise;
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

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./AbstractBackend":39,"wunderbits.core":10}],41:[function(_dereq_,module,exports){
(function (global){
'use strict';

var core = _dereq_('wunderbits.core');
var WBDeferred = core.WBDeferred;
var forEach = core.lib.forEach;
var toArray = core.lib.toArray;

var AbstractBackend = _dereq_('./AbstractBackend');
var SafeParse = _dereq_('../lib/SafeParse');

var indexedDB = global.indexedDB ||
                global.webkitIndexedDB ||
                global.mozIndexedDB ||
                global.msIndexedDB;

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
      var store = global.localStorage;
      if (store.getItem('availableBackend') === 'memory' &&
          store.getItem('dbVersion') !== '' + options.version) {

        // clear localStorage
        store.clear();

        // If IDB is available, clear that too
        if (indexedDB) {
          var transaction = indexedDB.deleteDatabase(options.name);
          // Wait till the database is deleted before reloading the app
          transaction.onsuccess = transaction.onerror = function() {
            global.location.reload();
          };
        }
        // Otherwise, reload right away
        else {
          global.location.reload();
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
    self.localStorageAvailable && global.localStorage.clear();

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
      val = global.localStorage[storeName + '_' + id];
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
      global.localStorage[storeName + '_' + id] = JSON.stringify(json);
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

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/SafeParse":48,"./AbstractBackend":39,"wunderbits.core":10}],42:[function(_dereq_,module,exports){
(function (global){
'use strict';

var core = _dereq_('wunderbits.core');
var WBDeferred = core.WBDeferred;
var when = core.lib.when;

var AbstractBackend = _dereq_('./AbstractBackend');
var printf = _dereq_('../lib/printf');
var FieldTypes = _dereq_('../lib/FieldTypes');
var SafeParse = _dereq_('../lib/SafeParse');

var openConnection = global.openDatabase;
var escape = global.escape;
var unescape = global.unescape;

var SQL = {
  'createTable': 'CREATE TABLE IF NOT EXISTS ? (? TEXT PRIMARY KEY, ?)',
  'truncateTable': 'DELETE FROM ?',
  'dropTable': 'DROP TABLE IF EXISTS ?',
  'getAllTables': 'SELECT * FROM sqlite_master WHERE type=\'table\'',

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

  'properties': {
    'dbSize': (5 * 1024 * 1024)
  },

  'openDB': function (name, version, options) {

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
      var dbSize = options.dbSize || self.dbSize;
      var db = openConnection(name, '', name, dbSize);
      self.db = db;

      // WebSQL versions are strings
      version = '' + version;

      // check if we need to upgrade the schema
      if (db.version !== version && !options.versionless) {
        db.changeVersion(db.version || '', version, function () {

          self.onUpgradeNeeded()
            .done(self.openSuccess, self)
            .fail(self.openFailure, self);
        });
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

    var deferred = new WBDeferred();

    self.trigger('upgrading');

    var storeClearPromises = self.mapStores(self.clearStore);
    when(storeClearPromises).always(function () {

      self.listTables()
        .done(function (tables) {

          tables = tables || [];

          var dropPromises = tables.length ? tables.map(function (table) {
            return self.dropStore(table);
          }) : [];

          when(dropPromises).always(function () {

            var storeCreationDeferreds = self.mapStores(self.createStore);
            when(storeCreationDeferreds)
              .done(function () {
                deferred.resolve();
              })
              .fail(function () {
                deferred.reject();
              });
          })
          .fail(function () {
            console.warn('table drop failed');
          });
        })
        .fail(function () {
          console.warn('get tables failed');
        });
    })
    .fail(function () {
      console.warn('clear failed');
    });

    return deferred.promise();
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

  'dropStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();
    var sql = printf(SQL.dropTable, storeName);
    self.execute(sql)
      .done(deferred.resolve, deferred)
      .fail(function () {
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

  'listTables': function () {

    var self = this;
    var deferred = new WBDeferred();

    self.execute(SQL.getAllTables)
      .done(function (result) {

        var rows = result.rows;
        var data;
        var count = rows.length;
        var returnRows = [];
        for (var index = 1; index < count; index++) {
          data = rows.item(index);
          returnRows.push(data.name);
        }

        deferred.resolve(returnRows);
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

    var keys = ['"' + keyPath + '"'];
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

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/FieldTypes":47,"../lib/SafeParse":48,"../lib/printf":50,"./AbstractBackend":39,"wunderbits.core":10}],43:[function(_dereq_,module,exports){
(function (global){
'use strict';

var core = _dereq_('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var WBDeferred = core.WBDeferred;
var assert = core.lib.assert;
var extend = core.lib.extend;
var clone = core.lib.clone;
var merge = core.lib.merge;
var toArray = core.lib.toArray;

var MemoryBackend = _dereq_('./Backends/MemoryBackend');
var WebSQLBackend = _dereq_('./Backends/WebSQLBackend');
var IndexedDBBackend = _dereq_('./Backends/IndexedDBBackend');

var chrome = global.chrome;
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

  'initialize': function (options) {

    var self = this;

    options = options || {};
    self.crud = {};

    self.ready = new WBDeferred();

    assert.object(options.schema);

    var schema = options.schema;
    self.stores = schema.stores;

    var database = schema.database;
    self.name = database.name;

    self.versionless = !!options.versionless;

    // make version change with schema
    var version = (Object.keys(self.stores).length * 10e6);
    version += (parseInt(database.version, 10) || 1);
    self.version = version;
  },

  'init': function (backendName, options) {

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

    options = merge(options || {}, {
      'name': self.name,
      'version': self.version,
      'versionless': self.versionless,
      'stores': stores,
      'infoLog': loggers.info,
      'errorLog': loggers.error,
      'localStorageAvailable': localStorageAvailable
    });

    // try to init the available backend
    self.initBackend(backendName, options);

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
      var args = toArray(arguments);
      args.unshift('error');
      self.trigger.apply(self, args);
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
      var availableBackend = global.localStorage.getItem('availableBackend');
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
        if (!!global[tests.shift()]) {
          available = name;
          break;
        }
      }
    }

    // If none-available, use in-memory as default
    return available || 'memory';
  },

  // Define getAll for the app to load all data in the beginning
  'getAll': function (storeName, success, error) {

    var self = this;
    self.ready.done(function () {

      var request = self.backend.query(storeName);
      success && request.done(success);
      error && request.fail(error);
    });
  },

  // Empty the database, but don't destroy the structure
  'truncate': function (callback) {

    var self = this;
    self.ready.done(function () {

      // clear out localstorage as well (in case anything ever was left there)
      if (self.backendName !== 'memory' && !isChromeApp) {
        localStorageAvailable && global.localStorage.clear();
      }

      self.backend.truncate().then(callback);
    });
  }
});

module.exports = WBDatabase;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./Backends/IndexedDBBackend":40,"./Backends/MemoryBackend":41,"./Backends/WebSQLBackend":42,"wunderbits.core":10}],44:[function(_dereq_,module,exports){
(function (global){
'use strict';

var chrome = global.chrome;
var isChromeApp = chrome && chrome.storage;

var localStorageClass;
if (isChromeApp) {
  localStorageClass = _dereq_('./localStorage/WBChromeLocalStorage');
} else {
  localStorageClass = _dereq_('./localStorage/WBBrowserLocalStorage');
}

module.exports = localStorageClass;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./localStorage/WBBrowserLocalStorage":51,"./localStorage/WBChromeLocalStorage":52}],45:[function(_dereq_,module,exports){
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

},{"./lib/FieldTypes":47,"wunderbits.core":10}],46:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  'BackboneDBSync': _dereq_('./BackboneDBSync'),
  'WBDatabase': _dereq_('./WBDatabase'),
  'WBLocalStorage': _dereq_('./WBLocalStorage'),
  'WBSchema': _dereq_('./WBSchema')
};

},{"./BackboneDBSync":38,"./WBDatabase":43,"./WBLocalStorage":44,"./WBSchema":45}],47:[function(_dereq_,module,exports){
module.exports = {
  'Array': 'ARRAY',
  'Boolean': 'BOOLEAN',
  'DateTime': 'DATETIME',
  'Float': 'FLOAT',
  'Integer': 'INTEGER',
  'Object': 'OBJECT',
  'Text': 'TEXT'
};
},{}],48:[function(_dereq_,module,exports){
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

},{"wunderbits.core":10}],49:[function(_dereq_,module,exports){
'use strict';

function replacer () {
  return (Math.random() * 16 | 0).toString(16);
}

// Auto-generate IDs for new objects
function autoID () {
  return 'lw' + (new Array(31)).join('x').replace(/x/g, replacer);
}

module.exports = autoID;

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
(function (global){
'use strict';

var core = _dereq_('wunderbits.core');
var WBClass = core.WBClass;
var WBDeferred = core.WBDeferred;

var localStorage;
try {
  localStorage = global.localStorage;
}
catch (e) {
  console.warn(e);
}

var WBBrowserLocalStorage = WBClass.extend({

  'getItem': function (key) {

    var deferred = new WBDeferred();
    var value;

    try {
      value = localStorage.getItem(key);
      deferred.resolve(value);
    }
    catch (e) {
      deferred.reject(e);
    }

    return deferred.promise();
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
    try {
      localStorage.removeItem(key);
      deferred.resolve();
    }
    catch (e) {
      deferred.reject(e);
    }

    return deferred.promise();
  },

  'clear': function () {

    var deferred = new WBDeferred();

    try {
      localStorage.clear();
      deferred.resolve();
    }
    catch (e) {
      deferred.reject(e);
    }

    return deferred.promise();
  }
});

module.exports = WBBrowserLocalStorage;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"wunderbits.core":10}],52:[function(_dereq_,module,exports){
(function (global){
'use strict';

var core = _dereq_('wunderbits.core');
var WBClass = core.WBClass;
var WBDeferred = core.WBDeferred;

var chrome = global.chrome;
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

    return deferred.promise();
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

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"wunderbits.core":10}]},{},[46])
//@ sourceMappingURL=wunderbits.db.map
(46)
});

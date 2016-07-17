var loader, define, requireModule, require, requirejs;

(function(global) {
  'use strict';

  // Save off the original values of these globals, so we can restore them if someone asks us to
  var oldGlobals = {
    loader: loader,
    define: define,
    requireModule: requireModule,
    require: require,
    requirejs: requirejs
  };

  requirejs = require = requireModule = function(name) {
    stats.require++;
    var pending = [];
    var mod = findModule(name, '(require)', pending);

    for (var i = pending.length - 1; i >= 0; i--) {
      pending[i].exports();
    }

    return mod.module.exports;
  };

  function resetStats() {
    stats = {
      define: 0,
      require: 0,
      reify: 0,
      findDeps: 0,
      modules: 0,
      exports: 0,
      resolve: 0,
      resolveRelative: 0,
      findModule: 0,
      pendingQueueLength: 0
    };
    requirejs._stats = stats;
  }

  var stats;

  resetStats();

  loader = {
    noConflict: function(aliases) {
      var oldName, newName;

      for (oldName in aliases) {
        if (aliases.hasOwnProperty(oldName)) {
          if (oldGlobals.hasOwnProperty(oldName)) {
            newName = aliases[oldName];

            global[newName] = global[oldName];
            global[oldName] = oldGlobals[oldName];
          }
        }
      }
    }
  };

  var _isArray;
  if (!Array.isArray) {
    _isArray = function (x) {
      return Object.prototype.toString.call(x) === '[object Array]';
    };
  } else {
    _isArray = Array.isArray;
  }

  var registry = {};
  var seen = {};

  var uuid = 0;

  function unsupportedModule(length) {
    throw new Error('an unsupported module was defined, expected `define(name, deps, module)` instead got: `' +
                    length + '` arguments to define`');
  }

  var defaultDeps = ['require', 'exports', 'module'];

  function Module(name, deps, callback, alias) {
    stats.modules++;
    this.id        = uuid++;
    this.name      = name;
    this.deps      = !deps.length && callback.length ? defaultDeps : deps;
    this.module    = { exports: {} };
    this.callback  = callback;
    this.finalized = false;
    this.hasExportsAsDep = false;
    this.isAlias = alias;
    this.reified = new Array(deps.length);
    this._foundDeps = false;
    this.isPending = false;
  }

  Module.prototype.makeDefaultExport = function() {
    var exports = this.module.exports;
    if (exports !== null &&
        (typeof exports === 'object' || typeof exports === 'function') &&
          exports['default'] === undefined) {
      exports['default'] = exports;
    }
  };

  Module.prototype.exports = function() {
    if (this.finalized) { return this.module.exports; }
    stats.exports++;

    this.finalized = true;
    this.isPending = false;

    if (loader.wrapModules) {
      this.callback = loader.wrapModules(this.name, this.callback);
    }

    this.reify();

    var result = this.callback.apply(this, this.reified);

    if (!(this.hasExportsAsDep && result === undefined)) {
      this.module.exports = result;
    }
    this.makeDefaultExport();
    return this.module.exports;
  };

  Module.prototype.unsee = function() {
    this.finalized = false;
    this._foundDeps = false;
    this.isPending = false;
    this.module = { exports: {}};
  };

  Module.prototype.reify = function() {
    stats.reify++;
    var reified = this.reified;
    for (var i = 0; i < reified.length; i++) {
      var mod = reified[i];
      reified[i] = mod.exports ? mod.exports : mod.module.exports();
    }
  };

  Module.prototype.findDeps = function(pending) {
    if (this._foundDeps) {
      return;
    }

    stats.findDeps++;
    this._foundDeps = true;
    this.isPending = true;

    var deps = this.deps;

    for (var i = 0; i < deps.length; i++) {
      var dep = deps[i];
      var entry = this.reified[i] = { exports: undefined, module: undefined };
      if (dep === 'exports') {
        this.hasExportsAsDep = true;
        entry.exports = this.module.exports;
      } else if (dep === 'require') {
        entry.exports = this.makeRequire();
      } else if (dep === 'module') {
        entry.exports = this.module;
      } else {
        entry.module = findModule(resolve(dep, this.name), this.name, pending);
      }
    }
  };

  Module.prototype.makeRequire = function() {
    var name = this.name;
    var r = function(dep) {
      return require(resolve(dep, name));
    };
    r['default'] = r;
    r.has = function(dep) {
      return has(resolve(dep, name));
    }
    return r;
  };

  define = function(name, deps, callback) {
    stats.define++;
    if (arguments.length < 2) {
      unsupportedModule(arguments.length);
    }

    if (!_isArray(deps)) {
      callback = deps;
      deps     =  [];
    }

    if (callback instanceof Alias) {
      registry[name] = new Module(callback.name, deps, callback, true);
    } else {
      registry[name] = new Module(name, deps, callback, false);
    }
  };

  // we don't support all of AMD
  // define.amd = {};
  // we will support petals...
  define.petal = { };

  function Alias(path) {
    this.name = path;
  }

  define.alias = function(path) {
    return new Alias(path);
  };

  function missingModule(name, referrer) {
    throw new Error('Could not find module `' + name + '` imported from `' + referrer + '`');
  }

  function findModule(name, referrer, pending) {
    stats.findModule++;
    var mod = registry[name] || registry[name + '/index'];

    while (mod && mod.isAlias) {
      mod = registry[mod.name];
    }

    if (!mod) { missingModule(name, referrer); }

    if (pending && !mod.finalized && !mod.isPending) {
      mod.findDeps(pending);
      pending.push(mod);
      stats.pendingQueueLength++;
    }
    return mod;
  }

  function resolve(child, name) {
    stats.resolve++;
    if (child.charAt(0) !== '.') { return child; }
    stats.resolveRelative++;

    var parts = child.split('/');
    var nameParts = name.split('/');
    var parentBase = nameParts.slice(0, -1);

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];

      if (part === '..') {
        if (parentBase.length === 0) {
          throw new Error('Cannot access parent module of root');
        }
        parentBase.pop();
      } else if (part === '.') {
        continue;
      } else { parentBase.push(part); }
    }

    return parentBase.join('/');
  }

  function has(name) {
    return !!(registry[name] || registry[name + '/index']);
  }

  requirejs.entries = requirejs._eak_seen = registry;
  requirejs.has = has;
  requirejs.unsee = function(moduleName) {
    findModule(moduleName, '(unsee)', false).unsee();
  };

  requirejs.clear = function() {
    resetStats();
    requirejs.entries = requirejs._eak_seen = registry = {};
    seen = {};
  };

  // prime
  define('foo',      function() {});
  define('foo/bar',  [], function() {});
  define('foo/asdf', ['module', 'exports', 'require'], function(module, exports, require) {
    if (require.has('foo/bar')) {
      require('foo/bar');
    }
  });
  define('foo/baz',  [], define.alias('foo'));
  define('foo/quz',  define.alias('foo'));
  define('foo/bar',  ['foo', './quz', './baz', './asdf', './bar', '../foo'], function() {});
  define('foo/main', ['foo/bar'], function() {});

  require('foo/main');
  require.unsee('foo/bar');

  requirejs.clear();

  if (typeof exports === 'object' && typeof module === 'object' && module.exports) {
    module.exports = { require: require, define: define };
  }
})(this);
define('ember', [], function() {
  return {
    'default': Ember
  };
});

define('ember-data', [], function() {
  return {
    'default': DS
  };
});
// ==========================================================================
// Project:   Ember - JavaScript Application Framework
// Copyright: Copyright 2013 Stefan Penner and Ember App Kit Contributors
// License:   Licensed under MIT license
//            See https://raw.github.com/ember-cli/ember-resolver/master/LICENSE
// ==========================================================================


 // Version: 0.1.20

(function() {
/*globals define registry requirejs */

define("ember/resolver",
  [],
  function() {
    "use strict";

    if (typeof requirejs.entries === 'undefined') {
      requirejs.entries = requirejs._eak_seen;
    }

  /*
   * This module defines a subclass of Ember.DefaultResolver that adds two
   * important features:
   *
   *  1) The resolver makes the container aware of es6 modules via the AMD
   *     output. The loader's _moduleEntries is consulted so that classes can be
   *     resolved directly via the module loader, without needing a manual
   *     `import`.
   *  2) is able to provide injections to classes that implement `extend`
   *     (as is typical with Ember).
   */

  function classFactory(klass) {
    return {
      create: function (injections) {
        if (typeof klass.extend === 'function') {
          return klass.extend(injections);
        } else {
          return klass;
        }
      }
    };
  }

  var create = (Object.create || Ember.create);
  if (!(create && !create(null).hasOwnProperty)) {
    throw new Error("This browser does not support Object.create(null), please polyfil with es5-sham: http://git.io/yBU2rg");
  }

  function makeDictionary() {
    var cache = create(null);
    cache['_dict'] = null;
    delete cache['_dict'];
    return cache;
  }

  var underscore = Ember.String.underscore;
  var classify = Ember.String.classify;
  var get = Ember.get;

  function parseName(fullName) {
    /*jshint validthis:true */

    if (fullName.parsedName === true) { return fullName; }

    var prefix, type, name;
    var fullNameParts = fullName.split('@');

    // Htmlbars uses helper:@content-helper which collides
    // with ember-cli namespace detection.
    // This will be removed in a future release of Htmlbars.
    if (fullName !== 'helper:@content-helper' &&
        fullNameParts.length === 2) {
      var prefixParts = fullNameParts[0].split(':');

      if (prefixParts.length === 2) {
        prefix = prefixParts[1];
        type = prefixParts[0];
        name = fullNameParts[1];
      } else {
        var nameParts = fullNameParts[1].split(':');

        prefix = fullNameParts[0];
        type = nameParts[0];
        name = nameParts[1];
      }
    } else {
      fullNameParts = fullName.split(':');
      type = fullNameParts[0];
      name = fullNameParts[1];
    }

    var fullNameWithoutType = name;
    var namespace = get(this, 'namespace');
    var root = namespace;

    return {
      parsedName: true,
      fullName: fullName,
      prefix: prefix || this.prefix({type: type}),
      type: type,
      fullNameWithoutType: fullNameWithoutType,
      name: name,
      root: root,
      resolveMethodName: "resolve" + classify(type)
    };
  }

  function resolveOther(parsedName) {
    /*jshint validthis:true */

    // Temporarily disabling podModulePrefix deprecation
    /*
    if (!this._deprecatedPodModulePrefix) {
      var podModulePrefix = this.namespace.podModulePrefix || '';
      var podPath = podModulePrefix.substr(podModulePrefix.lastIndexOf('/') + 1);

      Ember.deprecate('`podModulePrefix` is deprecated and will be removed '+
        'from future versions of ember-cli. Please move existing pods from '+
        '\'app/' + podPath + '/\' to \'app/\'.', !this.namespace.podModulePrefix);

      this._deprecatedPodModulePrefix = true;
    }
    */
    Ember.assert('`modulePrefix` must be defined', this.namespace.modulePrefix);

    var normalizedModuleName = this.findModuleName(parsedName);

    if (normalizedModuleName) {
      var defaultExport = this._extractDefaultExport(normalizedModuleName, parsedName);

      if (defaultExport === undefined) {
        throw new Error(" Expected to find: '" + parsedName.fullName + "' within '" + normalizedModuleName + "' but got 'undefined'. Did you forget to `export default` within '" + normalizedModuleName + "'?");
      }

      if (this.shouldWrapInClassFactory(defaultExport, parsedName)) {
        defaultExport = classFactory(defaultExport);
      }

      return defaultExport;
    } else {
      return this._super(parsedName);
    }
  }

  // Ember.DefaultResolver docs:
  //   https://github.com/emberjs/ember.js/blob/master/packages/ember-application/lib/system/resolver.js
  var Resolver = Ember.DefaultResolver.extend({
    resolveOther: resolveOther,
    resolveTemplate: resolveOther,
    pluralizedTypes: null,

    makeToString: function(factory, fullName) {
      return '' + this.namespace.modulePrefix + '@' + fullName + ':';
    },
    parseName: parseName,
    shouldWrapInClassFactory: function(module, parsedName){
      return false;
    },
    init: function() {
      this._super();
      this.moduleBasedResolver = true;
      this._normalizeCache = makeDictionary();

      this.pluralizedTypes = this.pluralizedTypes || makeDictionary();

      if (!this.pluralizedTypes.config) {
        this.pluralizedTypes.config = 'config';
      }

      this._deprecatedPodModulePrefix = false;
    },
    normalize: function(fullName) {
      return this._normalizeCache[fullName] || (this._normalizeCache[fullName] = this._normalize(fullName));
    },
    _normalize: function(fullName) {
      // replace `.` with `/` in order to make nested controllers work in the following cases
      // 1. `needs: ['posts/post']`
      // 2. `{{render "posts/post"}}`
      // 3. `this.render('posts/post')` from Route
      var split = fullName.split(':');
      if (split.length > 1) {
        return split[0] + ':' + Ember.String.dasherize(split[1].replace(/\./g, '/'));
      } else {
        return fullName;
      }
    },

    pluralize: function(type) {
      return this.pluralizedTypes[type] || (this.pluralizedTypes[type] = type + 's');
    },

    podBasedLookupWithPrefix: function(podPrefix, parsedName) {
      var fullNameWithoutType = parsedName.fullNameWithoutType;

      if (parsedName.type === 'template') {
        fullNameWithoutType = fullNameWithoutType.replace(/^components\//, '');
      }

        return podPrefix + '/' + fullNameWithoutType + '/' + parsedName.type;
    },

    podBasedModuleName: function(parsedName) {
      var podPrefix = this.namespace.podModulePrefix || this.namespace.modulePrefix;

      return this.podBasedLookupWithPrefix(podPrefix, parsedName);
    },

    podBasedComponentsInSubdir: function(parsedName) {
      var podPrefix = this.namespace.podModulePrefix || this.namespace.modulePrefix;
      podPrefix = podPrefix + '/components';

      if (parsedName.type === 'component' || parsedName.fullNameWithoutType.match(/^components/)) {
        return this.podBasedLookupWithPrefix(podPrefix, parsedName);
      }
    },

    mainModuleName: function(parsedName) {
      // if router:main or adapter:main look for a module with just the type first
      var tmpModuleName = parsedName.prefix + '/' + parsedName.type;

      if (parsedName.fullNameWithoutType === 'main') {
        return tmpModuleName;
      }
    },

    defaultModuleName: function(parsedName) {
      return parsedName.prefix + '/' +  this.pluralize(parsedName.type) + '/' + parsedName.fullNameWithoutType;
    },

    prefix: function(parsedName) {
      var tmpPrefix = this.namespace.modulePrefix;

      if (this.namespace[parsedName.type + 'Prefix']) {
        tmpPrefix = this.namespace[parsedName.type + 'Prefix'];
      }

      return tmpPrefix;
    },

    /**

      A listing of functions to test for moduleName's based on the provided
      `parsedName`. This allows easy customization of additional module based
      lookup patterns.

      @property moduleNameLookupPatterns
      @returns {Ember.Array}
    */
    moduleNameLookupPatterns: Ember.computed(function(){
      return Ember.A([
        this.podBasedModuleName,
        this.podBasedComponentsInSubdir,
        this.mainModuleName,
        this.defaultModuleName
      ]);
    }),

    findModuleName: function(parsedName, loggingDisabled){
      var self = this;
      var moduleName;

      this.get('moduleNameLookupPatterns').find(function(item) {
        var moduleEntries = requirejs.entries;
        var tmpModuleName = item.call(self, parsedName);

        // allow treat all dashed and all underscored as the same thing
        // supports components with dashes and other stuff with underscores.
        if (tmpModuleName) {
          tmpModuleName = self.chooseModuleName(moduleEntries, tmpModuleName);
        }

        if (tmpModuleName && moduleEntries[tmpModuleName]) {
          if (!loggingDisabled) {
            self._logLookup(true, parsedName, tmpModuleName);
          }

          moduleName = tmpModuleName;
        }

        if (!loggingDisabled) {
          self._logLookup(moduleName, parsedName, tmpModuleName);
        }

        return moduleName;
      });

      return moduleName;
    },

    chooseModuleName: function(moduleEntries, moduleName) {
      var underscoredModuleName = Ember.String.underscore(moduleName);

      if (moduleName !== underscoredModuleName && moduleEntries[moduleName] && moduleEntries[underscoredModuleName]) {
        throw new TypeError("Ambiguous module names: `" + moduleName + "` and `" + underscoredModuleName + "`");
      }

      if (moduleEntries[moduleName]) {
        return moduleName;
      } else if (moduleEntries[underscoredModuleName]) {
        return underscoredModuleName;
      } else {
        // workaround for dasherized partials:
        // something/something/-something => something/something/_something
        var partializedModuleName = moduleName.replace(/\/-([^\/]*)$/, '/_$1');

        if (moduleEntries[partializedModuleName]) {
          Ember.deprecate('Modules should not contain underscores. ' +
                          'Attempted to lookup "'+moduleName+'" which ' +
                          'was not found. Please rename "'+partializedModuleName+'" '+
                          'to "'+moduleName+'" instead.', false);

          return partializedModuleName;
        } else {
          return moduleName;
        }
      }
    },

    // used by Ember.DefaultResolver.prototype._logLookup
    lookupDescription: function(fullName) {
      var parsedName = this.parseName(fullName);

      var moduleName = this.findModuleName(parsedName, true);

      return moduleName;
    },

    // only needed until 1.6.0-beta.2 can be required
    _logLookup: function(found, parsedName, description) {
      if (!Ember.ENV.LOG_MODULE_RESOLVER && !parsedName.root.LOG_RESOLVER) {
        return;
      }

      var symbol, padding;

      if (found) { symbol = '[✓]'; }
      else       { symbol = '[ ]'; }

      if (parsedName.fullName.length > 60) {
        padding = '.';
      } else {
        padding = new Array(60 - parsedName.fullName.length).join('.');
      }

      if (!description) {
        description = this.lookupDescription(parsedName);
      }

      Ember.Logger.info(symbol, parsedName.fullName, padding, description);
    },

    knownForType: function(type) {
      var moduleEntries = requirejs.entries;
      var moduleKeys = (Object.keys || Ember.keys)(moduleEntries);

      var items = makeDictionary();
      for (var index = 0, length = moduleKeys.length; index < length; index++) {
        var moduleName = moduleKeys[index];
        var fullname = this.translateToContainerFullname(type, moduleName);

        if (fullname) {
          items[fullname] = true;
        }
      }

      return items;
    },

    translateToContainerFullname: function(type, moduleName) {
      var prefix = this.prefix({ type: type });

      // Note: using string manipulation here rather than regexes for better performance.
      // pod modules
      // '^' + prefix + '/(.+)/' + type + '$'
      var podPrefix = prefix + '/';
      var podSuffix = '/' + type;
      var start = moduleName.indexOf(podPrefix);
      var end = moduleName.indexOf(podSuffix);

      if (start === 0 && end === (moduleName.length - podSuffix.length) &&
          moduleName.length > (podPrefix.length + podSuffix.length)) {
        return type + ':' + moduleName.slice(start + podPrefix.length, end);
      }

      // non-pod modules
      // '^' + prefix + '/' + pluralizedType + '/(.+)$'
      var pluralizedType = this.pluralize(type);
      var nonPodPrefix = prefix + '/' + pluralizedType + '/';

      if (moduleName.indexOf(nonPodPrefix) === 0 && moduleName.length > nonPodPrefix.length) {
        return type + ':' + moduleName.slice(nonPodPrefix.length);
      }

    },

    _extractDefaultExport: function(normalizedModuleName) {
      var module = require(normalizedModuleName, null, null, true /* force sync */);

      if (module && module['default']) {
        module = module['default'];
      }

      return module;
    }
  });

  Resolver.moduleBasedResolver = true;
  Resolver['default'] = Resolver;
  return Resolver;
});

define("resolver",
  ["ember/resolver"],
  function (Resolver) {
    Ember.deprecate('Importing/requiring Ember Resolver as "resolver" is deprecated, please use "ember/resolver" instead');
    return Resolver;
  });

})();



(function() {
/*globals define registry requirejs */

define("ember/container-debug-adapter",
  [],
  function() {
    "use strict";

  // Support Ember < 1.5-beta.4
  // TODO: Remove this after 1.5.0 is released
  if (typeof Ember.ContainerDebugAdapter === 'undefined') {
    return null;
  }
  /*
   * This module defines a subclass of Ember.ContainerDebugAdapter that adds two
   * important features:
   *
   *  1) is able provide injections to classes that implement `extend`
   *     (as is typical with Ember).
   */

  var ContainerDebugAdapter = Ember.ContainerDebugAdapter.extend({
    /**
      The container of the application being debugged.
      This property will be injected
      on creation.

      @property container
      @default null
    */
    // container: null, LIVES IN PARENT

    /**
      The resolver instance of the application
      being debugged. This property will be injected
      on creation.

      @property resolver
      @default null
    */
    // resolver: null,  LIVES IN PARENT
    /**
      Returns true if it is possible to catalog a list of available
      classes in the resolver for a given type.

      @method canCatalogEntriesByType
      @param {string} type The type. e.g. "model", "controller", "route"
      @return {boolean} whether a list is available for this type.
    */
    canCatalogEntriesByType: function(type) {
      return true;
    },

    /**
     * Get all defined modules.
     *
     * @method _getEntries
     * @return {Array} the list of registered modules.
     * @private
     */
    _getEntries: function() {
      return requirejs.entries;
    },

    /**
      Returns the available classes a given type.

      @method catalogEntriesByType
      @param {string} type The type. e.g. "model", "controller", "route"
      @return {Array} An array of classes.
    */
    catalogEntriesByType: function(type) {
      var entries = this._getEntries(),
          module,
          types = Ember.A();

      var makeToString = function(){
        return this.shortname;
      };

      var prefix = this.namespace.modulePrefix;

      for(var key in entries) {
        if(entries.hasOwnProperty(key) && key.indexOf(type) !== -1) {
          // Check if it's a pod module
          var name = getPod(type, key, this.namespace.podModulePrefix || prefix);
          if (!name) {
            // Not pod
            name = key.split(type + 's/').pop();

            // Support for different prefix (such as ember-cli addons).
            // Uncomment the code below when
            // https://github.com/ember-cli/ember-resolver/pull/80 is merged.

            //var match = key.match('^/?(.+)/' + type);
            //if (match && match[1] !== prefix) {
              // Different prefix such as an addon
              //name = match[1] + '@' + name;
            //}
          }
          types.addObject(name);
        }
      }
      return types;
    }
  });

  function getPod(type, key, prefix) {
    var match = key.match(new RegExp('^/?' + prefix + '/(.+)/' + type + '$'));
    if (match) {
      return match[1];
    }
  }

  ContainerDebugAdapter['default'] = ContainerDebugAdapter;
  return ContainerDebugAdapter;
});

})();



(function() {
(function() {
  "use strict";

  Ember.Application.initializer({
    name: 'container-debug-adapter',

    initialize: function() {
      var app = arguments[1] || arguments[0];
      var ContainerDebugAdapter = require('ember/container-debug-adapter');
      var Resolver = require('ember/resolver');

      app.register('container-debug-adapter:main', ContainerDebugAdapter);
      app.inject('container-debug-adapter:main', 'namespace', 'application:main');
    }
  });
}());

})();



(function() {

})();

(function() {
define("ember/load-initializers",
  [],
  function() {
    "use strict";

    return {
      'default': function(app, prefix) {
        var regex = new RegExp('^' + prefix + '\/((?:instance-)?initializers)\/');
        var getKeys = (Object.keys || Ember.keys);

        getKeys(requirejs._eak_seen).map(function (moduleName) {
            return {
              moduleName: moduleName,
              matches: regex.exec(moduleName)
            };
          })
          .filter(function(dep) {
            return dep.matches && dep.matches.length === 2;
          })
          .forEach(function(dep) {
            var moduleName = dep.moduleName;

            var module = require(moduleName, null, null, true);
            if (!module) { throw new Error(moduleName + ' must export an initializer.'); }

            var initializerType = Ember.String.camelize(dep.matches[1].substring(0, dep.matches[1].length - 1));
            var initializer = module['default'];
            if (!initializer.name) {
              var initializerName = moduleName.match(/[^\/]+\/?$/)[0];
              initializer.name = initializerName;
            }

            if (app[initializerType]) {
              app[initializerType](initializer);
            }
          });
      }
    };
  }
);
})();
define("ember-rails/module_prefix", ["exports"], function (exports) {
  "use strict";

  exports["default"] = "ember-app";
});
define('ember-rails/application', ['exports', 'ember', 'ember/resolver', 'ember/load-initializers', 'ember-rails/module_prefix'], function (exports, _ember, _emberResolver, _emberLoadInitializers, _emberRailsModule_prefix) {

  //

  'use strict';

  var App = _ember['default'].Application.extend({
    modulePrefix: _emberRailsModule_prefix['default'],
    Resolver: _emberResolver['default']
  });

  (0, _emberLoadInitializers['default'])(App, _emberRailsModule_prefix['default']);

  exports['default'] = App;
});

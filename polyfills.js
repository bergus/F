/* SOME WORKAROUND FUNCTIONS - MOSTLY OF JAVASCRIPT 1.8.5 */
// see also https://github.com/kriskowal/es5-shim/blob/master/es5-shim.js
/* Ordered by: Function, Object, Array, String, Number, Boolean, RegExp, Date */

if (!Function.prototype.bind) Function.prototype.bind = function bind(context) {
/* Creates a new function that, when called, itself calls this function in the context provided (with a given sequence of arguments) */
	var fn = this,
		s = Array.prototype.slice,
		arg = s.call(arguments,1);
	if (typeof fn != "function") // isCallable
		throw new TypeError("Function.prototype.bind: must be called on something callable; i.e. a function");

	return function bound() {
		if (this instanceof bound) { // creating new Object, AFAIunderstand
			var result = fn.apply(context = Object.create(fn.prototype), arg.concat(s.call(arguments,0)));
			if (Object(result) === result)
				return result;
			return context;
		}
		return fn.apply(context, arg.concat(s.call(arguments,0)));
	};
};

if (!Object.create) Object.create = function create(o, props) {
/* Creates a new object with the specified prototype object and properties. */
	if (typeof o != "object") // also accepts null
		throw new TypeError('Object.create must be called on an Object');
	function F() {}
	F.prototype = o;
	return typeof props == "undefined"
		? new F()
		: Object.extend(new F(), props);
};

if(!Object.defineProperty) Object.defineProperty = function defineProperty(obj, prop, descriptor) {
/* Adds the named property described by a given descriptor to an object. */
	if ((descriptor.value || descriptor.writable) && (descriptor.get || descriptor.set))
		throw new TypeError("Object.defineProperty: accessor descriptors and data descriptors cannot be used together");
	if (descriptor.value) {
		var v = descriptor.value;
		descriptor.get = function() { return v; };
		if (descriptor.writable === true) {
			descriptor.set = function(n) { v = n; };
		}
	}
	Object.prototype.__defineGetter__.call(obj, prop, descriptor.get);
	Object.prototype.__defineSetter__.call(obj, prop, descriptor.set);
	if (descriptor.configurable !== true || descriptor.enumerable !== true)
		throw new Error("Object.defineProperty: this implementation is not able to set configurability or enumerability to (default) false");
	return obj;
};

if (!Object.defineProperties) Object.defineProperties = function defineProperties(obj, properties) {
/* Adds the named properties described by the given descriptors to an object. */
// No conversion of/checking for boolean, callable or descriptor identity as in https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Object/defineProperties
	for (var key in properties)
		if (Object.prototype.hasOwnProperty.call(properties, key))
			Object.defineProperty(obj, key, properties[key]);
	return obj;
};

if (!Object.getOwnPropertyDescriptor) Object.getOwnPropertyDescriptor = Object.prototype.__lookupGetter__ // Object.extend relies on this, and should work also in a non-getter/setter-environment
	? function getOwnPropertyDescriptor(obj, prop) {
/* Returns a property descriptor for a named property on an object. */
		var des = {
			configurable: true,
			enumerable: true // Object.keys(obj).contains(prop)
		}
		var g = Object.prototype.__lookupGetter__.call(obj, prop),
			s = Object.prototype.__lookupSetter__.call(obj, prop);
		if (g || s) {
			des.get = g;
			des.set = s;
		} else {
			des.value = obj[prop];
			des.writable = true;
		}
		return des;
	}
	: function getOwnPropertyDescriptor(obj, prop) {
		return {
			value: obj[prop],
			writable: true,
			configurable: true,
			enumerable: true // Object.keys(obj).contains(prop)
		}
	};

if (!Object.keys) Object.keys = function keys(o, e) {
/* Returns an Array of all enumerable propreties on an object */
/* get: Object[, auch Prototypenschlüssel zurückgeben]
return: Array mit den objekteigenen Schlüsseln */
	if (o !== Object(o))
		throw new TypeError('Object.keys called on non-object');
	var p = [], k;
	for (k in o)
		if (e || Object.prototype.hasOwnProperty.call(o, k))
			p.push(k);
	return k;
};

// Object.getOwnPropertyNames
/* Returns an array of all enumerable and non-enumerable properties on an object. */

// Object.preventExtensions
/* Prevents any extensions of an object. */

// Object.isExtensible
/* Determine if extending of an object is allowed. */

// Object.seal
/* Prevents other code from deleting properties of an object. */

// Object.isSealed
/* Determine if an object is sealed. */

// Object.freeze
/* Freezes an object: other code can't delete or change any properties. */

// Object.isFrozen
/* Determine if an object was frozen. */

if (!Array.isArray) Array.isArray = function isArray(o) {
/* Checks if a variable is an array. */
// http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
  return Object.prototype.toString.call(o) === '[object Array]';
};

if(!String.prototype.trim) String.prototype.trim = function trim() {
/* Trims whitespace from the beginning and end of the string */
	return this.replace(/^\s+|\s+$/g,'');
};

// Date.toJSON
/* Returns a JSON format string for a Date object. */

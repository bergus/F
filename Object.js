if (!Object.values) Object.values = function values(o, e) { // e not standard
	if (o !== Object(o))
		throw new TypeError('Object.values called on non-object');
	var ret=[], p;
	for (p in o)
		if (e || Object.prototype.hasOwnProperty.call(o, p))
			ret.push(o[p]);
	return ret;
};

Object.len = function length(o) {
	return Object.getOwnPropertyNames(o).length;
};

if (!Object.clone) Object.clone = function clone(o, d) {
	if (o !== Object(o))
		return o; // primitive value
	if (Node && o instanceof Node)
		return Node.prototype.cloneNode.call(o, Boolean(d));
	var n;
	if ([Date, RegExp, String, Number, Boolean].indexOf(o.constructor) >= 0) // might use instanceof
		n = new o.constructor(o);
	if (o instanceof Function)
		n = function cloned() {return o.apply(this, arguments)}; // new Function(o) a) funktioniert nicht in Opera b) tut merkwürdige Dinge in Firefox
	// check for "clone" in o && typeof getPrototypeOf(o).clone == "function"...
	// check for typeof o.constructor.clone == "function" && o.constructor.clone !== clone
	if (n !== Object(n)) // we still got no new object
		n = new o.constructor(); // {}, [], custom
	return Object.extend(n, o, d);
};

Object.copyCircular = function deepCircularCopy(o) {
/* get: plain Object
		creates a copy of the object. Circular references (pointers back/up to a "parent") are recognised, no endless loops will be encountered.
return: cloned Object */
    const gdcc = "__getDeepCircularCopy__";
	if (o !== Object(o))
		return o; // primitive value
	var set = gdcc in o,
		cache = o[gdcc],
		result;
	if (set && typeof cache == "function")
	    return cache();
	// else
	o[gdcc] = function() { return result; }; // overwrite
	if (o instanceof Array) {
		result = [];
		for (var i=0; i<o.length; i++)
			result[i] = deepCircularCopy(o[i]);
	} else {
		result = {};
		for (var prop in o)
			if (prop != gdcc)
				result[prop] = deepCircularCopy(o[prop]);
			else if (set)
				result[prop] = deepCircularCopy(cache);
	}
	if (set)
		o[gdcc] = cache; // reset
	else
		delete o[gdcc]; // unset again
	return result;
};

if (!Object.extend) Object.extend = function extend(o, q/*, d, col*/) {
/* get: zu erweiterndes Objekt (Funktion, etc), Quellobjekt[e] mit den Eigenschaften[, tief klonen statt kopieren][, Kollisionsfunktion(key, überschriebener Wert, überschreibender Wert, erweitertes Objekt, erweiterndes Objekt)]
return: erweitertes Objekt */
	if (o !== Object(o) || q !== Object(q))
		throw new TypeError('Object.extend called on non-object');
	var col = arguments[arguments.length-1];
	if (typeof col != "function") {
		var d = col;
		col = false;
	} else 
		var d = arguments[arguments.length-2];
	if (typeof d != "boolean")
		d = false;
	// @TODO: Use Object.getOwnPropertyNames
	var p, des;
	for (p in q) {
		if (Object.prototype.hasOwnProperty.call(q, p)) {
			if (col && Object.prototype.hasOwnProperty.call(o, p)) {
				o[p] = col(p, o[p], q[p], o, q);
			} else {
				des = Object.getOwnPropertyDescriptor(q, p);
				if (d && typeof des.value == "object")
					des.value = Object.clone(des.value, d);
				Object.defineProperty(o, p, des);
			}
		}
	}
	if (typeof arguments[2] == "object")
		return extend.apply(null, [o].concat(Array.prototype.slice.call(arguments, 2)));
	return o;
};

Object.extendCreated = function extendCreated(o, e) {
	return Object.extend(Object.create(o), e);
};

if (!Object.set) Object.set = function set(o, key, value, col) {
/* get: zu erweiterndes Objekt (Funktion, etc), String key (property), mixed value[, Kollisionsfunktion(key, überschriebener Wert, überschreibender Wert, erweitertes Objekt)]
		This is a shortcut function, to make creating of an object, setting a property with variable name on it, and returning it a one-liner:
		example:  return Object.set({}, someProp, someVal);
return: erweitertes Objekt */
	if (o !== Object(o))
		throw new TypeError('Object.set called on non-object');
	if (typeof col=="function" && Object.prototype.hasOwnProperty.call(o, key)) {
		o[key] = col(key, o[key], value, o/*, null*/);
	} else {
		o[key] = value;
	}
	return o;
};

Object.get = function get(key) {
/* get: (Array of) strings/numbers[, (Array of) strings/numbers, ...]
return: a function that extracts the property values for the given keys of any object passed to it as an argument
example: Object.get("a.b".split("."))({a:{b:"x"}}) == "x" */
	if ((typeof key == "string" || typeof key == "number") && arguments.length < 2)
		return function(o) {
			if (o !== Object(o))
				throw new TypeError('Object.get('+key+') called on non-object');
			return o[key];
		}
//	if (typeof key == "object" && !Array.isArray(key))
//		return get.apply(null, Array.prototype.slice.call(arguments, 1))(key);
	var keys = Array.from(arguments).flatten();
	if ( !keys.every(function(key) { return typeof key == "string" || typeof key == "number"; }) )
		throw new TypeError("Object.get must be called with strings or arrays of strings as parameters");
	return function(o) {
		if (o !== Object(o))
			throw new TypeError('Object.get('+key+') called on non-object');
		return keys.reduce(function(o, key) {
			return o[key];
		}, o);
	}
};

Object.combine = function combine(a, b) {
/* get: Object, Object, Object, ... | Array, Array, Array, ...
return: the first object (a), extended with items from the others. Conflicting items are again combined (to each other) */
	if (Object(a) !== a)
		throw new TypeError('Object.combine called on non-object');
	if (Array.isArray(a))
		return Array.prototype.combine.apply(a, Array.prototype.slice.apply(arguments, 1));
	Object.extend(a, b, false, function combine(k, a, b) {
		if (a === b)
			return a;
		if (Array.isArray(a) && Array.isArray(b))
			return a.combine(b);
		return Object.extend(a, b, false, combine); // throws an Error when trying to merge non-objects
	});
	if (arguments.length > 2)
		return Object.combine.apply(null, [a].concat(Array.prototype.slice.apply(arguments, 2)));
	return a;
};
Object.merge = function merge(a) {
/* get: Object, Object, Object, ... | Array, Array, Array, ...
return: a new object, extended with items from the others. Conflicting items are again merged (to each other) */
	if (Object(a) !== a)
		throw new TypeError('Object.merge called on non-object');
	if (Array.isArray(a))
		return Array.prototype.combine.apply([], arguments);
	var res = {};
	for (var i=0; i<arguments.length; i++)
		Object.extend(res, arguments[i], false, function merge(k, a, b) {
			if (a === b)
				return a;
			if (Array.isArray(a) && Array.isArray(b))
				return a.merge(b); // creates a copy!
			return Object.extend(a, b, false, merge); // throws an Error when trying to merge non-objects
		});
	return res;
};

/* Object.cloneMerge = function cloneMerge(a) {
	if (arguments.length < 2)
		return Object.clone(a);
	return Object.merge.apply(null, [{}].concat(Array.prototype.slice.apply(arguments, 0)));
}; */

Object.forEach = Object.each = function each(o, f) {
	if (typeof f != "function" && typeof (f=o) == "function")
		return function(o) {return each(o, f);};
	if (o !== Object(o))
		throw new TypeError('Object.each called on non-object');
	for (var p in o)
		if (Object.prototype.hasOwnProperty.call(o, p))
			f(p, o[p], o);
	return o;
};

Object.map = function map(o, f) {
	if (typeof f != "function" && typeof (f=o) == "function")
		return function(o) {return map(o, f);};
	if (o !== Object(o))
		throw new TypeError('Object.map called on non-object');
	var map = {};
	for (var p in o)
		if (Object.prototype.hasOwnProperty.call(o, p))
			f(map, p, o[p], o);
	return map;
};

Object.mapValues = function mapValues(o, f) {
	if (typeof f != "function" && typeof (f=o) == "function")
		return function(o) {return mapValues(o, f);};
	if (o !== Object(o))
		throw new TypeError('Object.mapValues called on non-object');
	var map = {};
	for (var p in o)
		if (Object.prototype.hasOwnProperty.call(o, p))
			map[p] = f(o[p], p, o);
	return map;
};

Object.rename = Object.mapKeys = function mapKeys(o, f) {
	if (typeof f != "function" && typeof (f=o) == "function")
		return function(o) {return mapKeys(o, f);};
	if (o !== Object(o))
		throw new TypeError('Object.mapKeys called on non-object');
	var map = {};
	for (var p in o)
		if (Object.prototype.hasOwnProperty.call(o, p))
			map[f(p, o[p], o)] = o[p]; // Arguments: erst Key, dann Value !!!
	return map;
};

if(!Object.toArray) Object.toArray = function toArray(o, f) {
/* get: Objekt, funktion(Schlüssel, Eigenschaft) returns Arrayeintrag
return: Array mit den jeweils zurückgegebenen Werten */
	if (typeof f != "function" && typeof (f=o) == "function")
		return function(o) {return toArray(o, f);};
	if (o !== Object(o))
		throw new TypeError('Object.toArray called on non-object');
	return Object.keys(o).map( function(key) {
		return f(key, o[key]);
	});
};

if(!Object.join) Object.join = function join(o, j, f) {
/* get: Objekt, verknüpfender String[, Funktion wie bei Object.toArray]
return: String */
	if (typeof f != "function") {
		if (typeof (f=j) == "function" && typeof (j=o) != "undefined")
			return function(o) {return join(o, j, f);};
		f = function(key, value) { return key+": "+value; }; // toString impliziert
	}
	if (o !== Object(o))
		throw new TypeError('Object.join called on non-object');
	return Object.toArray(o, f).join(j);
}

Object.isEmpty = function isEmpty(o) {
	if (o !== Object(o))
		throw new TypeError('Object.isEmpty called on non-object');
	for (var key in o)
		if (Object.prototype.hasOwnProperty.call(o, key))
			return false;
	return true;
};

Object.restructure = function restructure(o) {

/* @ TODO !!! */

	var struc = Array.prototype.slice.call(arguments, 1);
	var path = new Array(struc.length);
	
	function recurse(lvl, curob, val, fill) {
		while (fill < struc.length-1 && fill in path) { // this is no for-in-loop!
			val = val[path[fill]] || (val[path[fill]] = {});
			fill++;
		}
		
		if (lvl < struc.length) {
			var willbe = struc[lvl];
			if (Array.isArray(curob))
				for (var i=0; i<curob.length; i++) {
					path[willbe] = true;
					recurse(lvl+1, curob[i], val, fill);
					delete path[willbe]; // I know it's an Array
				}
			else
				for (var prop in curob) {
					path[willbe] = prop;
					recurse(lvl+1, curob[prop], val, fill);
					delete path[willbe]; // I know it's an Array
				}
		} else {
console.assert(lvl-1 == fill, "fill ("+fill+") is different from lvl ("+lvl+")");
			val[path[fill]] = curob;
		}
		return val;
	}
	return recurse(0, o, {}, 0);
};
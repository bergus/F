if (!Object.values) Object.values = function values(o, e) { // e not standard
	if (o !== Object(o))
		throw new TypeError('Object.values called on non-object');
	var ret=[], p;
	for (p in o)
		if (e || Object.prototype.hasOwnProperty.call(o, p))
			ret.push(o[p]);
	return ret;
};

if (!Object.clone) Object.clone = function clone(o, d) {
	if (o !== Object(o))
		return o; // primitives Literal
	if (o instanceof Node)
		return Node.prototype.cloneNode.call(o, Boolean(d));
	var n;
	if (o.constructor == Date || o.constructor == RegExp || o.constructor == String || o.constructor == Number || o.constructor == Boolean)
		n = new o.constructor(o);
	if (o.constructor == Function)
		n = o; // new Function(o) a) funktioniert nicht in Opera b) tut merkwürdige Dinge in Firefox
	if (n !== Object(n))
		n = new o.constructor(); // {}
	return Object.extend(n, o, d);
};

if (!Object.extend) Object.extend = function extend(o, q, d, col) {
/* get: zu erweiterndes Objekt (Funktion, etc), Quellobjekt mit den Eigenschaften[, tief klonen statt kopieren][, Kollisionsfunktion(key, überschriebener Wert, überschreibender Wert, erweitertes Objekt, erweiterndes Objekt)]
return: erweitertes Objekt */
	if (o !== Object(o) || q !== Object(q))
		throw new TypeError('Object.extend called on non-object');
	var p, s, g;
	for (p in q) {
		if (Object.prototype.hasOwnProperty.call(q, p)) {
			if (typeof col=="function" && Object.prototype.hasOwnProperty.call(o, p)) {
				o[p] = col(p, o[p], q[p], o, q);
			} else {
				if (g = Object.prototype.__lookupGetter__.call(q, p))
					Object.prototype.__defineGetter__.call(o, p, g);
				if (s = Object.prototype.__lookupSetter__.call(q, p))
					Object.prototype.__defineSetter__.call(o, p, g);
				if (!s && !g)
					o[p] = d ? Object.clone(q[p], d) : q[p];
			}
		}
	}
	return o;
};

if (!Object.set) Object.set = function set(o, key, value, col) {
/* get: zu erweiterndes Objekt (Funktion, etc), String key (property), mixed value[, Kollisionsfunktion(key, überschriebener Wert, überschreibender Wert, erweitertes Objekt)]
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
	if (typeof key == "string" && arguments.length < 2)
		return function(o) {
			if (o !== Object(o))
				throw new TypeError('Object.get('+key+') called on non-object');
			return o[key];
		}
	var keys = Array.from(arguments).flatten();
	if ( !keys.every(function(key) { return typeof key == "string"; }) )
		throw new TypeError("Object.get must be called with strings or arrays of strings as parameters");
	return function(o) {
			if (o !== Object(o))
				throw new TypeError('Object.get('+key+') called on non-object');
			return keys.reduce(function(o, key) {
				return o[key];
			}, o);
		}
};

Object.merge = function merge(a, b) {
	if (Object(a) !== a)
		throw new TypeError('Object.merge called on non-object');
	if (Array.isArray(a))
		return Array.prototype.merge.apply(a, Array.prototype.slice.apply(arguments, 1));
	Object.extend(a, b, false, function merge(k, a, b) {
		if (a === b)
			return a;
		if (Array.isArray(a) && Array.isArray(b))
			return a.merge(b);
		return Object.extend(a, b, false, merge); // throws an Error when trying to merge non-objects
	});
	if (arguments.length > 2)
		return Object.merge.apply(null, [a].concat(Array.prototype.slice.apply(arguments, 2)));
	return a;
};
/* Object.cloneMerge = function cloneMerge(a) {
	if (arguments.length < 2)
		return Object.clone(a);
	return Object.merge.apply(null, [{}].concat(Array.prototype.slice.apply(arguments, 0)));
}; */

if(!Object.toArray) Object.toArray = function toArray(o, f) {
/* get: Objekt, funktion(Schlüssel, Eigenschaft) returns Arrayeintrag
return: Array mit den jeweils zurückgegebenen Werten */
	if (o !== Object(o))
		if (typeof (f=o) == "function")
			return function(o) {return toArray(o, f);};
		else
			throw new TypeError('Object.toArray called on non-object');
	// return Object.keys(o).map( function(key) { return f(key, o[key]); });
	var ret=[], p;
	for (p in o)
		if (Object.prototype.hasOwnProperty.call(o, p))
			ret.push(f(p, o[p]));
	return ret;
};

if(!Object.join) Object.join = function join(o, j, f) {
/* get: Objekt, verknüpfender String[, Funktion wie bei Object.toArray]
return: String */
	if (typeof f != "function")
		f = function(key, value) { return key+": "+value; }; // toString impliziert
	if (o !== Object(o))
		if (typeof (f=j) == "function" && typeof (j=o) == "string")
			return function(o) {return join(o, j, f);};
		else
			throw new TypeError('Object.join called on non-object');
	return Object.toArray(o, f).join(j);
}

Object.isEmpty = function isEmpty(o) {
	if (o !== Object(o))
		throw new TypeError('Object.isEmpty called on non-object');
	for (var key in this)
		if (Object.prototype.hasOwnProperty.call(o, key))
			return false;
	return true;
};
/* Look into hocf.html for more information */

Function.prototype.callarg = function(context/*, arg1, ...*/) {
	var fn = this,
		args = arguments;
	return function() {
		return Function.prototype.call.apply(fn, args);
	};
}

/* Function.prototype.bind */

/* Function.prototype. = function() {

} */

Function.prototype.argwith = function(/*arg1, ...*/) {
	var fn = this,
		args = arguments;
	return function(context) {
		return fn.apply(context, arg);
	};
}

Function.prototype.argcall = function(/*arg1, ...*/) {
	var fn = this,
		args = Array.prototype.slice.call(arguments);
	return function(context/*, argM, ...*/) {
		return fn.apply(context, arsg.concat(Array.prototype.slice.call(arguments, 1)));
	};
}

/* Function.prototype. = function() {

} */

Function.prototype.arg = function(/*arg1, ...*/) {
	var fn = this,
		args = arguments;
	return function() {
		return fn.apply(this, args);
	};
}

Function.prototype.pcall = Function.prototype.partial = function() {
	if (arguments.length < 1)
		return this;
	var fn = this,
		args = Array.prototype.slice.call(arguments);
	return function(/*argM, ...*/) {
		return fn.apply(this, args.concat(Array.prototype.slice.call(arguments)));
	};
}

Object.keys(Function.prototype).concat(["bind"]).forEach(function(method) {
	Function[method] = function(fn) {
		if (typeof fn == "function")
			return Function.prototype.bind.apply(Function.prototype[method], arguments);
		return Function.prototype.argwith(Function.prototype[method], arguments);
	};
});

Function.prototype.curry = function curry(length, context) {
	if (typeof this != "function")
		throw new TypeError();
	if (typeof length != "number") {
		if (typeof context == "undefined")
			context = length;
		length = this.length; // arguments.caller.length - Anzahl von entgegengenommen Argumenten
	}

};


Function.prototype.xBind = function xBind(context/*, arg1, undefined, arg3, ...*/) {

};

Function.prototype.xPcall = function xPcall(/*arg1, undefined, arg3, ...*/) {

};

Function.prototype.xCurry = function xCurry(length, context) {
	if (typeof this != "function")
		throw new TypeError();
	if (typeof length != "number") {
		if (typeof context == "undefined")
			context = length;
		length = this.length; // arguments.caller.length - Anzahl von entgegengenommen Argumenten
	}

};


Function.prototype.result = function result(r) {
	var fn = this;
	return function() {
		fn.apply(this, arguments);
		return r;
	};
}

Function.prototype.bool = function(real) {
/* get: boolean real: whether the result should be returned as it is or get inverted
return: the functions result converted to boolean, optionally inverted */
	var fn = this;
	return function() {
		return ! (real ^ fn.apply(this, arguments));
	};
}
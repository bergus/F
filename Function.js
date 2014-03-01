/* Look into hocf.html for more information */

Function.prototype.callarg = function(context/*, arg1, ...*/) {
	var fn = this,
		args = arguments;
	return function() {
		return Function.prototype.call.apply(fn, args);
	};
};

/* Function.prototype.bind */

/* Function.prototype. = function() {

} */

Function.prototype.argwith = function(/*arg1, ...*/) {
	var fn = this,
		args = arguments;
	return function(context) {
		return fn.apply(context, args);
	};
};

Function.prototype.argcall = function(/*arg1, ...*/) {
	var fn = this,
		args = Array.prototype.slice.call(arguments);
	return function(context/*, argM, ...*/) {
		return fn.apply(context, args.concat(Array.prototype.slice.call(arguments, 1)));
	};
};

/* Function.prototype. = function() {

}; */

Function.prototype.arg = function(/*arg1, ...*/) {
	var fn = this,
		args = arguments;
	return function() {
		return fn.apply(this, args);
	};
};

Function.prototype.pcall = Function.prototype.partial = function() {
	if (arguments.length < 1)
		return this;
	var fn = this,
		args = Array.prototype.slice.call(arguments);
	return function(/*argM, ...*/) {
		return fn.apply(this, args.concat(Array.prototype.slice.call(arguments)));
	};
};

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

Function.prototype.methodize = function methodize(context) {
	var fn = this;
	return function() {
		var args = Array.prototype.slice.call(arguments, 0);
		args.unshift(this);
		return fn.apply(context || null, args);
	};
};

Function.prototype.result = function result(r) {
	var fn = this;
	return function() {
		fn.apply(this, arguments);
		return r;
	};
};

Function.prototype.bool = function(real) {
/* get: boolean real: whether the result should be returned as it is or get inverted
return: the functions result converted to boolean, optionally inverted */
	var fn = this;
	return function() {
		return ! (real ^ fn.apply(this, arguments));
	};
};

Function.ident = Function.identity = Function.I = function identity(x) {
	return x;
};
Function.const = function(x) {
	return function() {
		return x;
	};
};

Function.chain = Function.compose = function compose(fn) {
	var fns = Array.prototype.slice.call(arguments, 0);
	if (fns.length == 0)
		return Function.identity;
	if (fns.length == 1)
		return fn;
	return function composed() {
	// from http://base2.googlecode.com/svn/version/1.0.2/src/base2.js
		var i = fns.length,
			result = fns[--i].apply(this, arguments);
		while (i--)
			result = fns[i].call(this, result);
		return result;
	};
};

Function.prototype.nest = function nest(n) {
	var fn = this;
	if (typeof n == "number")
		return function nested(x) {
			for (var i=n; i--; )
				x = fn.call(this, x);
			return x;
		};
	else if (typeof n == "function")
		return function nested(x) {
			while (n(x))
				x = fn.call(this, x);
			return x;
		};
	else
		// TODO: warning
		return Function.identity;
}

Function.Named = function NamedFunction(name, args, body, scope, values) {
	var i = 1;
	if (typeof args == "string")
		values = scope, scope = body, body = args, args = [];
	if (!Array.isArray(scope) || !Array.isArray(values)) {
		if (typeof scope == "object")
			values = Object.values(scope), scope = Object.keys(scope);
		else
		    values = [], scope = [];
	}
	return Function.apply(null, scope.concat("function "+name+" ("+args.join(", ")+") {\n"+body+"\n}\nreturn "+name+";")).apply(null, values);
};

Function.invoke = function(fn) {
	var args = Array.prototype.slice.call(arguments, 1);
	if (typeof fn == "function")
		return fn.argWith.apply(fn, args); // function(obj) { return fn.apply(obj, args); }
	else
		return function(obj) {
			return obj[fn].apply(obj, args);
		};
};

/* https://github.com/fantasyland/fantasy-land */
// Functor
Function.prototype.map = function map(g) {
	// Function.compose(g, this)
	var f = this;
	return function() {
		return g(f.apply(this, arguments));
	};
};

// Applicative
Function.prototype.ap = function ap(g) {
	var f = this;
	return function() {
		return f.apply(this, arguments)(g.apply(this, arguments));
	};
};
// Applicative, Monad
Function.prototype.of = Function.of = Function.const;

// Chain, Monad
// f.chain(g).chain(h) == ()=>h(g(f.apply()).apply()).apply() == ()=>g(f.apply()).chain(h).apply() == f.chain((x)=>g(x).chain(h))
Function.prototype.chain = function chain(g) {
	var f = this;
	return function() {
		return g(f.apply(this, arguments)).apply(this, arguments);
	};
};

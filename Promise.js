function Promise(fn) {
	var values, error;
	var successHandlers = [],
	    errorHandlers = [];
	
	this.fork = function(onsuccess, onerror) {
	// registers the onsuccess and onerror continuation handlers
	// if the promise is already resolved, it returns a continuation to execute them (and possibly others) asap
		if (!error && typeof onsuccess == "function")
			successHandlers.push(onsuccess);
		if (!values && typeof onerror == "function")
			errorHandlers.push(onerror);
		/* push them to the handlers arrays and return generic callbacks to prevent multiple executions, instead of just returning
		   Function.prototype.apply.bind(onsuccess, null, values); or Function.prototype.apply.bind(onerror, null, [error]); respectively */
		
		if (values)
			return Promise.makeCallback(successHandlers, values);
		else if (error)
			return Promise.makeCallback(errorHandlers, [error]);
		else
			return go; // go (the continuation of the fn call) might be returned (and then called) multiple times!
	};
	
	var go = fn(Promise.makeResolver(function fulfill() {
		if (values || error) throw new Error("cannot fulfill already resolved promise");
		values = arguments;
		errorHandlers.length = 0;
		return Promise.makeCallback(successHandlers, values);
	}), Promise.makeResolver(function reject(e) {
		if (values || error) throw new Error("cannot reject already resolved promise");
		error = e || new Error(e); // arguments?
		successHandlers.length = 0;
		return Promise.makeCallback(errorHandlers, [error]);
	}));
	setImmediate(Promise.run.bind(Promise, go)); // this in not very efficient, but ensures basic execution of "dependencies"
}
Promise.run = function run(cont) {
	while (typeof cont == "function")
		cont = cont();
};
Promise.makeCallback = function makeCallback(handlers, args) {
	if (!handlers.length) return;
	return handlers.runner || (handlers.runner = function runner() {
		if (!handlers.length) return;
		/* or just:
		while (handlers.length > 1) Promise.run(handlers.shift().apply(null, args));
		return handlers.shift().apply(null, args); */
		var next = handlers.shift().apply(null, args);
		if (!handlers.length) return next;
		Promise.run(next); // mutually recursive call fork for multiple handlers
		return runner;
	});
};
Promise.makeResolver = function makeResolver(r) {
	// extends a fulfill/reject resolver continuation with methods to actually execute them
	r.sync = function() {
		Promise.run(r.apply(this, arguments));
	};
	r.async = function() {
		setImmediate(Function.prototype.apply.bind(r.sync, this, arguments));
	};
	return r;
};

Promise.prototype.map = function chain(fn) {
	var promise = this;
	return new Promise(function(fulfill, reject) {
		return promise.fork(function() {
			return fulfill(fn.apply(this, arguments));
		}, reject);
	});
};
// Promise.prototype.mapError respectively

Promise.prototype.chain = function chain(fn) {
	var promise = this;
	return new Promise(function(fulfill, reject) {
		return promise.fork(function() {
			return fn.apply(this, arguments).fork(fulfill, reject);
		}, reject);
	})
};

Promise.of = function() {
	var args = arguments;
	return new Promise(function(f) {
		f.apply(null, args); // assert: === undefined
	});
};

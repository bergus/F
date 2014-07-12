function Promise(opt) {
	var values, error;
	var successHandlers = [],
	    errorHandlers = [];
	
	this.fork = function(onsuccess, onerror) {
	// registers the onsuccess and onerror continuation handlers
	// if the promise is already resolved, it returns a continuation to execute
	//    them (and possibly other waiting ones) so that the handlers are *not immediately* executed
	// if the promise is not yet resolved, but there is a continuation waiting to
	//    do so (and continuatively execute the handlers), that one is returned
	// else undefined is returned
		if (!error && typeof onsuccess == "function")
			successHandlers.push(onsuccess);
		if (!values && typeof onerror == "function")
			errorHandlers.push(onerror);
		/* push them to the handlers arrays and return generic callbacks to prevent multiple executions, instead of just returning
		   Function.prototype.apply.bind(onsuccess, null, values); or Function.prototype.apply.bind(onerror, null, [error]); respectively */
		
		if (values)
			return Promise.makeContinuation(successHandlers, values);
		else if (error)
			return Promise.makeContinuation(errorHandlers, [error]);
		else
			return go; // go (the continuation of the opt.call) might be returned (and then called) multiple times!
	};
	
	var go = opt.call(this, Promise.makeResolver(function fulfill() {
		if (values || error) return; // throw new Error("cannot fulfill already resolved promise");
		values = arguments;
		errorHandlers.length = 0;
		return Promise.makeContinuation(successHandlers, values);
	}), Promise.makeResolver(function reject(e) {
		if (values || error) return; // throw new Error("cannot reject already resolved promise");
		error = e || new Error(e); // arguments?
		successHandlers.length = 0;
		return Promise.makeContinuation(errorHandlers, [error]);
	}));
	Promise.runAsync(go); // this ensures basic execution of "dependencies"
}

Promise.run = function run(cont) {
	// scheduled continuations are not unscheduled. They just might be executed multiple times (but should not do anything twice)
	while (typeof cont == "function")
		cont = cont();
};
Promise.runAsync = function runAsync(cont) {
	if (typeof cont != "function" || cont.isScheduled) return;
	cont.isScheduled = true;
	setImmediate(Promise.run.bind(Promise, cont));
};

Promise.makeContinuation = function makeContinuation(handlers, args) {
	if (!handlers.length) return;
	return handlers.runner || (handlers.runner = function runner() {
		if (!handlers.length) return;
		while (handlers.length > 1)
			Promise.run(handlers.shift().apply(null, args)); // "mutually" recursive call to run() in case of multiple handlers
		return handlers.shift().apply(null, args);
	});
};
Promise.makeResolver = function makeResolver(r) {
	// extends a fulfill/reject resolver with methods to actually execute the continuations they might return
	r.sync = function() {
		Promise.run(r.apply(this, arguments));
	};
	r.async = function() {
		Promise.runAsync(r.apply(this, arguments)); // this creates the continuation immediately
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

Promise.reject = function() {
	var args = arguments;
	return new Promise(function(f, r) {
		r.apply(null, args); // assert: === undefined
	});
};

Promise.timeout = function(ms, v) {
	return new Promise(function(f) {
		setTimeout(f.sync.bind(f, v), ms);
	});
};

Promise.all = function(promises) {
	// if (arguments.length > 1) promise = Array.prototype.concat.apply([], arguments);
	return new Promise(function(fulfill, reject) {
		var length = promises.length,
			results = [new Array(length)];
		return Promise.makeContinuation(promises.map(function(promise, i) {
			return promise.fork(function(r) {
				if (arguments.length == 1)
					results[0][i] = r;
				else
					for (var j=0; j<arguments.length; j++) {
						if (results.length <= j)
							results[j] = [];
						results[j][i] = arguments[j];
					}
				if (--length == 0)
					return fulfill.apply(null, results);
			}, reject);
		}).filter(Boolean), []);
	});
};

/*
Promise.race = function(promises) {
	return new Promise(function(fulfill, reject) {
		return Promise.makeContinuation(promises.map(function(promise, i) {
			// 	for (var j=0; j<promises.length; j++)
			// 		if (j != i)
			// 			promises[j].cancel()
			return promise.fork(fulfill, reject); // throws!
		}).filter(Boolean), []);
	})
}; */

function FulfilledPromise(args) {
	var handlers = [];
	this.fork = function(onsuccess, onerror) {
		if (typeof onsuccess == "function")
			handlers.push(onsuccess);
		return Promise.makeContinuation(handlers, args);
	};
}
function RejectedPromise(args) {
	this.fork = function(onsuccess, onerror) {
		if (typeof onerror == "function")
			handlers.push(onerror);
		return Promise.makeContinuation(handlers, args);
	};
}
	
function AssimilatingPromise(opt) {
	var resolution = null,
	    handlers = [];
	
	this.fork = function(onsuccess, onerror) {
	// registers the onsuccess and onerror continuation handlers
	// if the promise is already resolved, it returns a continuation to execute
	//    them (and possibly other waiting ones) so that the handlers are *not immediately* executed
	// if the promise is not yet resolved, but there is a continuation waiting to
	//    do so (and continuatively execute the handlers), that one is returned
	// else undefined is returned
		if (resolution)
			return resolution.fork(onsuccess, onerror);
		handlers.push(arguments);
		return go; // go (the continuation of the opt.call) might be returned (and then called) multiple times!
	};
	
	var go = opt.call(this, function resolve(r) {
		if (resolution) return;
		resolution = r;
		for (var i=0; i<handlers.length; i++)
			var cont = resolution.fork(handlers[i][0], handlers[i][1]); // assert: cont always gets assigned the same value
		handlers = null;
		return cont;
	});
	Promise.runAsync(go); // this ensures basic execution of "dependencies"
}

function Promise(opt) {
	AssimilatingPromise.call(this, function(resolve) {
		return opt.call(this, Promise.makeResolver(resolve, FulfilledPromise), Promise.makeResolver(resolve, RejectedPromise));
	}) 
}

FulfilledPromise.prototype = RejectedPromise.prototype = AssimilatingPromise.prototype = Promise.prototype;

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
Promise.makeResolver = function makeResolver(resolve, constructor) {
	// creates a fulfill/reject resolver with methods to actually execute the continuations they might return
	function r() {
		return resolve(new constructor(arguments));
	}
	r.sync = function() {
		Promise.run(resolve(new constructor(arguments)));
	};
	r.async = function() {
		Promise.runAsync(resolve(new constructor(arguments))); // this creates the continuation immediately
	};
	return r;
};

Promise.prototype.map = function chain(fn) {
	var promise = this;
	return new AssimilatingPromise(function(resolve) {
		return promise.fork(function() {
			return resolve(Promise.of(fn.apply(this, arguments)));
		}, function() {
			return resolve(promise);
		});
	});
};
// Promise.prototype.mapError respectively

Promise.prototype.chain = function chain(fn) {
	var promise = this;
	return new AssimilatingPromise(function(resolve) {
		return promise.fork(function() {
			return resolve(fn.apply(this, arguments));
		}, function() {
			return resolve(promise);
		});
	})
};

Promise.of = function() {
	return new FulfilledPromise(arguments);
};
Promise.reject = function() {
	return new RejectedPromise(arguments);
};

Promise.timeout = function(ms, v) {
	return new Promise(function(f) {
		setTimeout(f.sync.bind(f, v), ms);
	});
};

Promise.all = function(promises) {
	// if (arguments.length > 1) promise = Array.prototype.concat.apply([], arguments);
	return new AssimilatingPromise(function(resolve) {
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
					return resolve(new FulfilledPromise(results));
			}, function() {
				return resolve(promise);
			});
		}).filter(Boolean), []);
	});
};

/*
Promise.race = function(promises) {
	return new AssimilatingPromise(function(fulfill, reject) {
		return Promise.makeContinuation(promises.map(function(promise, i) {
			// 	for (var j=0; j<promises.length; j++)
			// 		if (j != i)
			// 			promises[j].cancel()
			function done() {
				return resolve(promise);
			}
			return promise.fork(done, done);
		}).filter(Boolean), []);
	})
}; */

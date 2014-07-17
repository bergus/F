function Promise(opt) {
	var values, error;
	var successHandlers = [],
	    errorHandlers = [];
	
	this.fork = function(onsuccess, onerror) {
	// registers the onsuccess and onerror continuation handlers
	// it is expected that neither these handlers nor their continuations do throw
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
	this.send = function(name) {
		if (typeof opt[name] == "function") {
			var args = Array.prototype.slice.call(arguments, 1);
			return opt[name].apply(opt, args);
		} else if (opt.send)
			return opt.send.apply(opt, arguments);
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
	opt.call = null; // prevent it from being called again (by .send), don't leak
	Promise.runAsync(go); // this ensures basic execution of "dependencies"
}

Promise.run = function run(cont) {
	// scheduled continuations are not unscheduled. They just might be executed multiple times (but should not do anything twice)
	while (typeof cont == "function")
		cont = cont(); // assert: a continuation does not throw
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

Promise.TokenSource = function() {
	var cancellationTokens = [];
	this.get = function() {
		// if (promise.isSettled()) return;
		var token = {cancelled: false};
		cancellationTokens.push(token);
		return token;
	};
	this.revoke = function(token) {
		// revokes the token and returns whether there are none left
		if (token && !token.cancelled) {
			token.cancelled = true;
			var index = cancellationTokens.indexOf(token);
			if (index >= 0)
				cancellationTokens.splice(index, 1);
		}
		return !cancellationTokens.length;
	};
};
function CancellationError(message) {
	var error = new Error(message);
	error.cancelled = true;
	return error;
}
Promise.prototype.cancel = function(token) {
	// if (this.isSettled()) return; // TODO???
	Promise.run(this.send("cancel", token, new CancellationError("cancelled operation"))); // runAsync???
};

Promise.prototype.map = function chain(fn) {
	var promise = this;
	var token = promise.send("getCancellationToken"),
	    reject,
	    tokenSource = new Promise.TokenSource();
	return new Promise({
		call: function(p, fulfill, r) {
			reject = r;
			
			return promise.fork(function() {
				return fulfill(fn.apply(this, arguments));
			}, reject);
		},
		cancel: function(t, error) {
		// returns the rejection contination, or undefined if the promise was not cancelled
			if (tokenSource.revoke(t)) {
				return promise.send("cancel", token, error) || reject(error);
			}
		},
		getCancellationToken: tokenSource.get,
		send: promise.send
	});
};
// Promise.prototype.mapError respectively

Promise.prototype.chain = function chain(fn) {
	var promise = this;
	var token = promise.send("getCancellationToken"),
	    reject,
	    tokenSource = new Promise.TokenSource();
	return new Promise({
		call: function(p, fulfill, r) {
			reject = r;
			
			return promise.fork(function() {
				promise = fn.apply(this, arguments);
				if (!reject)
					return promise.send("cancel", new CancellationError("aim already cancelled"));
				
				token = promise.send("getCancellationToken");
				return promise.fork(fulfill, reject);
			}, reject);
		},
		cancel: function(t, error) {
		// returns the rejection contination, or undefined if the promise was not cancelled
			if (tokenSource.revoke(t)) {
				var cont = promise.send("cancel", token, error) || reject(error);
				reject = null;
				return cont;
			}
		},
		getCancellationToken: tokenSource.get,
		send: function() {
			// promise is reassigned above
			return promise.send.apply(promise, arguments);
		}
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

Promise.from = function(v) {
	if (v instanceof Promise) return v;
	// TODO: assimilate thenables
	// TODO: reject errors ???
	return Promise.of(v);
};

Promise.prototype.timeout = function(ms) {
	return Promise.timeout(ms, this);
};
Promise.timeout = function(ms, p) {
	return Promise.race([p, Promise.defer(ms).chain(function() {
		return Promise.reject(new Error("Timed out after "+ms+" ms"));
	})]);
};
Promise.prototype.defer = function(ms) {
	var promise = this;
	// a fulfillment will be held up until ms from now
	return this.chain(function() {
		var args = arguments,
		    timerId,
		    tokenSource = new Promise.TokenSource(),
		    reject;
		return new Promise({
			call: function(p, fulfill, r) {
				reject = r;
				
				timerId = setTimeout(function() {
					timerId = null;
					Promise.run(fulfill.apply(null, args));
				}, ms)
			},
			cancel: function(t, error) {
			// returns the rejection contination, or undefined if the promise was not cancelled
				if (tokenSource.revoke(t)) {
					if (timerId != null)
						clearTimeout(timerId);
					return reject(error);
				}
			},
			getCancellationToken: tokenSource.get,
			send: promise.send
		});
	});
};
Promise.defer = function(ms, v) {
	return Promise.from(v).defer(ms);
};

Promise.all = function(promises) {
	// if (arguments.length > 1) promise = Array.prototype.concat.apply([], arguments);
	var length = promises.length,
	    tokens = new Array(length),
	    tokenSource = new Promise.TokenSource();
	function cancelRest(continuations, error) {
		for (var j=0; j<length; j++) {
			if (tokens[j]) {
				var cont = promises[j].send("cancel", tokens[j], error);
				if (typeof cont == "function")
					continuations.push(cont);
			}
		}
		return Promise.makeContinuation(continuations, []);
	}
	return new Promise({
		call: function(p, fulfill, reject) {
			var results = [new Array(length)];
			return Promise.makeContinuation(promises.map(function(promise, i) {
				tokens[i] = promise.send("getCancellationToken");
				return promise.fork(function(r) {
					tokens[i] = null;
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
				}, function() {
					tokens[i] = null;
					var cont = reject.apply(null, arguments);
					return cancelRest(cont ? [cont] : [], new CancellationError("aim already rejected"));
				});
			}).filter(Boolean), []);
		},
		cancel: function(token, error) {
		// returns the rejection contination, or undefined if the promise was not cancelled
			if (tokenSource.revoke(token)) {
				return cancelRest([], error);
			}
		},
		getCancellationToken: tokenSource.get,
		send: function() {
			var args = arguments;
			return promises.map(function(promise) {
				return promise.send.apply(promise, args);
			});
		}
	});
};

Promise.race = function(promises) {
	var length = promises.length,
	    tokens = new Array(length),
	    tokenSource = new Promise.TokenSource();
	function cancelRest(continuations, error) {
		for (var j=0; j<length; j++) {
			if (tokens[j]) {
				var cont = promises[j].send("cancel", tokens[j], error);
				if (typeof cont == "function")
					continuations.push(cont);
			}
		}
		return Promise.makeContinuation(continuations, []);
	}
	return new Promise({
		call: function(p, fulfill, reject) {
			var results = [new Array(length)];
			return Promise.makeContinuation(promises.map(function(promise, i) {
				tokens[i] = promise.send("getCancellationToken");
				function makeCancellatingResolver(resolve) {
					return function() {
						tokens[i] = null;
						var cont = resolve.apply(null, arguments);
						return cancelRest(cont ? [cont] : [], new CancellationError("aim already resolved"));
					};
				}
				return promise.fork(makeCancellatingResolver(fulfill), makeCancellatingResolver(reject));
			}).filter(Boolean), []);
		},
		cancel: function(token, error) {
		// returns the rejection contination, or undefined if the promise was not cancelled
			if (tokenSource.revoke(token)) {
				return cancelRest([], error);
			}
		},
		getCancellationToken: tokenSource.get,
		send: function() {
			var args = arguments;
			return promises.map(function(promise) {
				return promise.send.apply(promise, args);
			});
		}
	});
};

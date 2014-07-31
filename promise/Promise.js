"use strict";

function makeResolvedPromiseConstructor(state, removable) {
	return function ResolvedPromise(args) {
		var handlers = [],
		    that = this;
		function runHandlers() {
			if (!handlers.length) return;
			var continuations = [];
			for (var i=0; i<handlers.length; i++) {
				var subscription = handlers[i];
				if (isCancelled(subscription.token)) continue;
				var cont = subscription[state]
				  ? subscription[state].apply(null, args)
				  : subscription.assimilate(that);
				if (typeof cont == "function")
					continuations.push(cont);
			}
			handlers.length = 0;
			return ContinuationBuilder.join(continuations);
		}
		this.fork = function forkResolved(subscription) {
			// TODO: assimilate depends on .fork() always returning the same runHandlers continuation
			if (isCancelled(subscription.token)) return runHandlers;
			var toHandle = typeof subscription[state] == "function";
			if (toHandle) subscription.assimilate = null;
			if (toHandle || typeof subscription.assimilate == "function") {
				subscription[removable] = null;
				// push them to the handlers arrays and return a generic callback to prevent multiple executions,
				// instead of just returning Function.prototype.apply.bind(handler, null, args);
				handlers.push(subscription);
				// TODO: Are there cases where we can safely (and should) do assimilation in fork()?
			}
			return runHandlers;
		};
	}
}
var FulfilledPromise = makeResolvedPromiseConstructor("success", "error");
var RejectedPromise =  makeResolvedPromiseConstructor("error", "success");
	
function AssimilatingPromise(opt) {
	var resolution = null,
	    handlers = [],
	    that = this;
	
	this.fork = function forkAssimilating(subscription) {
	// registers the onsuccess and onerror continuation handlers
	// it is expected that neither these handlers nor their continuations do throw
	// if the promise is already resolved, it returns a continuation to execute
	//    them (and possibly other waiting ones) so that the handlers are *not immediately* executed
	// if the promise is not yet resolved, but there is a continuation waiting to
	//    do so (and continuatively execute the handlers), that one is returned
	// else undefined is returned
		if (resolution) {
			// if (this instanceof Promise) this.fork = resolution.fork; TODO ???
			return resolution.fork(subscription);
		}
		handlers.push(subscription);
		return go; // go (the continuation of the opt.call) might be returned (and then called) multiple times!
	};
	
	var go = opt.call(this, function assimilate(r) {
		if (resolution) return; // throw new Error("cannot assimilate different promises");
		if (r == that) throw new TypeError("Promise::constructor.assimilate: cannot assimilate itself");
		// TODO: BUG: Instead of throwing, A+ 2.3.1 requests rejection
		resolution = r;
		// that.fork = resolution.fork; TODO ??? Does not necessarily work well if resolution is a pending promise
		for (var i=0; i<handlers.length; i++)
			var cont = resolution.fork(handlers[i]); // assert: cont always gets assigned the same value
		handlers = null;
		// if (cont && cont.isScheduled) cont.unSchedule() TODO ??? The result of a chain is usually already
		//                                                          scheduled, but we are going to execute it
		return cont;
	}, function isCancellable(token) {
		// tests whether there are no (more) CancellationTokens registered with the promise,
		// and sets the token state accordingly
		if (token.isCancelled) return true;
		if (!handlers) return token.isCancelled = true; // TODO: Is it acceptable to revoke the associated token after a promise has been resolved?
		// remove cancelled subscriptions (whose token has been revoked)
		for (var i=0, j=0; i<handlers.length; i++)
			if (!isCancelled(handlers[i].token) && j++!=i)
				handlers[j] = handlers[i];
		handlers.length = j;
		return token.isCancelled = !j;
	});
	if (opt.send)
		this.send = opt.send; // .bind(opt) ???
	
	Promise.runAsync(go); // this ensures basic execution of "dependencies"
}

function Promise(opt) {
	AssimilatingPromise.call(this, function callResolver(assimilate) {
		function makeResolver(constructor) {
		// creates a fulfill/reject resolver with methods to actually execute the continuations they might return
			function resolve() {
				return assimilate(new constructor(arguments));
			}
			resolve.sync = function resolveSync() {
				Promise.run(assimilate(new constructor(arguments)));
			};
			resolve.async = function resolveAsync() {
				Promise.runAsync(assimilate(new constructor(arguments))); // this creates the continuation immediately
			};
			return resolve;
		}
		// TODO: make a resolver that also accepts promises, not only plain fulfillment values
		return opt.call(this, makeResolver(FulfilledPromise), makeResolver(RejectedPromise));
	}) 
}

FulfilledPromise.prototype = RejectedPromise.prototype = AssimilatingPromise.prototype = Promise.prototype;

Promise.run = function run(cont) {
	// scheduled continuations are not unscheduled. They just might be executed multiple times (but should not do anything twice)
	while (typeof cont == "function")
		cont = cont(); // assert: a continuation does not throw
};
Promise.runAsync = function runAsync(cont) {
	if (typeof cont != "function" || cont.isScheduled) return;
	cont.isScheduled = true;
	setImmediate(function asyncRun() {
		cont.isScheduled = false;
		Promise.run(cont);
	});
};

function ContinuationBuilder(continuations) {
	if (continuations) {
		// filter out non-function values
		for (var i=0, j=0; i<continuations.length; i++)
			if (typeof continuations[i] == "function")
				continuations[j++] = continuations[i];
		continuations.length = j;
		this.continuations = continuations;
	} else
		this.continuations = [];
}
ContinuationBuilder.prototype.add = function(cont) { 
	if (typeof cont == "function")
		this.continuations.push(cont);
	return this;
};
ContinuationBuilder.prototype.get = function() {
	return ContinuationBuilder.join(this.continuations);
};
ContinuationBuilder.join = function joinContinuations(continuations) {
	if (continuations.length <= 1) return continuations[0];
	return function runBranches() {
		var l = continuations.length;
		if (!l) return;
		for (var i=0, j=0; i<l; i++) {
			var cont = continuations[i];
			cont = cont(); // assert: cont != runBranches ???
			if (typeof cont == "function")
				continuations[j++] = cont;
		}
		continuations.length = j;
		return (j <= 1) ? continuations[0] : runBranches;
	};
};

Promise.prototype.send = function noop() {};

Promise.prototype.cancel = function cancel(reason, token) {
	// TODO: assert:  promise  is still pending. Return false otherwise.
	if (!(reason && reason instanceof Error && reason.cancelled===true))
		reason = new CancellationError(reason || "cancelled operation");
	if (token)
		token.isCancelled = true; // revoke it
	Promise.run(this.send("cancel", reason)); // TODO: asnyc?
};

function CancellationError(message) {
	// TODO: inherit from Error prototypical, not parasitic
	var error = new Error(message);
	error.name = "CancellationError";
	error.cancelled = true;
	return error;
}
function isCancelled(token) {
	// it is cancelled when token exists, and .isCancelled yields true
	return !!token && (token.isCancelled === true || (token.isCancelled !== false && token.isCancelled()));
}
function makeMapping(createSubscription) {
	return function map(fn) {
		var promise = this;
		return new AssimilatingPromise(function mapResolver(assimilate, isCancellable) {
			var token = {isCancelled: false};
			this.send = function mapSend(msg, error) {
				if (msg != "cancel") return promise.send.apply(promise, arguments);
				if (isCancellable(token))
					return new ContinuationBuilder([
						promise.send(msg, error),
						assimilate(Promise.reject(error))
					]).get();
			};
			return promise.fork(createSubscription({ 
				assimilate: assimilate,
				token: token
			}, function mapper() {
				return assimilate(Promise.of(fn.apply(this, arguments)));
			}));
		});
	};
}
Promise.prototype.map      = makeMapping(function(s, m) { s.success = m; return s; }); // Object.set("success")
Promise.prototype.mapError = makeMapping(function(s, m) { s.error   = m; return s; }); // Object.set("error")

Promise.prototype.chain = function chain(onfulfilled, onrejected, explicitToken) {
	var promise = this;
	return new AssimilatingPromise(function chainResolver(assimilate, isCancellable) {
		var cancellation = null;
		var token = explicitToken || {isCancelled: false};
		this.send = function chainSend(msg, error) {
			if (msg != "cancel") return promise && promise.send.apply(promise, arguments);
			if (explicitToken ? isCancelled(explicitToken) : isCancellable(token)) {
				if (!promise) // there currently is no dependency, store for later
					cancellation = error; // new CancellationError("aim already cancelled") ???
				return new ContinuationBuilder([
					promise && promise.send(msg, error),
					assimilate(Promise.reject(error))
				]).get();
			}
		};
		function makeChainer(fn) {
			return function chainer() {
				promise = null;
				promise = fn.apply(this, arguments);
				if (cancellation) // the fn() call did cancel us:
					return promise.send("cancel", cancellation); // revenge!
				else
					return promise.fork({assimilate: assimilate, token: token});
			};
		}
		return promise.fork({
			success: onfulfilled && makeChainer(onfulfilled),
			error: onrejected && makeChainer(onrejected),
			assimilate: assimilate,
			token: token
		});
	})
};

Promise.of = Promise.fulfill = function of() {
	return new FulfilledPromise(arguments);
};
Promise.reject = function reject() {
	return new RejectedPromise(arguments);
};

Promise.from = Promise.cast = function from(v) {
	// wraps non-promises, assimilates thenables (non Promise/A+ conformant, though, see Promise.resolve for that)
	if (v instanceof Promise) return v;
	if (Object(v) === v && typeof v.then == "function")
		return new Promise(function(fulfill, reject) {
			v.then(fulfill.async, reject.async); // TODO: support progression and cancellation
		});
	// TODO: reject if v instanceof Error ???
	return Promise.of(v);
};

Promise.method = function wrapPromise(fn) {
	// wrap a possibly-synchronous function to return a promise
	return function promisingMethod() {
		try {
			return Promise.from(fn.apply(this, arguments))
		} catch(e) {
			return Promise.reject(e);
		}
	};
}

Promise.prototype.timeout = function(ms) {
	return Promise.timeout(ms, this);
};
Promise.timeout = function(ms, p) {
	return Promise.race([p, Promise.defer(ms).chain(function() {
		return Promise.reject(new Error("Timed out after "+ms+" ms"));
	})]);
};
Promise.prototype.defer = function(ms) {
	// a fulfillment will be held up for ms
	var promise = this;
	return this.chain(function() {
		// var promise = new FulfilledPromise(arguments);
		return new AssimilatingPromise(function(assimilate, isCancellable) {
			var timerId = setTimeout(function() {
				timerId = null;
				Promise.run(assimilate(promise));
			}, ms);
			this.send = function deferSend(msg, error) {
				if (msg != "cancel") return promise.send.apply(promise, arguments);
				if (isCancellable()) {
					if (timerId != null)
						clearTimeout(timerId);
					return assimilate(Promise.reject(error));
				}
			};
		});
	});
};
Promise.defer = function(ms, v) {
	return Promise.from(v).defer(ms);
};

Promise.all = function all(promises, opt) {
	if (!Array.isArray(promises)) {
		promises = arguments;
		opt = 2;
	}
	var spread = opt & 2,
	    notranspose = opt & 1;
	return new AssimilatingPromise(function allResolver(assimilate, isCancellable) {
		var length = promises.length,
		    token = {isCancelled: false},
		    left = length,
		    results = [new Array(length)],
		    waiting = new Array(length),
		    width = 1;
		function cancelRest(continuations, error) {
			for (var j=0; j<length; j++)
				if (waiting[j])
					continuations.add(promises[j].send("cancel", error));
			return continuations.get();
		}
		this.send = function allSend(msg, error) {
			if (msg != "cancel") {
				var args = arguments;
				return promises.map(function(promise) {
					// TODO: exclude already resolved ones?
					return promise.send.apply(promise, args);
				});
			}
			if (isCancellable(token))
				return cancelRest(new ContinuationBuilder(), error);
		};
		return new ContinuationBuilder(promises.map(function(promise, i) {
			return promise.fork({
				success: function allCallback(r) {
					waiting[i] = null;
					var l = arguments.length;
					if (notranspose)
						results[0][i] = arguments;
					else if (l == 1 || spread)
						results[0][i] = r;
					else {
						while (width < l)
							results[width++] = new Array(length);
						for (var j=0; j<l; j++)
							results[j][i] = arguments[j];
					}
					if (--left == 0)
						return assimilate(new FulfilledPromise(spread ? results[0] : results));
				},
				assimilate: function(/*promise*/) {
					waiting[i] = null;
					var conts = new ContinuationBuilder().add(assimilate(promise));
					token.isCancelled = true; // revoke
					return cancelRest(conts, new CancellationError("aim already rejected"));
				},
				token: waiting[i] = token
			});
		})).get();
	});
};

Promise.race = function(promises) {
	return new AssimilatingPromise(function raceResolver(assimilate, isCancellable) {
		var token = {isCancelled: false};
		function cancelExcept(i, continuations, error) {
			for (var j=0; j<length; j++)
				if (i != j)
					continuations.add(promises[j].send("cancel", error));
			return continuations.get();
		}
		this.send = function raceSend(msg, error) {
			if (msg != "cancel") {
				var args = arguments;
				return promises.map(function(promise) {
					return promise.send.apply(promise, args);
				});
			}
			if (isCancellable(token))
				return cancelExcept(-1, new ContinuationBuilder(), error);
		};
		return new ContinuationBuilder(promises.map(function(promise, i) {
			return promise.fork({
				assimilate: function raceWinner(/*promise*/) {
					var conts = new ContinuationBuilder().add(assimilate(promise));
					token.isCancelled = true; // revoke
					return cancelExcept(i, conts, new CancellationError("aim already resolved"));
				},
				token: token
			});
		}));
	});
};

Promise.prototype.then = function then(onfulfilled, onrejected, onprogress, token) {
	return this.chain(makeThenHandler(onfulfilled), makeThenHandler(onrejected), onprogress, token);
};
function makeThenHandler(fn) {
	if (typeof fn != "function") {
		if (fn != null) console.warn("Promise::then: You must pass a function callback or null, instead of", fn);
		return null;
	}
	return function thenHandler() {
		// get a value from the fn, and apply https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
		try {
			var v = fn.apply(undefined, arguments); // A+ 2.2.5 "must be called as functions (i.e. with no  this  value)"
			// if (v instanceof Promise) return v; // A+ 2.3.2 "If x is a promise, adopt its state"
			// if (v === undefined) console.warn("Promise::then: callback did not return a result value")
			if (Object(v) !== v) return Promise.of(v); // A+ 2.3.4 "If x is not an object or function, fulfill promise with x."
			var then = v.then; // A+ 2.3.3.1 (Note: "avoid multiple accesses to the .then property")
		} catch(e) {
			return Promise.reject(e); // A+ 2.2.7.2, 2.3.3.2 "if […] throws an exception e, reject with e as the reason."
		}
		if (typeof then != "function") // A+ 2.3.3.4 "If then is not a function, fulfill promise with x"
			return Promise.of(v);
		return new Promise(function thenableResolver(fulfill, reject) {
			try {
				// A+ 2.3.3.3 "call then with x as this, first argument resolvePromise, and second argument rejectPromise"
				then.call(v, fulfill.async, reject.async); // TODO: support progression and cancellation
			} catch(e) { // A+ 2.3.3.3.4 "If calling then throws an exception e"
				reject.async(e); "reject promise with e as the 	reason (unless already resolved)"
			}
		}).chain(Promise.resolve); // A+ 2.3.3.3.1 "when resolvePromise is called with a value y, run [[Resolve]](promise, y)" (recursively)
	};
}
Promise.resolve = makeThenHandler(function getResolveValue(v) {
	// like Promise.cast/from, but also does recursive unwrapping for thenables, and always returns a new promise 
	// if (v instanceof Promise) // not exactly an identity function:
	//	return v.chain(); // a new Promise assimilating v
	return v;
});

if (typeof module == "object" && module.exports)
	module.exports = Promise;

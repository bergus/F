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
	    handlers = [];
	
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
		resolution = r;
		// that.fork = resolution.fork; TODO ??? Does not necessarily work well if resolution is a pending promise
		for (var i=0; i<handlers.length; i++)
			var cont = resolution.fork(handlers[i]); // assert: cont always gets assigned the same value
		handlers = null;
		// if (cont && cont.isScheduled) cont.unSchedule() TODO ??? The result of a chain is usually already
		//                                                          scheduled, but we are going to execute it
		return cont; // TODO: resolved's fork depends on returning no other continuation
	}, handlers); // TODO: leaks handlers?
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
	setImmediate(Promise.run.bind(Promise, cont));
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

function implicitCancellationToken(registeredHandlers) {
	return {
		isCancelled: false,
		update: function() {
			// remove cancelled subscriptions (whose token has been revoked)
			for (var i=0, j=0; i<registeredHandlers.length; i++)
				if (!isCancelled(registeredHandlers[i].token) && j++!=i)
					registeredHandlers[j] = registeredHandlers[i];
			registeredHandlers.length = j;
			if (!j) // if none are left
				this.isCancelled = true; // revoke the implicit token
		}
	};
}
function isCancelled(token) {
	// it is cancelled when token exists, and .isCancelled yields true
	return !!token && (token.isCancelled === true || (token.isCancelled !== false && token.isCancelled()));
}

Promise.prototype.map = function map(fn) {
	var promise = this;
	return new AssimilatingPromise(function mapResolver(assimilate, registeredHandlers) {
		var token = implicitCancellationToken(registeredHandlers);
		this.send = function mapSend(msg, error) {
			if (msg != "cancel") return promise.send.apply(promise, arguments);
			token.update();
			if (isCancelled(token))
				return new ContinuationBuilder([
					promise.send(msg, error),
					assimilate(Promise.reject(error))
				]).get();
		};
		return promise.fork({
			success: function mapper() {
				return assimilate(Promise.of(fn.apply(this, arguments)));
			},
			assimilate: assimilate,
			token: token
		});
	});
};
// Promise.prototype.mapError respectively

Promise.prototype.chain = function chain(fn, _, token) {
	var promise = this;
	return new AssimilatingPromise(function chainResolver(assimilate, registeredHandlers) {
		var cancellation = null;
		if (!token) token = implicitCancellationToken(registeredHandlers);
		this.send = function chainSend(msg, error) {
			if (msg != "cancel") return promise && promise.send.apply(promise, arguments);
			if (typeof token.update == "function") token.update();
			if (isCancelled(token)) {
				if (!promise) // there currently is no dependency, store for later
					cancellation = error; // new CancellationError("aim already cancelled") ???
				return new ContinuationBuilder([
					promise && promise.send(msg, error),
					assimilate(Promise.reject(error))
				]).get();
			}
		};
		return promise.fork({
			success: function chainer() {
				promise = null;
				promise = fn.apply(this, arguments);
				if (cancellation) // the fn() call did cancel us:
					return promise.send("cancel", cancellation); // revenge!
				else
					return promise.fork({assimilate: assimilate, token: token});
			},
			assimilate: assimilate,
			token: token
		});
	})
};

Promise.of = function of() {
	return new FulfilledPromise(arguments);
};
Promise.reject = function reject() {
	return new RejectedPromise(arguments);
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
	// BUG TODO: implement new style cancellation
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

Promise.all = function all(promises) {
	// BUG TODO: implement new style cancellation
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
		return ContinuationBuilder.join(continuations);
	}
	return new Promise({
		call: function(p, fulfill, reject) {
			var left = length,
			    results = [new Array(length)],
			    width = 1;
			return ContinuationBuilder.join(promises.map(function(promise, i) {
				tokens[i] = promise.send("getCancellationToken");
				return promise.fork(function(r) {
					tokens[i] = null;
					var l = arguments.length;
					if (l == 1)
						results[0][i] = r;
					else {
						while (width < l)
							results[width++] = new Array(length);
						for (var j=0; j<l; j++)
							results[j][i] = arguments[j];
					}
					if (--left == 0)
						return fulfill.apply(null, results);
				}, function() {
					tokens[i] = null;
					var cont = reject.apply(null, arguments);
					return cancelRest(cont ? [cont] : [], new CancellationError("aim already rejected"));
				});
			}).filter(Boolean));
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
	// BUG TODO: implement new style cancellation
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
		return ContinuationBuilder.join(continuations);
	}
	return new Promise({
		call: function(p, fulfill, reject) {
			var results = [new Array(length)];
			return ContinuationBuilder.join(promises.map(function(promise, i) {
				tokens[i] = promise.send("getCancellationToken");
				function makeCancellatingResolver(resolve) {
					return function() {
						tokens[i] = null;
						var cont = resolve.apply(null, arguments);
						return cancelRest(cont ? [cont] : [], new CancellationError("aim already resolved"));
					};
				}
				return promise.fork(makeCancellatingResolver(fulfill), makeCancellatingResolver(reject));
			}).filter(Boolean));
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
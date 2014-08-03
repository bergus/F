"use strict";

function makeResolvedPromiseConstructor(state, removable) {
	return function ResolvedPromise(args) {
		var that = this;
		/* var handlers = [],
		    that = this;
		function runHandlers() {
			if (!handlers.length) return;
			var continuations = [];
			for (var i=0; i<handlers.length; i++) {
				var subscription = handlers[i];
				if (isCancelled(subscription.token)) continue;
				var cont = subscription[state]
				  ? subscription[state].apply(null, args)
				  : subscription.proceed(that);
				if (typeof cont == "function")
					continuations.push(cont);
			}
			handlers.length = 0;
			return ContinuationBuilder.join(continuations);
		} */
		this.fork = function forkResolved(subscription) {
			// TODO: adopt depends on .fork() always returning the same runHandlers continuation
			if (isCancelled(subscription.token)) return;
			var toHandle = typeof subscription[state] == "function",
			    toProceed = typeof subscription.proceed == "function";
			if (!toHandle && !toProceed) return;
			subscription[removable] = null;
			if (toHandle) {
				subscription.proceed = null;
				// return a generic callback to prevent multiple executions,
				// instead of just returning Function.prototype.apply.bind(handler, null, args);
				return function runHandler() {
					if (!subscription) return; // throw new Error("unsafe continuation");
					if (isCancelled(subscription.token)) return;
					var handler = subscription[state];
					subscription = null;
					return handler.apply(null, args);
				};
			} else { // if (toProceed)
				return subscription.proceed(that);
			}
		};
	}
}
var FulfilledPromise = makeResolvedPromiseConstructor("success", "error");
var RejectedPromise =  makeResolvedPromiseConstructor("error", "success");
	
function AdoptingPromise(opt) {
// a promise that will at one point in the future adopt a given other promise
// and from then on will behave identical to that adopted promise
// since it is no more cancellable once settled on a certain promise, that one is typically a resolved one 
	var resolution = null,
	    handlers = [],
	    that = this;
	
	this.fork = function forkAdopting(subscription) {
	// registers the onsuccess and onerror continuation handlers
	// it is expected that neither these handlers nor their continuations do throw
	// if the promise is already resolved, it returns a continuation to execute
	//    them (and possibly other waiting ones) so that the handlers are *not immediately* executed
	// if the promise is not yet resolved, but there is a continuation waiting to
	//    do so (and continuatively execute the handlers), that one is returned
	// else undefined is returned
		if (resolution) {
			// if (this instanceof Promise) this.fork = resolution.fork; TODO ???
			// if (this.fork == forkAdopting) this.fork = resolution.fork; better ???
			return resolution.fork(subscription);
		}
		if (subscription.proceed == adopt) // A+ 2.3.1: "If promise and x refer to the same object," (instead of throwing)
			return adopt(Promise.reject(new TypeError("Promise/fork: not going to wait to assimilate itself"))); // "reject promise with a TypeError as the reason"
		handlers.push(subscription);
		return function advanceSubscription() {
			if (subscription) {
				if (subscription.lazy)
					return subscription.lazy();
				else
					subscription.lazy = false;
				subscription = null;
			} // else throw new Error("unsafe continuation");
			return go;
		}
	};
	function adopt(r) {
		if (resolution) return; // throw new Error("cannot adopt different promises");
		resolution = r;
		that.fork = resolution.fork; // shortcut unnecessary calls, collect garbage methods
		var conts = new ContinuationBuilder();
		for (var i=0; i<handlers.length; i++) {
			var subscription = handlers[i];
			var c = resolution.fork(subscription);
			if (subscription.lazy === false)
				conts.add(c); // TODO: better create a single runHandlers continuation?
			else subscription.lazy = c;
		}
		handlers = null;
		// advanceAdopting = go; TODO: Unwrap the go continuation once it got here
		return conts.get();
	}
	var go = opt.call(this, adopt, function isCancellable(token) {
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
	/* wrap go() in a safe continuation
	TODO: without creating a non-constant number of unncessary stackframes
	function advanceAdopting() {
		if (typeof go != "function") return advanceAdopting = undefined;
		var next = go(); // the continuation of the opt.call must not be called multiple times
		if (next == go) // consider it being a self-returning threadsafe one
			return advanceAdopting = next;
		go = next;
		return advanceAdopting;
	}; */
}

function Promise(opt) {
	AdoptingPromise.call(this, function callResolver(adopt) {
		function makeResolver(constructor) {
		// creates a fulfill/reject resolver with methods to actually execute the continuations they might return
			function resolve() {
				return adopt(new constructor(arguments));
			}
			resolve.sync = function resolveSync() {
				Promise.run(adopt(new constructor(arguments)));
			};
			resolve.async = function resolveAsync() {
				Promise.runAsync(adopt(new constructor(arguments))); // this creates the continuation immediately
			};
			return resolve;
		}
		// TODO: make a resolver that also accepts promises, not only plain fulfillment values
		return opt.call(this, makeResolver(FulfilledPromise), makeResolver(RejectedPromise));
	}) 
}

FulfilledPromise.prototype = RejectedPromise.prototype = AdoptingPromise.prototype = Promise.prototype;

Promise.run = function run(cont) {
	// scheduled continuations are not unscheduled. They just might be executed multiple times (but should not do anything twice)
	while (typeof cont == "function")
		cont = cont(); // assert: a continuation does not throw
};
Promise.runAsync = function runAsync(cont) {
	if (typeof cont != "function" || cont.isScheduled) return cont;
	var timer = setImmediate(function asyncRun() {
		timer = null;
		cont.isScheduled = instantCont.isScheduled = false;
		Promise.run(cont);
		cont = null;
	});
	function instantCont() {
		if (!timer) return;
		clearImmediate(timer);
		return cont();
	}
	cont.isScheduled = instantCont.isScheduled = true;
	return instantCont;
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
ContinuationBuilder.prototype.each = function(elements, iterator) {
	for (var i=0, cont; i<elements.length; i++)
		if (typeof (cont = iterator(elements[i])) == "function")
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

Promise.of = Promise.fulfill = function of() {
	return new FulfilledPromise(arguments);
};
Promise.reject = function reject() {
	return new RejectedPromise(arguments);
};

function makeMapping(createSubscription, build) {
	return function map(fn) {
		var promise = this;
		return new AdoptingPromise(function mapResolver(adopt, isCancellable) {
			var token = {isCancelled: false};
			this.send = function mapSend(msg, error) {
				if (msg != "cancel") return promise.send.apply(promise, arguments);
				if (isCancellable(token))
					return new ContinuationBuilder([
						promise.send(msg, error),
						adopt(Promise.reject(error))
					]).get();
			};
			return promise.fork(createSubscription(function mapper() {
				return adopt(build(fn.apply(this, arguments)));
			}, {
				proceed: adopt,
				token: token
			}));
		});
	};
}
Promise.prototype.map      = makeMapping(function(m, s) { s.success = m; return s; }, Promise.of); // Object.set("success")
Promise.prototype.mapError = makeMapping(function(m, s) { s.error   = m; return s; }, Promise.reject); // Object.set("error")

function makeChaining(execute) {
	return function chain(onfulfilled, onrejected, explicitToken) {
		var promise = this;
		return new AdoptingPromise(function chainResolver(adopt, isCancellable) {
			var cancellation = null;
			var token = explicitToken || {isCancelled: false};
			this.send = function chainSend(msg, error) {
				if (msg != "cancel") return promise && promise.send.apply(promise, arguments);
				if (explicitToken ? isCancelled(explicitToken) : isCancellable(token)) {
					if (!promise) // there currently is no dependency, store for later
						cancellation = error; // new CancellationError("aim already cancelled") ???
					return new ContinuationBuilder([
						promise && promise.send(msg, error),
						adopt(Promise.reject(error))
					]).get();
				}
			};
			function makeChainer(fn) {
				return function chainer() {
					promise = null;
					promise = fn.apply(undefined, arguments); // A+ 2.2.5 "must be called as functions (i.e. with no  this  value)"
					if (cancellation) // the fn() call did cancel us:
						return promise.send("cancel", cancellation); // revenge!
					else
						return promise.fork({proceed: adopt, token: token});
				};
			}
			return execute(promise.fork({
				success: onfulfilled && makeChainer(onfulfilled),
				error: onrejected && makeChainer(onrejected),
				proceed: adopt,
				token: token
			}));
		});
	};
}
Promise.prototype.chainStrict = makeChaining(Promise.runAsync);
Promise.prototype.chain       = makeChaining(function(c){ return c; }); // Function.identity

Promise.method = function makeThenHandler(fn, warn) {
// returns a function that executes fn safely (catching thrown exceptions),
// and applies the A+ promise resolution procedure on the result so that it always yields a promise
	if (typeof fn != "function") {
		if (warn && fn != null) console.warn(warn + ": You must pass a function callback or null, instead of", fn);
		return null;
	}
	return function thenableResolvingHandler() {
		// get a value from the fn, and apply https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
		try {
			var v = fn.apply(this, arguments);
			if (v instanceof Promise) return v; // A+ 2.3.2 "If x is a promise, adopt its state"
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
};

// wraps non-promises, adopts thenables (recursively), returns passed Promises directly
Promise.from = Promise.cast = Promise.method(function identity(v) { return v; }); // Function.identity

// like Promise.cast/from, but always returns a new promise
Promise.resolve = Promise.method(function getResolveValue(v) {
	if (v instanceof Promise) return v.chain(); // a new Promise (assimilating v)
	return v;
});

Promise.prototype.then = function then(onfulfilled, onrejected, onprogress, token) {
	return this.chainStrict(Promise.method(onfulfilled, "Promise::then"), Promise.method(onrejected, "Promise::then"), onprogress, token);
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
	// a fulfillment will be held up for ms
	var promise = this;
	return this.chain(function() {
		// var promise = new FulfilledPromise(arguments);
		return new AdoptingPromise(function(adopt, isCancellable) {
			var timerId = setTimeout(function() {
				timerId = null;
				Promise.run(adopt(promise));
			}, ms);
			this.send = function deferSend(msg, error) {
				if (msg != "cancel") return promise.send.apply(promise, arguments);
				if (isCancellable()) {
					if (timerId != null)
						clearTimeout(timerId);
					return adopt(Promise.reject(error));
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
	return new AdoptingPromise(function allResolver(adopt, isCancellable) {
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
						return adopt(new FulfilledPromise(spread ? results[0] : results));
				},
				proceed: function(/*promise*/) {
					waiting[i] = null;
					var conts = new ContinuationBuilder().add(adopt(promise));
					token.isCancelled = true; // revoke
					return cancelRest(conts, new CancellationError("aim already rejected"));
				},
				token: waiting[i] = token
			});
		})).get();
	});
};

Promise.race = function(promises) {
	return new AdoptingPromise(function raceResolver(adopt, isCancellable) {
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
				proceed: function raceWinner(/*promise*/) {
					var conts = new ContinuationBuilder().add(adopt(promise));
					token.isCancelled = true; // revoke
					return cancelExcept(i, conts, new CancellationError("aim already resolved"));
				},
				token: token
			});
		}));
	});
};

if (typeof module == "object" && module.exports)
	module.exports = Promise;
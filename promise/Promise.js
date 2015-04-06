"use strict";

function makeResolvedPromiseConstructor(state, removable) {
	return function ResolvedPromise(args) {
		var that = this,
		    handlers = null;
		function runHandlers() {
			if (!handlers) return;
			var continuations = new ContinuationBuilder();
			for (var i=0; i<handlers.length;) {
				var subscription = handlers[i++];
				if (i == handlers.length) // when looking at the last subscription
					i = handlers.length = 0; // clear the handlers array even before executing, to prevent building an adoption stack
					                         // alternatively do subscription = handlers.shift() TODO performance test
				if (isCancelled(subscription.token)) continue;
				if (subscription[state]) {
					continuations.add(subscription[state].apply(null, args));
				} else if (subscription.proceed) {
					var cont = subscription.proceed(that);
					if (cont != runHandlers) continuations.add();
				} else if (subscription.instruct) {
					for (var i=0; i<subscription.instruct.length; i++) {
						var sub = subscription.instruct[i];
						if (sub.lazy !== false) { // filter out lazy handlers
							sub.lazy = true;
							sub.resolution = that;
						} else
							handlers.push(sub);
					}
					subscription.instruct = null;
				}
			}
			// assert: handlers.length == 0
			handlers = null;
			return continuations.get();
		}
		this.fork = function forkResolved(subscription) {
			if (isCancelled(subscription.token)) return;
			subscription[removable] = null;
			if (typeof subscription[state] == "function") {
				subscription.proceed = subscription.instruct = null;
				// return a generic callback to prevent multiple executions,
				// instead of just returning Function.prototype.apply.bind(handler, null, args);
				return function runHandler() {
					if (!subscription) return; // throw new Error("unsafe continuation");
					if (isCancelled(subscription.token)) return;
					var handler = subscription[state];
					subscription = null;
					return handler.apply(null, args);
				};
			} else if (typeof subscription.proceed == "function") {
				return subscription.proceed(that); // TODO should not execute immediately?
			} else if (subscription.instruct && subscription.instruct.length) {
				var j = 0;
				if (!handlers)
					handlers = subscription.instruct;
				else
					j = handlers.length;
				for (var i=0; i<subscription.instruct.length; i++) {
					var sub = subscription.instruct[i];
					if (sub.lazy !== false) { // filter out lazy handlers
						sub.lazy = true;
						sub.resolution = that;
					//} else if (handlers == subscription.instruct) {
					//	if (j++ != i)
					//		handlers[j] = sub;
					} else
						handlers[j++] = sub;
				}
				handlers.length = j;
				subscription.instruct = null;
				// TODO? remove progress/removable from handlers right now
				return runHandlers;
			}
		};
	}
}
var FulfilledPromise = makeResolvedPromiseConstructor("success", "error");
var RejectedPromise =  makeResolvedPromiseConstructor("error", "success");
	
function AdoptingPromise(fn) {
// a promise that will at one point in the future adopt a given other promise
// and from then on will behave identical to that adopted promise
// since it is no more cancellable once resolved with a certain promise, that one is typically a settled one
	var handle = null,
	    that = this;
	
	this.fork = function forkAdopting(subscription) {
	// registers the onsuccess and onerror continuation handlers
	// it is expected that neither these handlers nor their continuations do throw
	// if the promise is already settled, it returns a continuation to execute
	//    them (and possibly other waiting ones) so that the handlers are *not immediately* executed
	// if the promise is not yet resolved, but there is a continuation waiting to
	//    do so (and continuatively execute the handlers), that one is returned
	// else undefined is returned
	
	// if the promise is already resolved, it forwards the subscription,
	// else if there is no handle yet, it just uses the subscription for the handle
	//      if there is a subscription handle, it replaces it with an instruction handler
	//      if there is an instruction handle, it adds the subscription on it
	
		if (subscription.proceed == adopt) // A+ 2.3.1: "If promise and x refer to the same object," (instead of throwing)
			return adopt(Promise.reject(new TypeError("Promise/fork: not going to wait to assimilate itself"))); // "reject promise with a TypeError as the reason"
		
		if (!handle)
			handle = subscription;
		else if (handle.resolution && handle.resolution != that) { // expected to never happen
			var cont = handle.resolution.fork(subscription);
			if (this instanceof Promise && this.fork == forkAdopting) {
				this.fork = handle.resolution.fork; // employ shortcut, empower garbage collection
				this.onsend = handle.resolution.onsend;
			}
			return cont;
		} else {
			if (!handle.instruct) {
				if (handle.proceed || handle.success || handle.error)
					handle = {token: null, instruct: [handle], resolution: null};
				else
					handle.instruct = [];
				handle.token = getToken(handle.instruct);
			}
			handle.instruct.push(subscription);
		}
		if (subscription.lazy === false || subscription.instruct)
			return go;
		// TODO: don't let advanveSubscription have access to handlers, resolution etc.
		return function advanceSubscription() { // but don't request execution until the continuation has been called - implicit lazyness
			if (subscription) {
				if (typeof subscription.lazy == "function")
					return subscription.lazy; // TODO: set subscription to null?
				else if (subscription.resolution)
					return subscription.lazy = subscription.resolution.fork(subscription); // TODO: Does it matter when fork() doesn't return a continuation?
				// else
				subscription.lazy = false;
				subscription = null;
			} // else throw new Error("unsafe continuation");
			return go;
		}
	};
	function adopt(r) {
	// set the resolution to another promise
	// if already resolved, does nothing
	// creates an empty instruction handle if necessary
	// forwards the handle (if not a still lazy subscription)
		if (!handle)
			handle = {token: null, instruct: null, resolution: r};
		else if (handle.resolution && handle.resolution != that) return; // throw new Error("cannot adopt different promises");
		
		if (r == that) // A+ 2.3.1: "If promise and x refer to the same object," (instead of throwing)
			r = Promise.reject(new TypeError("Promise|adopt: not going to assimilate itself")); // "reject promise with a TypeError as the reason"
		handle.resolution = r;
		that.fork = r.fork; // shortcut unnecessary calls, collect garbage methods
		that.onsend = r.onsend;
		
		go = null; // the aim of go continuation was to advance the resolution process until it provided us a promise to adopt
		if (!handle.instruct && handle.lazy !== false)
			return;
		// from now on, fork calls will return the continuation that advances the adopted promise to eventual resolution // TODO: do we need that at all?
		return go = r.fork(handle);
	}
	// expects `go` to be safe. TODO: Prove correctness. If wrapper is required, possibly unwrap when adopt() is called.
	var go = fn.call(this, adopt, function progress(event) {
		var progressHandlers = handlers.filter(function(subscription) { return subscription.progress && !isCancelled(subscription.token); });
		if (progressHandlers.length <= 1) return progressHandlers[0].progress;
		var conts = new ContinuationBuilder();
		for (var i=0; i<progressHandlers.length; i++)
			conts.add(Promise.trigger(progressHandlers[i].progress, arguments));
		return conts.get();
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
	fn = null; // garbage collection
}

function Promise(fn) {
	AdoptingPromise.call(this, function callResolver(adopt, progress) {
		function makeResolver(constructor) {
		// creates a fulfill/reject resolver with methods to actually execute the continuations they might return
			function resolve() {
				return adopt(new constructor(arguments));
			}
			resolve.sync = function resolveSync() {
				Promise.run(adopt(new constructor(arguments)));
			};
			resolve.async = function resolveAsync() {
				var cont = adopt(new constructor(arguments)); // this creates the continuation immediately
				setImmediate(function runAsyncResolution() {
					Promise.run(cont);
				});
			};
			return resolve;
		}
		// TODO: make a resolver that also accepts promises, not only plain fulfillment values
		return ContinuationBuilder.safe(fn.call(this, makeResolver(FulfilledPromise), makeResolver(RejectedPromise), function triggerProgress() {
			Promise.run(Promise.trigger(progress, arguments));
		}));
	});
	fn = null; // garbage collection
}

FulfilledPromise.prototype = RejectedPromise.prototype = AdoptingPromise.prototype = Promise.prototype;

Promise.run = function run(cont) {
	while (typeof cont == "function")
		cont = cont(); // assert: a continuation does not throw
};
Promise.runAsync = function runAsync(cont) {
	if (typeof cont != "function" || cont.isScheduled) return cont;
	var timer = setImmediate(function asyncRun() {
		timer = null;
		cont.isScheduled = instantCont.isScheduled = false;
		Promise.run(cont); // Inline?
		cont = null;
	});
	function instantCont() {
		if (!timer) return;
		clearImmediate(timer);
		return cont;
	}
	cont.isScheduled = instantCont.isScheduled = true;
	return instantCont;
};
Promise.trigger = function trigger(handler, args) {
	while (typeof handler == "function" && handler.length) // the length (existence of a formal parameter) distinguishes it from a continuation
		handler = handler.apply(null, args);
	return handler; // continuation, or whatever else it is
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
ContinuationBuilder.prototype.add = function add(cont) {
	if (typeof cont == "function")
		this.continuations.push(cont);
	return this;
};
ContinuationBuilder.prototype.each = function each(elements, iterator) {
	for (var i=0, cont; i<elements.length; i++)
		if (typeof (cont = iterator(elements[i])) == "function")
			this.continuations.push(cont);
	return this;
};
ContinuationBuilder.prototype.eachSimilar = function each(elements, iterator) {
	for (var i=0, cont; i<elements.length; i++) {
		if (typeof (cont = iterator(elements[i])) == "function") {
			this.continuations.push(cont);
			for (var c; ++i<elements.length;)
				if ((c = iterator(elements[i])) != cont && typeof c == "function")
					this.continuations.push(cont = c);
			break;
		}
	}
	return this;
};
ContinuationBuilder.prototype.get = function getJoined() {
	return ContinuationBuilder.join(this.continuations);
};
ContinuationBuilder.join = function joinContinuations(continuations) {
	if (continuations.length <= 1) return continuations[0];
	return function runBranches() {
		var l = continuations.length;
		if (!l) return;
		for (var i=0, j=0; i<l; i++) {
			// TODO: Implement debugging
			var cont = continuations[i];
			cont = cont(); // assert: cont != runBranches ???
			if (typeof cont == "function")
				continuations[j++] = cont;
		}
		continuations.length = j;
		return (j <= 1) ? continuations[0] : runBranches;
	};
};
ContinuationBuilder.safe = function makeSafeContinuation(fn) {
	if (typeof fn != "function")
		return fn;
	if (typeof fn.safeContinuation == "function")
		return fn.safeContinuation;
	// prevents multiple invocations of the same continuation (which is possibly unsafe)
	function safeContinuation() {
		if (typeof fn != "function")
			return fn;
		var cont = fn();
		if (cont == fn) // it's volatile, it must be safe!
			return cont;
		fn = cont;
		return safeContinuation; // returns itself (volatile)
	}
	// fn.safeContinuation = safeContinuation;
	safeContinuation.safeContinuation = safeContinuation;
	return safeContinuation;
};

Promise.prototype.onsend = function noHandler(event) {};
Promise.prototype.send = function send() {
	return Promise.run(Promise.trigger(this.onsend, arguments));
};

Promise.prototype.cancel = function cancel(reason, token) {
	if (this.onsend != Promise.prototype.onsend) // needs to be still pending, with the ability to send messages
		return false;
	if (!(reason && reason instanceof Error && reason.cancelled===true))
		reason = new CancellationError(reason || "cancelled operation");
	if (token)
		token.isCancelled = true; // revoke it
	Promise.run(Promise.trigger(this.onsend, ["cancel", reason]));
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
function getToken(subscriptions) {
	return {
		isCancelled: function() {
			for (var i=0; i<subscriptions.length; i++)
				if (!isCancelled(subscriptions[i].token))
					return false;
			return true;
		}
	};
}

function makeUnitFunction(constructor) {
	return function of(val) {
		// return new constructor(arguments);
		// optimisable in V8 - http://jsperf.com/array-with-and-without-length/
		var args = [];
		switch (arguments.length) {
			case 3: args[2] = arguments[2];
			case 2: args[1] = arguments[1];
			case 1: args[0] = val;
			case 0: break;
			default:
				for (var i=0; i<arguments.length; i++)
					args[i] = arguments[i];
		}
		return new constructor(args);
	};
}
Promise.of = Promise.fulfill = makeUnitFunction(FulfilledPromise);
Promise.reject = makeUnitFunction(RejectedPromise);

function makeMapping(createSubscription, build) {
	return function map(fn) {
		var promise = this;
		return new AdoptingPromise(function mapResolver(adopt, progress, isCancellable) {
			var token = {isCancelled: false};
			this.onsend = function mapSend(msg, error) {
				if (msg != "cancel") return promise.onsend;
				if (isCancellable(token))
					return new ContinuationBuilder([
						Promise.trigger(promise.onsend, arguments),
						adopt(Promise.reject(error))
					]).get();
			};
			return promise.fork(createSubscription(function mapper() {
				return adopt(build(fn.apply(this, arguments)));
			}, {
				proceed: adopt,
				progress: progress,
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
		return new AdoptingPromise(function chainResolver(adopt, progress, isCancellable) {
			var cancellation = null,
			    token = explicitToken || {isCancelled: false},
			    strict = false, done;
			this.onsend = function chainSend(msg, error) {
				if (msg != "cancel") return promise && promise.onsend;
				if (explicitToken ? isCancelled(explicitToken) : isCancellable(token)) {
					if (!promise) // there currently is no dependency, store for later
						cancellation = error; // new CancellationError("aim already cancelled") ???
					return new ContinuationBuilder([
						promise && Promise.trigger(promise.onsend, arguments),
						adopt(Promise.reject(error))
					]).get();
				}
			};
			function makeChainer(fn) {
				return function chainer() {
					promise = null;
					promise = fn.apply(undefined, arguments); // A+ 2.2.5 "must be called as functions (i.e. with no  this  value)"
					if (cancellation) // the fn() call did cancel us:
						return Promise.trigger(promise.onsend, ["cancel", cancellation]); // revenge!
					else if (strict)
						return promise.fork({proceed: adopt, progress: progress, token: token});
					else
						done = promise.fork({proceed: adopt, progress: progress, token: token});
				};
			}
			var go = execute(promise.fork({
				success: onfulfilled && makeChainer(onfulfilled),
				error: onrejected && makeChainer(onrejected),
				proceed: adopt,
				progress: progress,
				token: token
			}));
			return function advanceChain() { // TODO: prove correctness
				if (done) // this was not called before asyncRun got executed, and strict was never set to true
					return done;
				strict = true;
				return go;
			}
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
		return new Promise(function thenableResolver(fulfill, reject, progress) {
			try {
				// A+ 2.3.3.3 "call then with x as this, first argument resolvePromise, and second argument rejectPromise"
				then.call(v, fulfill.async, reject.async, progress); // TODO: support cancellation
			} catch(e) { // A+ 2.3.3.3.4 "If calling then throws an exception e"
				reject.async(e); // "reject promise with e as the reason (unless already resolved)"
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
	if (arguments.length > 0 && onfulfilled == null && onrejected == null && onprogress == null)
		console.warn("Promise::then: You have passed no handler function");
	if (onprogress)
		this.fork({progress: function(event) { onprogress.apply(this, arguments); }, token: token}); // TODO: check consistency with progress spec
	return this.chainStrict(Promise.method(onfulfilled, "Promise::then"), Promise.method(onrejected, "Promise::then"), token);
};
Promise.prototype.catch = function catch_(onrejected) {
	if (typeof onrejected != "function") console.warn("Promise::catch: You must pass a function, instead of", onrejected);
	if (arguments.length <= 1)
		return this.then(null, onrejected);
	var tohandle = onrejected,
	    promise = this;
	onrejected = arguments[1];
	return this.chainStrict(null, Promise.method( isErrorClass(tohandle)
	  ? function(err) {
	    	if (err instanceof tohandle) return onrejected.call(this, arguments);
	    	else return promise;
	    }
	  : function(err) {
	    	if (tohandle(err)) return onrejected.call(this, arguments);
	    	else return promise;
	    }
	));
};
function isErrorClass(constructor) {
	if (constructor.prototype instanceof Error) return true; // premature optimisation
	for (var p=constructor.prototype; p!=null; p=Object.getPrototypeOf(p))
		if (Object.prototype.toString.call(p) == "[object Error]")
			return true;
	return false;
}
Promise.prototype.timeout = function timeout(ms) {
	return Promise.timeout(ms, this);
};
Promise.timeout = function timeout(ms, p) {
	return Promise.race([p, Promise.defer(ms).chain(function() {
		return Promise.reject(new Error("Timed out after "+ms+" ms"));
	})]);
};
Promise.prototype.defer = function defer(ms) {
	// a fulfillment will be held up for ms
	var promise = this;
	return this.chain(function deferHandler() {
		// var promise = new FulfilledPromise(arguments);
		return new AdoptingPromise(function deferResolver(adopt, _, isCancellable) {
			var token = {isCancelled: false};
			var timerId = setTimeout(function runDelayed() {
				timerId = null;
				Promise.run(adopt(promise));
			}, ms);
			this.onsend = function deferSend(msg, error) {
				// since promise is always already resolved, we don't need to resend
				if (msg == "cancel" && isCancellable(token)) {
					if (timerId != null)
						clearTimeout(timerId);
					return adopt(Promise.reject(error));
				}
			};
		});
	});
};
Promise.defer = function defer(ms, v) {
	return Promise.from(v).defer(ms);
};

Promise.all = function all(promises, opt) {
	if (!Array.isArray(promises)) {
		promises = Array.prototype.slice.call(arguments);
		opt = 2;
	}
	var spread = opt & 2,
	    notranspose = opt & 1;
	return new AdoptingPromise(function allResolver(adopt, progress, isCancellable) {
		var length = promises.length,
		    token = {isCancelled: false},
		    left = length,
		    results = [new Array(length)],
		    waiting = new Array(length),
		    width = 1;
		function notifyRest(args) {
			var continuations = new ContinuationBuilder();
			for (var j=0; j<length; j++)
				if (waiting[j])
					continuations.add(Promise.trigger(promises[j].onsend, args));
			return continuations;
		}
		this.onsend = function allSend(msg, error) {
			if (msg != "cancel" || isCancellable(token))
				return notifyRest(arguments).get();
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
					token.isCancelled = true; // revoke
					Promise.run(notifyRest(["cancel", new CancellationError("aim already rejected")])); // TODO: return continuation
					return adopt(promise);
				},
				progress: progress,
				token: waiting[i] = token
			});
		})).get();
	});
};

Promise.race = function(promises) {
	return new AdoptingPromise(function raceResolver(adopt, progress, isCancellable) {
		var token = {isCancelled: false};
		function notifyExcept(i, args) {
			var continuations = new ContinuationBuilder();
			for (var j=0; j<length; j++)
				if (i != j)
					continuations.add(Promise.trigger(promises[j].onsend, args));
			return continuations.get();
		}
		this.onsend = function raceSend(msg, error) {
			if (msg != "cancel" || isCancellable(token))
				return notifyExcept(-1, arguments);
		};
		return new ContinuationBuilder(promises.map(function(promise, i) {
			return promise.fork({
				proceed: function raceWinner(/*promise*/) {
					token.isCancelled = true; // revoke
					Promise.run(notifyExcept(i, ["cancel", new CancellationError("aim already resolved")])); // TODO: return continuation
					return adopt(promise);
				},
				progress: progress,
				token: token
			});
		}));
	});
};

if (typeof module == "object" && module.exports)
	module.exports = Promise;
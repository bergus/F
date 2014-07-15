"use strict";

function makeResolvedPromiseConstructor(i) {
	return function ResolvedPromise(args) {
		var handlers = [];
		function runHandlers() {
			if (!handlers.length) return;
			var continuations = [];
			for (var i=0; i<handlers.length; i++) {
				var cont = handlers[i].apply(null, args);
				if (typeof cont == "function")
					continuations.push(cont);
			}
			handlers.length = 0;
			return Promise.joinContinuations(continuations);
		}
		this.fork = function forkResolved(onsuccess, onerror) {
			var handler = [onsuccess, onerror][i];
			if (typeof handler == "function")
				handlers.push(handler);
			return runHandlers;
		};
	}
}
var FulfilledPromise = makeResolvedPromiseConstructor(0);
var RejectedPromise =  makeResolvedPromiseConstructor(1);
	
function AssimilatingPromise(opt) {
	var resolution = null,
	    handlers = [];
	
	this.fork = function forkAssimilating(onsuccess, onerror) {
	// registers the onsuccess and onerror continuation handlers
	// if the promise is already resolved, it returns a continuation to execute
	//    them (and possibly other waiting ones) so that the handlers are *not immediately* executed
	// if the promise is not yet resolved, but there is a continuation waiting to
	//    do so (and continuatively execute the handlers), that one is returned
	// else undefined is returned
		if (resolution) {
			// if (this instanceof Promise) this.fork = resolution.fork; TODO ???
			return resolution.fork(onsuccess, onerror);
		}
		handlers.push(arguments);
		return go; // go (the continuation of the opt.call) might be returned (and then called) multiple times!
	};
	
	var go = opt.call(this, function assimilate(r) {
		if (resolution) return;
		resolution = r;
		// that.fork = resolution.fork; TODO ??? Does not necessarily work well if resolution is a pending promise
		for (var i=0; i<handlers.length; i++)
			var cont = resolution.fork(handlers[i][0], handlers[i][1]); // assert: cont always gets assigned the same value
		handlers = null;
		// if (cont && cont.isScheduled) cont.unSchedule() TODO ??? The result of a chain is usually already
		//                                                          scheduled, but we are going to execute it
		return cont;
	});
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
		cont = cont();
};
Promise.runAsync = function runAsync(cont) {
	if (typeof cont != "function" || cont.isScheduled) return;
	cont.isScheduled = true;
	setImmediate(Promise.run.bind(Promise, cont));
};
Promise.joinContinuations = function joinContinuations(continuations) {
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

Promise.prototype.map = function map(fn) {
	var promise = this;
	return new AssimilatingPromise(function mapResolver(assimilate) {
		return promise.fork(function mapper() {
			return assimilate(Promise.of(fn.apply(this, arguments)));
		}, function mapErrback() {
			return assimilate(promise);
		});
	});
};
// Promise.prototype.mapError respectively

Promise.prototype.chain = function chain(fn) {
	var promise = this;
	return new AssimilatingPromise(function chainResolver(assimilate) {
		return promise.fork(function chainer() {
			return assimilate(fn.apply(this, arguments));
		}, function chainErrback() {
			return assimilate(promise);
		});
	})
};

Promise.of = function of() {
	return new FulfilledPromise(arguments);
};
Promise.reject = function reject() {
	return new RejectedPromise(arguments);
};

Promise.timeout = function timeout(ms, v) {
	return new Promise(function timeoutResolver(f) {
		setTimeout(f.sync.bind(f, v), ms);
	});
};

Promise.all = function all(promises) {
	// if (arguments.length > 1) promise = Array.prototype.concat.apply([], arguments);
	var length = promises.length;
	if (!length)
		return new FulfilledPromise([]);
	return new AssimilatingPromise(function allResolver(assimilate) {
		var left = length,
		    results = [new Array(length)],
		    width = 1;
		return Promise.joinContinuations(promises.map(function continueAll(promise, i) {
			return promise.fork(function allCallback(r) {
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
					return assimilate(new FulfilledPromise(results));
			}, function allErrback() {
				return assimilate(promise);
			});
		}).filter(Boolean));
	});
};

/*
Promise.race = function race(promises) {
	return new AssimilatingPromise(function raceResolver(fulfill, reject) {
		return Promise.joinContinuations(promises.map(function continueRace(promise, i) {
			// 	for (var j=0; j<promises.length; j++)
			// 		if (j != i)
			// 			promises[j].cancel()
			function raceWinner() {
				return assimilate(promise);
			}
			return promise.fork(done, done);
		}).filter(Boolean));
	})
}; */

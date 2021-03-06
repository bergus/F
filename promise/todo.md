﻿/* Cancellation (https://github.com/promises-aplus/cancellation-spec)
* .canceled=true property on errors (https://github.com/promises-aplus/cancellation-spec/issues/1#issuecomment-11452893)
* rejection or not? (https://github.com/promises-aplus/cancellation-spec/issues/1#issuecomment-11624303)
* .catchCancelation / .handleCancellation
* .catchCancelled(retry) === catch(CancellationError, retry)
* CancellationException instanceof Error, .name = 'OperationCancelled', .cancelled = true, .reason & .data (https://github.com/promises-aplus/cancellation-spec/issues/2)
* .abort() is .cancel() without propagation
* Cancellation should only need to be considered by the PromiseLibraries/Implementations, the person actually initiating/using cancellation and the person managing the underlying IO operation. (https://github.com/promises-aplus/cancellation-spec/issues/3#issuecomment-11708125)
* can't decide between cancelled and canceled https://github.com/promises-aplus/cancellation-spec/issues/4
* .uncancellable() https://github.com/promises-aplus/cancellation-spec/issues/6
* Returns the rejection reason if the deferred was canceled normally. If the second, optional "strict" argument is true means it will throw an error if the promise is fulfilled. http://dojotoolkit.org/reference-guide/1.10/dojo/Deferred.html#cancel
* derived = fulfilledPromise.then(function doSomething(){return childPromise}); derived.cancel(); - derived is cancelled and doSomething is executed, but what about childPromise? (https://github.com/promises-aplus/cancellation-spec/issues/7#issuecomment-17761795)
*/

// test snippet for cancellation:
var a = Promise.defer(500, "hello").chain(function(x){console.log(x); return Promise.defer(500, "delays");}).map(console.log)
setTimeout(function(){ a.cancel(); }, 550)
Promise.run(a.fork({error: function(e) { console.log(e.stacktrace);}}))


/* OPEN ISSUES
* public getState function?
	-> synchronous inspection
* conventions for errors: Must be multiple callback?
* implement a get(prop) function. ridicoulus approach?
	-> Functor
* .then(function(r, s){ [...]; s(x, y, z)}).then(fn) == .then(function(r){ [...]; return fn(x, y, z);})
	-> Composition law of Functors

* a Lazy (subclassing?) constructor that will <s>wait for a "run" message</s> offer non-strict (non-scheduling) variants of methods
	-> by default, all methods are lazy now; execution needs to be forced by fork()ing and (async)run()ning that continuation. Also `.then` requires strictness.
* progress() channel currently is forwarding recursively, while supporting continuations
* What does the progress argument to `then` do? Is `.then(null, null, handle)` only equivalent to `.onprogress(handle)`? Or does it register anything on childs as well, i.e. `.then(…, …, handle)` equals `.then(…, …).onprogress(handle)`?
  Or does it even do any filtering? Check progression drafts.
* Is a per-promise global `runHandlers` function and `handlers` array harmful?
  - is there a contract that only the current-subscription attached handlers are called by the returned continuations? Or is the continuation free to run the handlers *and their continuations*?
  - is the order of invocation of the continuations messed up by this? Or is that not guaranteed anyways?
  - are there cases where a non-global `handlers` array, and a new continuation for each level, leads to a really harmful recursive descent?
* when executing `chain` callbacks, don't have them schedule their continuations. at least they're immediately unscheduled.
* Prevent circles in the dependency chain, reject promises that depend on themselves
  	var x = a.chain(function(){ return x.*inner chain*});
  	var x = a.chain(function(){ return x}).*outer chain*;
  bonus: work with combinators like .map() in the chain

*/

/* IDEAS
* TODO: make all runners (local-)stateless, to avoid problems with recursive reentry, or after abrupt completions
  The first might happen (...when you expect it the least :-) in similar cases as ValueStream::valueOf()
  The second would allow to finish off the remaining continuations in a manner as
  	Promise.run = function(cont) {
  		try {
  			while(typeof cont=="function")cont=cont()//as usual
  		} catch(e) {
  			console.error(e);
  			Promise.run(cont);
  		}
  	}
  But that's probably a bad idea anyway, given that the offending continuation might just get re-executed by this
* unhandled rejections: issue a warning in the handler-runner of rejected promises in case there are no handlers
  a rejected promise is not handled until an error handler was executed for it, and that one led not to another fork() call
* In the runner(s): prevent endless loops - they don't overflow the stack!
  [X] done for ResolvedPromise|runHandlers
* In the runner(s): keep a list of the continuations that ran in the loop
  and make it available (to unhandled warnings, or `then` stacktraces) for debugging purposes
  however I am a little unsure how to get information about user code involved in it
  - logging functions to add details to the current line might be called in continuations
  - logging functions that open/close groups of lines with a prefix might be used by continuations that run multiple things
  
  likely to be interesting (for unhandled rejections?) are stack traces from the creation of Promise objects, not those about the many callbacks that were executed
  
  There are three stack traces that might be interesting for promise consumers:
  - the "real" call stack, on which the async callback, Promise.run, a few continuations with their actions and the handler are found
  - the promise resolutions that led to the current callback being called - basically the list of continuations that were Promise.run
  - the call from which the current handler *was installed* (and recursively, if that was a handler, it's installation...)
  security implications, possibly leaking information about other subscribers?
  https://stackoverflow.com/questions/24076676/call-stack-for-callbacks-in-node-js/24077055#24077055
* bind message to Promise.run from which async action the continuations are ran, and where the call to this task was issued
* a PendingPromise constructor that eats all handlers (for breakfast)
  Promise.Never stays forever pending and swallows all continuations thrown into it. Can be used for memory management
  and for explicitly avoiding false positives in a never-resolving-promise detection
  Maybe even something similar for unhandled-rejection tracking?
* make progress listening lazy: `send()` down listeners to dependencies only when they are installed
* for map/filter use the promiseT (array?) monad transformer from https://github.com/briancavalier/promiseT
  which is basically a wrapper for <s>an array</s> a collection of promises
  - have a concurrency option on the wrapper
  - we need to support the following use cases:
    - a collection of values is traversed with an asynchronous function
    - a collection of promises is traversed with a synchronous function (more or less trivial, no concurrency option)
    - a collection of promises is traversed with an asynchronous function
    - a collection is traversed with a function that yields another collection (chain)
  - each of these should yield some type that represents a promise for a collection (and can be turned into one). That might be
    - a promise for a value
    - a collection of promises
    - a collection of (promised) collections
  - reduce not only sequentially, but also with modes for parallel or unordered execution (either level-by-level, or asap)
  - traversal with pure functions is typically unordered, i.e. the order of the collection is not respected
  - fail modes: What to do with rejections - fail fast, atleastN?
* Disposable = Promise<(C, disposer)>; disposer = Promise<R> -> void|Promise<X, E>
  usingX::(Promise<C> -> Promise<R>) -> Promise<R>
  	function withConnection(args) {
  		return function(handle) {
  			var conn = connect(args);
  			return handle(conn.map(identity)) // returns the first argument
  			// handle must not throw 
  			.finally(function(res) {
  				return conn.then(function(_, close) {
  					return close(res);
  				}, noop); // do nothing when the `connect()` attempt had failed, don't rethrow that
  			});
  		};
  	}
  using :: [(Promise<C> -> Promise<R>) -> Promise<R>], ([C] -> Promise<R>) -> Promise<R>
  	using = function() { arguments.slice(0, -1).reduceRight(function(inner, useWith) {
  			return useWith(function(c) { return inner.apply(this, arguments.concat([c])); });
  		}, Promise.all.invoke("then", arguments[-1]));
  	}
  Maybe implement timeout to console.error() undisposed ressources
* make error constructors that are not invoked as constructors, but as Promise methods, return rejected promises:
  `return Promise.Error(…)` == `return Promise.reject(new Promise.Error(…))`
  + shorter syntax - needs clear communication - is inconsistent with native errors - easy to get wrong
  better as distinct, lowercase methods? `Promise.error(…)`
* make onSend() [try to] invoke methods with the name of the message on assimilated foreign promises (that don't provide an onSend method)
  make "cancel" also invoke "abort" (e.g. jQuery ajax)?
* should there be stop/go messages that hold up (and leave go) the execution of a promise chain?
  - Node.js streams have a cork()/uncork() method for this
  - is there an inherent danger to have possibly "hanging" promises, which are always-pending and don't trigger finally() handlers?
* implement finally:
  - finally: function fin() { Promise.cast(handler(promise)).thenResolve(promise); } return promise.then(fin, fin);
    this can be cancelled! Rethrow rejections? Wait for async finalizers?
  - always: register a token-less handler and return original promise
* have a "no-token" value for the cancellationToken parameter of `.then()` which causes a strict execution of the handler even in cancellation case
  guarantee evaluation of child promises in cancellation case?
* abortable promises: send an "abort" message to the farthest pending ancestor that has an onabort handler, and let that reject this promise
  how to find whether there is a farther onabort handler? By not getting a resolve continuation back from trigger?
  promises are not abortable by default. Use .makeAbortable(abortionHandler)
* Promise::send = function(msg, ...args) { Promise.run(Promise.trigger(this.onsend, msg, args)); }
* Promise::assert = function(test, msg) { return this.chain(function(){ return test.apply(null, arguments)) ? this : Promise.reject(msg); }); }
* Subclassing:
  - have a common prototype that implements common promise stuff (`then`(== safe+strict+cast), catch, finally etc)
  - have a prototype for each of these modes:
    - lazy (only if continued) / strict (ensures executing the callback) / strict+ (ensures evaluating to a value, including child promises)
    - safe (catch exceptions in all callbacks and reject the promises with them)
    - async (run everything detached) / asap (execute continuations immediately) - interesting for runners of lazy
  - have methods to cast one into another (Object.create(other.prototype) and copying `fork` and `send`)
  - implement Functor, Monad, Applicative either as a mixin in any of these prototypes, or even let the common one inherit from Monad
  - Export the default (lazy+safe+async?) constructor, with static properties to get the other ones
* (a -> Promise b) is an Arrow a b
* short-cut fusion for pure functions, especially chained getters. Avoid creating internal "overhead" objects prematurely?

* p.expectCancellation() returns an uncancellable promise that is fulfilled when p is cancelled and rejected when resolved
* unhandled-rejection: which promises in a chain or tree are reported?
* an .uncancellable()-like function that doesn't exactly make a promise uncancellable, but simply doesn't propagate cancellation attempts up the chain
  and takes a callback that is called on cancellation
  similar to an .oncancellable() function that takes a callback, but also propagates cancellation attempts
* memoize-promise: take cancellation into account, and un-cache on cancellation or prevent propagation of cancellation attempts and always fetch
* short-cut-foldr on parallel collection (like a `find`)
* idea: when adopting an inner promise, pass your (single, cancellable) subscription immediately to it
        when having adopted an inner promise, pass new (cancellable) subscriptions immediately to
        when more subscriptions are registered, *highjack* the already-passed subscription
        when processing a subscription, mark it as such with the result, so that forking a settled promise can use a quick lookup
* idea: put a `send` method on subscriptions on their registration, so that the successors don't need to hold a reference to the parent promise
        the parent can decide on its own when to vanish, and what send abilities to provide

* autoclosingpromise calls back with retur value of res.dispose() after first bunch of handlers
* extends if the convey the same ticket
* is disposable a comonad?
*/

/* SPEC: Communication
Rationale: We want to communicate with unresolved promises. Duplex. Interoperable.

We do not care about resolved promises. They represent the result of a task that has been completed.
Any values that are received by the means of the following methods are supposed to be disposed when the promise is resolved, to prevent memory leaks.

* Progress
`onprogress` IS [supposed to be] the third argument to a `.then()` call. It MUST (as soon as possible???) be passed as the third argument to any `.then()` call on every pending promise that the resulting promise depends upon.
These especially include the original promise that `.then()` was called on and the child promises that possible handlers might have returned, but the concept applies to all other promise combinators that a library might offer.
The value of the `onprogress` parameter MIGHT be a function (and MUST have a `.call()` method???). It SHOULD (must???) never be called after a promise has been resolved (see rationale).
What values exactly are passed through, and how to interact with them, is not part of this specification; though there is a recommendation for function handlers below.
OPEN: What happens in case of multiple `then()` calls on one promise (which might be joined again, e.g. through `.all()`)? Allow event duplication, or do we require pass-through of the handlers themselves down to the event source?

* Send
Every promise MUST have a `onsend()` method. When called, it MUST invoke the `.onsend()` methods on all pending promises that it depends on with the exact same arguments. It MUST `return` the result of such a call, or an array of the results of multiple calls. 
If a promise is resolved, a `.onsend()` call SHOULD (must???) be a noop, and MUST `return undefined`.
The structure of the arguments is not part of this specification, though there is a recommendation below.

* [NOTE] parameters
Both functions that are passed as `onprogress` handlers, and the `send` methods, serve as event channels between promise creators and consumers.
The first parameter should be a string with the name of the event, so that different communication purposes can be distinguished, and standards about how to handle specific ones can be devised.
The second parameter should, in case it is meant as an event object, have the value of the first parameter as its `.name` property.
OPEN: Should we fix the number of arguments for an efficient implemenation (to 2?), and use arrays when more are necessary?
A proposal cancellation implemented in terms of that can be found below.

*/



// 3 Promise-Funktionen sind wichtig und beschreibbar:
// * chain / Verkettung -> Nacheinander, mit Option was ein Error (jeglicher Art) auslösen soll (returnError | nextPromise | defaultError (spezialError) -> Kontinue after Error ...)
// * merge / Vereinigung -> Parallelität, mit Option ob All-/Existenzquantor für Error-/Success-return gilt
// * endlicher Automat: -> Menge der Zustände (mit Start- und Endzustand), Ablaufrelationen, defaultSuccess, defaultError
	a Promise to be fulfilled when the final state is reached
	implements a full finite-state-machine

// message-Konzept ausarbeiten (Kettendurchlauf?)
// Start-Stop-Konzept ausarbeiten
// insbesondere bei Verzweigungen nur eigene Zweige anhalten? Implementation im endlichen Automaten?


----

var t1 = Promise.of("1"),
    t2 = Promise.of("2");
var t3 = t1.map(function(a) { console.log(a); return "3";});
Promise.all([t1, t2, t3]).map(console.log);

----

/* PROGRESSION

* a third argument to the "normal" Promise constructor, which is a `triggerProgress` function
* .progressFilterInject((triggerProgress) -> ((progressEvent) -> boolean))
  .progressFilter(test) { return this.progressFilterInject(Function.const(test)); }
  .progressMap(fn) { return this.progressFilterInject(function(inject) { return function(event) { inject(fn(event)); return false; }; }); }
  .thenTrigger(event) { return this.progressFilterInject(function(inject) { this.then(inject.partial(event)); return Fuction.const(true); }); }
* ProgressPromise(event, Promise): assimilates the promise, fires the progess event immediately (asap, in the continuation)
  Example: doFirstPart().then(function(r) { return new ProgessPromise("first part done", doSecondPart(r)); }).then(…)
  Also curried/composable: trigger:: event -> (x -> Promise) -> (x -> ProgressPromise)
* EventStream interface:
  - .on() / .onprogess()
  - .asEventStream()
  - mapProgressEvents((EventStream) -> EventStream)
* 

*/
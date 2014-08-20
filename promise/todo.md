/* Cancellation (https://github.com/promises-aplus/cancellation-spec)
* .canceled=true property on errors (https://github.com/promises-aplus/cancellation-spec/issues/1#issuecomment-11452893)
* rejection or not? (https://github.com/promises-aplus/cancellation-spec/issues/1#issuecomment-11624303)
* .catchCancelation / .handleCancellation
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
* function x(p){return Promise.prompt(p);}); x("").then(x) // Endlosschleife!

* What happens when an error handler handles a CancellationError? Would the error handler be executed, but ignored?
  Would the resulting promise resolve as normal, and could (need to) be cancelled a second time?
  Do CancellationErrors need to be propagated at all, or are the promises in the chain already rejected by the cancellation itself?
* What happens to a then handler (or its result) on a resolved promise that is cancelled before the handler returns?
	unlikely: the cancellation is issued from the handler itself (which might better `throw` a `new CancellationError`, but that's not necessarily the same)
	-> A handler that is cancelled before it could get executed is no more executed, even it the promise is resolved.
	-> If the handler did result a promise, that will be immediately cancelled
* a `send()` call currently recursively descends down the whole chain until it finds a promise that does not respond to it
	-> no single resolved promise should respond to a `send()` call
* a cancel attempt message tries to cancel already cancelled promises again
* a Lazy (subclassing?) constructor that will <s>wait for a "run" message</s> offer non-strict (non-scheduling) variants of methods
	-> by default, all methods are lazy now; execution needs to be forced by fork()ing and (async)run()ning that continuation. Also `.then` requires strictness.
* progress() channel currently is forwarding recursively, while supporting continuations
* What does the progress argument to `then` do? Is `.then(null, null, handle)` only equivalent to `.onprogress(handle)`? Or does it register anything on childs as well, i.e. `.then(…, …, handle)` equals `.then(…, …).onprogress(handle)`?
  Or does it even do any filtering? Check progression drafts.
* Is a per-promise global `runHandlers` function and `handlers` array harmful?
  - is there a contract that only the current-subscription attached handlers are called by the returned continuations? Or is the continuation free to run the handlers *and their continuations*?
  - is the order of invocation of the continuations messed up by this? Or is that not guaranteed anyways?
  - are there cases where a non-global `handlers` array, and a new continuation for each level, leads to a really harmful recursive descent?
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
  - the "real" call stack, on which the async callback, Promise.run, a few continuations and the handler are found
  - the promise resolutions that led to the current callback being called - basically the list of continuations that were Promise.run
  - the call from which the current handler *was installed* (and recursively, if that was a handler, it's installation...)
  security implications, possibly leaking information about other subscribers?
  https://stackoverflow.com/questions/24076676/call-stack-for-callbacks-in-node-js/24077055#24077055
* bind message to Promise.run from which async action the continuations are ran, and where the call to this task was issued
* a PendingPromise constructor that eats all handlers (for breakfast)
* a AssimilatePending constructor that can forward handlers and handles send()s and cancellation (like chain etc already do it)
  TODO: Prevent circles in the dependency chain, reject promises that depend on themselves
  	var x = a.chain(function(){ return x.*inner chain*});
  	var x = a.chain(function(){ return x}).*outer chain*;
  bonus: work with combinators like .map() in the chain
* split proceed::((promise)->continuation)->continuation and instruct::Array<Subscription>
	-> see promise-instructing branch
* make progress listening lazy: `send()` down listeners to dependencies only when they are installed
* explicit .mapSafe/.chainSafe methods
* for map/filter use the promiseT (array?) monad transformer from https://github.com/briancavalier/promiseT, with a concurrency option
* Disposable = Promise<(C, disposer)>; disposer = Promise<R> -> void|Promise<X, E>
  usingX::((Promise<C> -> Promise<R>) -> Promise<R>
  	function withConnection(args) {
  		return function(handle) {
  			// var conn = connect(args);
  			// return handle(conn.map(first)).finally(=>conn.map(second).chain(call));
  			var done;
  			return handle(connect(args).map(function(connection, close) {
  				done = close;
  				return connection
  			})).finally(function() {
  				return done && done();
  			})
  		};
  	}
  using :: [(Promise<C> -> Promise<R>) -> Promise<R>], ([C] -> Promise<R>) -> Promise<R>
  	using = function() { arguments.slice(0, -1).reduceRight(function(inner, useWith) {
  			return useWith(function(c) { return inner.apply(this, arguments.concat([c])); });
  		}, Promise.all.invoke("then", arguments[-1]));
  	}
  or maybe
  usingX::Promise<(C -> Promise<R>) -> Promise<R>>
  	function withConnection(args) {
  		return connect(args).map(function(connection, close) {
  			return function(handle) {
  				return handle(connection).finally(close);
  			})
  		}; // relies on the handler being always called (and the connect() promise not to be cancelled)
  		   // otherwise .finally() is never executed and we leak
  		   // but attaching it after the map is complicated (see above)
  	}
  while using the following pattern has concise syntax, but makes requesting multiple ressources in parallel impossible
  usingX::(C -> Promise<R>) -> Promise<R>
  	function withConnection(args) {
  		return connect(args).then(function(connection, close) {
  			return handle(connection).finally(close);
  		}); // cancelling the connect() promise still doesn't guarantee a call to close()
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
    this can be cancelled!
  - always: register a token-less handler and return original promise
* have a "no-token" value for the cancellationToken parameter of `.then()` which causes a strict execution of the handler even in cancellation case
  guarantee evaluation of child promises in cancellation case?
* abortable promises: send an "abort" message to the farthest pending ancestor that has an onabort handler, and let that reject this promise
  how to find whether there is a farther onabort handler? By not getting a resolve continuation back from trigger?
  promises are not abortable by default. Use .makeAbortable(abortionHandler)
* Promise::send = function(msg, ...args) { Promise.run(Promise.trigger(this.onsend, msg, args)); }
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
Every promise MUST have a `send()` method. When called, it MUST invoke the `.send()` methods on all pending promises that it depends on with the exact same arguments. It MUST `return` the result of such a call, or an array of the results of multiple calls. 
If a promise is resolved, a `.send()` call SHOULD (must???) be a noop, and MUST `return undefined`.
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

// Think of a (naive?) promise loop:
Promise.until = function(cond, fn, value) {
	if (cond(value)) return Promise.of(value); // for while: if (!cond(value)) …
	return fn(value).chain(Promise.until.bind(Promise, cond, fn));
};
// (example usage)
Promise.until(function(x) { return x > 9 }, function(x) {
	console.log(x);
	return Promise.defer(100, x).chain(function(y) {
		console.log("timed "+y);
		return Promise.of(y+1);
	});
}, 0).map(function(x){console.log(x, "done"); debugger; });
// which would unfold to something like
var x= Promise.of(0).chain(function(x) {
 return Promise.of(1).chain(function(x) {
  return Promise.of(2).chain(function(x) {
   return Promise.of(3).chain(function(x) {
    return Promise.of(4).chain(function(x) {
     return Promise.of(5).chain(function(x) {
      return Promise.of(6).chain(function(x) {
       return Promise.of(7).chain(function(x) {
        return Promise.of(8).chain(function(x) {
         return Promise.of(9);
        });
       });
      });
     });
    });
   });
  });
 });
});
x.map(console.log);

/* How can we deal with this efficiently?
[X] above unfolded `chain` call can execute all callbacks synchronously (in the same turn)
[ ] when executing `chain` callbacks, don't have them schedule their continuations
    TODO. at least they're immediately unscheduled.
[X] the innermost promise resolution needs to resolve n promises
[X] when resolving the innermost promise, prevent a stack overflow
[?] the innermost promise resolution doesn't execute n callbacks
[X] the innermost promise resolution doesn't need n function calls until the outermost registered callbacks (console.log)
[X] after the promise is resolved, adding a new callback doesn't lead to a stack overflow

=> We don't get a better complexity than O(n), since we need to resolve n promises. However, for multiple handlers, we should be able to balance the load and get better average complexity.
=> We do not want to get O(n²) runtime where each involved promise uses a subscription with O(n) complexity

*/
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
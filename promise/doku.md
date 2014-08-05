## Terminology ##

Extends https://github.com/promises-aplus/promises-spec#terminology

parent: the promise that `then` was called on, from which the `promise` originates
child: a thenable that a monadic callback returns
dependencies: all parents and childs on which the fate of a promise depends on
successors, followers: all promises that depend on a `promise`
Do not use *descendant*, which is ambiguous. Also, there is no relationship between a parent of a promise and a child of that promise.


# Methods #

## Prototype methods ##

These methods need to be applied on a `Promise` instance. If not otherwise stated, callbacks are called with `null` for their `this` value. As promises represent an asynchronous result, all callbacks are guaranteed to be invoked asynchronously (after the method has returned the resulting promise).

### `promise.map` ###

`Promise<A> .map( (A) -> B ) -> Promise<B>`  
The [`map` method](https://en.wikipedia.org/wiki/Map_(higher-order_function)) applies the callback function to the fulfillment value of the promise, and returns another promise for its result. It will not be called if the promise is rejected or cancelled.

### `promise.mapError` ###

`Promise<A, E> .mapError( (E) -> F ) -> Promise<A, F>`  
The equivalent to `.map()`, but the callback is applied on the rejection reason of the promise and produces another rejected promise, unless the promise is fulfilled or cancelled.

Notice that this method is lazy and does not invoke the callback unless necessary.

### `promise.chain` ###

`Promise<A, B> .chain( (A) -> Promise<C, D>, (B) -> Promise<C, D> ) -> Promise<C, D>  
The [`chain` method](https://en.wikipedia.org/wiki/Bind_(higher-order_function)) takes two optional callbacks, the first is called when the promise was fulfilled while the second is called when the promise was rejected. Either must return another promise (of any fate), and the method will return a new promise for the resolution value of the promise which the respective callback did return.

Notice that this method is lazy and does not invoke the callback unless necessary.

### `promise.then` ###

The `then` method is a mix of `map` and `chain`. It acts as defined by the [Promises/A+ specification](http://promisesaplus.com/) and guarantees interoperability with other libraries.

Like `chain` it takes two optional callbacks and returns a promise for their result. If the callback does not return a promise (or promise-like object), that value will be used to fulfill the resulting promise. If the callback throws, the resulting promise will be rejected with the exception. The callback will be invoked with `undefined` as its `this` value.

Notice that this method is strict, and will always execute the respective callback (unless it was cancelled) as soon as the promise resolves.

## Combination ##

### `Promise.all` ###
The workings of `Promise.all` are a little complex due to the support of variadic arguments, but they all work *as you would expect*:

Normal mode of operation (with no or falsy second argument):  
| Promise.all([Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3)])        .then(([a1, a2, a3], [b1, b2, b3], [c1, c2, c3]) => )

Not passing an array as the first parameter works as if using `.spread()` with an array:  
| Promise.all(Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3))          .then((a1, a2, a3) => )  
| Promise.all([Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3)])      .spread((a1, a2, a3) => )

To get an array with the arguments of each promise, use  
| Promise.all([Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3)], true)  .then(([[a1, b1, c1], [a2, b2, c2], [a3, b3, c3]]) => )

Mimicking the odd behaviour of jQuery:when:  
| jQuery.when(Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3))          .then(([a1, b1, c1], [a2, b2, c2], [a3, b3, c3]) => )  
| Promise.all([Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3)], true).spread(([a1, b1, c1], [a2, b2, c2], [a3, b3, c3]) => )

Notice that the spreads could (but should not) also be achieved using  
| Promise.all([Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3)], 3)     .then(([a1, b1, c1], [a2, b2, c2], [a3, b3, c3]) => )  
| Promise.all([Promise.of(a1, b1, c1), Promise.of(a2, b2, c2), Promise.of(a3, b3, c3)], 2)     .then((a1, a2, a3) => )

### `Promise.race` ###


### `Promise.resolve` ###
`Promise.resolve` tries to make a promise from its arguments by applying the A+/ES6 `[[resolve]]` algorithm.  
This means it always returns a new promise, and it will assimilate a passed thenable recursively. Notice that `Promise` instances constructed by this library stay nested.

```
Promise.resolve("yeah").map(console.log) // yeah
Promise.resolve({…}).map(console.log) // {…}
Promise.resolve({then: function(cb){cb("yeah")}}).map(console.log) // yeah
Promise.resolve(Promise.of("yeah")).map(console.log) // yeah
Promise.resolve(Promise.reject(new Error("oh noes"))).mapError(console.log) // Error: oh noes
Promise.resolve({get then(){throw new Error("oh noes")}}).mapError(console.log) // Error: oh noes
Promise.resolve({then: function(){throw new Error("oh noes")}}).mapError(console.log) // Error: oh noes
Promise.resolve({then: function(_, cb){cb(new Error("oh noes"))}}).mapError(console.log) // Error: oh noes
```

# Implementation #

`F\Promise` is implemented via [continuations](https://en.wikipedia.org/wiki/Continuation). They expand the concept of callbacks, and invert the call stack. While a callback to a functions says "call me and I'll do something", it might also say "and then I'll tell you what else to do" - it returns a continuation. The caller will then at some point (he can decide) continue with that task. This is done to support long chains of operations without growing the call stack (as callbacks would do).

Continuations are supposed to be called only once and be used no more.
When continuations are executed, to are supposed to be considered *unsafe*, that is they might do harm when called multiple times - like executing a handler twice that must be called once only.
A continuation is *safe* when it simply does nothing when it is called not for the first time.
Some continuations are *volatile* and do different things on each call, e.g. returning itself for optimisations. They might be impure, but should not be written as unsafe.
A (volatile) continuation is *thread-safe* when it does no harm even on recursive calls.

### `promise.fork` ###
`fork` is the only primitive method of a promise, it's the atomic operation from which all other methods are composed. You'll **never use it** unless you want to extend the library; it's API should be considered unstable.

`fork` does take a `subscription` object as it's sole argument, it does not need to be called as a method. The subscription may have the following (optional) fields:

* `success`: to be called with the fulfillment values when the promise is fulfilled. Returns a continuation.
* `error`: to be called with the rejection values when the promise is rejected. Returns a continuation.
* `proceed`: to be called with the promise itself, when the respective one of the above handlers is not present. Returns a continuation.
* <s>`follow`: to be called with the promise itself, when it is settled and the respective one of the above handlers is not present. Returns an array of further subscriptions to invoke.</s>
* `instruct`: an Array of further subscriptions to process, when none of the above handlers is executed.
* `progress`: to be called with a progress event, returns a continuation
* `token`: a `CancellationToken` to register, which will prevent the cancellation-rejection of the promise until it is cancelled.
  When cancelled, the whole subscription becomes invalidated, and none of the above handlers are going to be executed.

The subscription object might get altered at will.

The `fork` method will return a continuation that when called will

* call the respective handler and return its continuation when the promise is settled
* advance the completion of the promise in a series of continuations until the above happens or
* return `undefined` when there is nothing more to do now (the advance was asynchronous)
  but guarantees that the respecive handler and all its continuations will be executed as soon as the promise is settled.

When this continuation is not called, the subscription is considered to be lazy, and the progress of the task can stall. It still can prevent the promise from being cancelled however.
The handlers will not be executed before this continuation has been called.

### `promise.send` ###
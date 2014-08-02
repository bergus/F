## Terminology ##

Extends https://github.com/promises-aplus/promises-spec#terminology

parent: the promise that `then` was called on, from which the `promise` originates
child: a thenable that a monadic callback returns
dependencies: all parents and childs on which the fate of a promise depends on
successors, followers: all promises that depend on a `promise`
Do not use *descendant*, which is ambiguous. Also, there is no relationship between a parent of a promise and a child of that promise.


# Methods #

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
`Promise.resolve` tries make a promise from its arguments by applying the A+/ES6 `[[resolve]]` algorithm.  
This means it always returns a new promise, and it will assimilate passed thenable recursively. Notice that `Promise` instances constructed by this library stay nested.

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

`F\Promise` is implemented via continuations. They expand the concept of callbacks, and invert the call stack. While a callback to a functions says "call me and I'll do something", it might also say "and then I'll tell you what else to do" - it returns a continuation. The caller will then at some point (he decides) continue with that task.

Continuations are supposed to be called only once and be used no more.
When continuations are executed, to are supposed to be considered *unsafe*, that is they might do harm when called multiple times - like executing a handler twice that must be called once only.
A continuation is *safe* when it simply does nothing when it is called not for the first time.
Some continuations are *volatile* and do different things on each call, e.g. returning itself for optimisations. They might be impure, but should not be written as unsafe.
A (volatile) continuation is *thread-safe* when it does no harm even on recursive calls.

### `promise.fork` ###
`fork` is the only primitive method of a promise, it's the atomic operation from which all other methods are composed. You'll **never use it** unless you want to extend the library; it's API should be considered unstable.

`fork` does take a `subscription` object as it's sole argument, it does not need to be called as a method. The subscription may have the following (optional) fields:

* `success`: to be called with the fulfillment values when the promise is fulfilled
* `error`: to be called with the rejection values when the promise is rejected
* `proceed`: to be called with the promise itself, when the respective one of the above handlers is not present
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
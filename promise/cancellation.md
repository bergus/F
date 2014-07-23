= Cancellation Token+ =
Extending the idea of https://github.com/promises-aplus/cancellation-spec/issues/8, going further and amend/modify the specification for `then`, so that handlers themselves can be prevented from execution.

Terminology
===========
1. A **`CancellationToken`** is an object with methods for determining whether an operation can be cancelled.
2. One `CancellationToken` might be **associated** with a promise.
2. Many `CancellationToken`s can be **registered** with a promise.
3. A **`CancellationError`**  is an error used to reject cancelled promises.
4. A **cancelled promise** is a promise that has been rejected with a `CancellationError`.
5. A **cancelled token** is a `CancellationToken` that is in the cancelled state, denoting that the result of the operation is no longer of interest. It might be considered an **unregistered** token or a **revoked** token.
6. A **cancelled callback** is an `onFulfilled` or `onRejected` argument to a `.then()` call whose `cancellationToken` has been revoked.

Requirements
============

[The `then` method](https://github.com/promises-aplus/promises-spec#the-then-method)
-----------------
Extensions are made to the following sections:
2.2.1. If `onFulfilled` is a function: 
2.2.1.1. it must be called ***unless it is cancelled*** after `promise` is fulfilled, with `promise`’s value as its first argument.
2.2.2.1. If `onRejected` is a function, 
2.2.2.2. it must be called ***unless it is cancelled*** after `promise` is rejected, with `promise`’s reason as its first argument.

Note: 2.2.1.3. and 2.2.2.3. ("must not be called more than once") stay in place, and still at most one of the two is called.

2.2.6.1. If/when `promise` is fulfilled, all respective ***uncancelled*** `onFulfilled` callbacks must execute in the order of their originating calls to `then`.
2.2.6.2. If/when `promise` is rejected, all respective ***uncancelled*** `onRejected` callbacks must execute in the order of their originating calls to `then`.

2.2.7.3. If `onFulfilled` is not a function and `promise1` is fulfilled ***and `promise2` was not cancelled***, `promise2` must be fulfilled with the same value as `promise1`.
2.2.7.4. If `onRejected` is not a function and `promise1` is rejected ***and `promise2` was not cancelled***, `promise2` must be rejected with the same reason as `promise1`.

(we probably need these last two in every cancellation spec anyway)

The `CancellationToken`
-----------------------
A `CancellationToken` is an object with a unique identity. It can get **revoked**, moving it into the **cancelled state**, which is an irreversible change.

The object has an `isCancelled` property, whose value must be a boolean[, or a function that returns a boolean]. It must yield `true` if the token is in the *cancelled state*, and `false` otherwise.

Retrieving the state of a cancellation token must not change the state, i.e. an `isCancelled` function must have no side effects.

The `CancellationError`
-----------------------
1. It must be an instance of `Error` (`cancellationError instanceof Error === true`).
2. It should have a `name` property with value `"CancellationError"`.
3. It must have a `cancelled` property with value `true`.

The `cancellationToken` parameter
---------------------------------
The fourth parameter of the `then` method is an optional `cancellationToken`; a call does look like

    promise = parentPromise.then(onFulfilled, onRejected, onProgress, cancellationToken)

If `cancellationToken` is not a `CancellationToken` object, create an **implicit CancellationToken** for the new `promise`. In both cases (explicit and implicit) *associate* it with the new `promise`. The state of an explicit token must not be changed by the `then` method.

*Register* this cancellation token with the `parentPromise`.

Also *register* this cancellation token with any `child` promises that are returned from `onFulfilled` or `onRejected` (2.2.7.1). This includes passing the cancellation token to the `then` call in step 2.3.3.3. of the Promise Resolution Procedure.

If the `promise` is **attempted to be cancelled** with an `error`, run the following steps:
1. If its *associated token* is an *implicit token*, test whether all the *registered tokens* on it are cancelled. If so, *revoke* the implicit token.
2. If its *associated token* is not cancelled, return.
3. If `parentPromise` is pending, *attempt to cancel* it with `error`.
4. [If `onRejected` is a function and neither it nor `onFulfilled` have been called, execute it with the `error` as its argument. (with 2.2.4. "async execution", and 2.2.7.1. "assimilation" in mind)]
5. If `onFulfilled` or `onRejected` have been called and returned a `child` promise, *attempt to cancel* that with `error`.
6. [Only if none of the cancellation attempts was successfull [and `onRejected` will not be executed]], *reject* `promise` with `error`.
7. Signal success.

The `cancel` method
-------------------
The `cancel` method of a promise accepts two optional parameters:

    promise.cancel(reason, token);

1. Assert: `promise` is still *pending*. Return `false` otherwise.
2. If `reason` is a `CancellationError`, let `error` be that error object, else let `error` be a new `CancellationError` with the `reason` as the value of its `message` property.
3. If `token` is a `CancellationToken`, *revoke* it.
4. *Attempt to cancel* the `promise` with `error`.

The `Promise` constructor
-------------------------
Promises not created by a call to `then` may handle *attempts to cancel* them in implementation-dependent ways.

Constructors are however encouraged to signal these to the promise creators, and optionally provide them access to the list of *registered tokens*. This might be done through a callback that is passed as an additional argument to the `Promise` constructor, or returned from the `resolver` call.

----

Pluses:
* no ambiguity when a promise is cancelled before the handlers of its resolved parent could be executed

        // Example:
        var promise = fulfilled.then(willNeverBeExecuted); promise.cancel();
        // or:
        parent.then(function() { promise.cancel() }); promise = parent.then(willNeverBeExecuted);
* making a promise uncancellable is trivial: `.then(null, null, null, {isCancelled:false})`
* forking a promise (to prevent immediate cancellation) is even more trivial: `.then()`

Minus:
* I can't think of a way to implement `finally` in terms of `.then()` without preventing cancellation - it is not possible to add a handler via calling `.then()` without registering a token.

The basic idea of this draft is that handlers that were passed to `then` will not be executed when the cancellation token that accompanied them is cancelled:

    var ajax = http.get(…);
    ajax.then(doSomething);
    var json = ajax.then(JSON.parse);
    // later:
    json.cancel(); // `ajax` can't be cancelled (because `doSomething` is still in-
                   // terested in it), but the `JSON.parse` won't need to be executed

I'm not so sure about the steps 4 and 6 of *cancellation attempts*.
* Putting step 4 into place ensures that still one of the two handlers is executed, and might allow interesting patterns to deal with cancellations.
* Putting the condition in step 6 allows for the cancellation error to bubble through the chain (without disturbing side ~~effects~~ handlers, notice that all forks/branches have been ~~cut~~ cancelled so it's a linear chain). For discussion, see issue #10.
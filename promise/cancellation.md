* cancellable should be the default, every `then` call returns a cancellable promise
* promise chain ends can always be cancelled
* every promise can decide how to react to cancellation attempts - uncancellable promises simply ignore them
* a promise should inform its creator of suceeding cancellation attempts
* there is no existing synchronous control structure that would be appropriate for handling asynchronous cancellations in a coro runner or async function.
  - while catch
  - explicitly use cancellationTokenSources to pass around as arguments
  - cancellation is the new generator .return
  - ideas for new control structures?

Rationale
=========
Cancellation is not an error and not a fulfillment. It means that the resolution value is no more needed, the underlying process to compute it can and shall be aborted (like an XMLHttpRequest). The callbacks just don't get called any more, there is no error passing through the errorback chain.

For this, callbacks which are attached to a promise can be revoked so that they will not be called regardless what happens to the promise - as if it was forever pending.
To support branching of promise chains without introducing unexpected cancellations, every promise keeps track of how many callbacks are attached and not revoked. When it is attempted to be cancelled, it can ensure that no callbacks are interested in the result any more. After asserting this, it can (and should) attempt to cancel all other promises that it depends on (or alternatively, abort the non-promise primitive it is built for). Mid-chain cancellation attempts are not effective in this scenario.

The design is built on two pillors:
* callbacks themselves can be cancelled/revoked/unregistered/ignored so that they won't be called.
  This is done via "passive" tokens that are registered together with the callbacks
* promises can be attempted to be cancelled, triggering the abort action of the underlying task - when there are no more active callbacks
  This is done via a `.cancel()` method call on the promise

The basic idea of this draft is that handlers that were passed to `then` will not be executed when the cancellation token that accompanied them (usually implicitly) is cancelled:

    var ajax = http.get(…);
    var some = ajax.then(doSomething);
    var json = ajax.then(JSON.parse);
    // later:
    json.cancel(); // `ajax` can't be cancelled (because `doSomething` is still in-
                   // terested in it), but the `JSON.parse` won't need to be executed

Extending the idea of https://github.com/promises-aplus/cancellation-spec/issues/8, going further and amend/modify the specification for `then`, so that handlers themselves can be prevented from execution.

Terminology
===========
1. A **`CancellationToken`** is an object with methods for determining whether an operation can be cancelled.
   It doesn't need to offer a subscription mechanism for the event of becoming cancelled
2. One `CancellationToken` might be **associated** with a promise.
2. Many `CancellationToken`s can be **registered** with a promise, each optionally linked to a registered callback
3. A **`CancellationError`**  is an error used to reject cancelled promises.
4. A **cancelled promise** is a promise that has been rejected with a `CancellationError`.
5. A **cancelled token** is a `CancellationToken` that is in the cancelled state, denoting that the result of an operation is no longer of interest. It might be considered a **revoked** token.
6. A **cancelled callback** is an `onFulfilled` or `onRejected` handler whose corresponding `cancellationToken` has been revoked. (All three might have been arguments to a `.then()` call). It might be considered an **unregistered** or **ignored** callback.

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

[The Promise Resolution Procedure](https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure)
-----------------
2.3.2 If `x` is a promise, adopt its state
2.3.2.1 If `x` is pending, `promise` must remain pending until `x` is fulfilled or rejected. ***The cancellatition token *associated* with `promise` is *registered* on `x`.
2.3.2.2 If/when `x` is fulfilled, fulfill `promise` with the same value ***unless `promise` had been cancelled***.
2.3.2.3 If/when `x` is rejected, reject `promise` with the same reason ***unless `promise` had been cancelled***..
2.3.2.4 When `promise` is cancelled, *attempt to cancel* `x`.

2.3.3.1 If `then` is a function, call it with `x` as `this`, first argument `resolvePromise`, second argument `rejectPromise` ***and fourth argument `token`***, where
2.3.3.1.5 `token` is a CancellationToken reflecting the state of the token *associated* to `promise` (it can be the same object, or a proxy for it)
2.3.3.1.6 When `promise` is cancelled, try to invoke `x.cancel()` as a method (ignoring exceptions)

The `cancellationToken` parameter
---------------------------------
The fourth parameter of the `then` method is an optional `cancellationToken`; a call does look like

    promise = parentPromise.then(onFulfilled, onRejected, onProgress, cancellationToken)

If `cancellationToken` is not a `CancellationToken` object, create an **implicit CancellationToken** for the new `promise`. In both cases (explicit and implicit) *associate* it with the new `promise`. The state of an explicit token must not be changed by the `then` method.

*Register* this cancellation token on the `parentPromise` together with the `onFulfilled` and `onRejected` callbacks.

This cancellation token will also be *registered* with any `child` promises that are returned from `onFulfilled` or `onRejected` (2.2.7.1), see the Promise Resolution Procedure above for details.

Attempts to cancel
------------------
If a `promise` is **attempted to be cancelled** with an `error`, run the following steps:
1. If its *associated token* is an *implicit token*, test whether all the *registered tokens* on it are cancelled. If so, *revoke* the implicit token.
2. If its *associated token* is not cancelled, return.
3. Cancel the `promise` by *rejecting* it with `error`. [Note: this is necessary for handlers that have not registered a token, or that might be attached later]
4. Trigger instance-specific cancellation behaviour, e.g. for promises created via `then`:
4.1. If `parentPromise` is pending, *attempt to cancel* it with `error`.
4.2. If `onFulfilled` or `onRejected` have been called and returned a `child` promise, *attempt to cancel* that with `error`.
5. Signal success to the caller.

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
* braching of promise chains is handled gracefully
* no explicit token passing necessary, the default is to work out of the box with existing code by creating implicit tokens
* no ambiguity when a promise is cancelled before the handlers of its resolved parent could be executed

        // Example:
        var promise = fulfilled.then(willNeverBeExecuted); promise.cancel();
        // or:
        parent.then(function() { promise.cancel() }); promise = parent.then(willNeverBeExecuted);
* making a promise uncancellable is trivial: `.then(null, null, null, {isCancelled:false})`
* forking a promise (to prevent immediate cancellation) is even more trivial: `.then()`
* cancelling promises "from the inside" is possible by passing an explicit token within a `then` chain:

        // Example (whether this is an appropriate use of promises is another question):
        function getUserchoice() {
            var token = {isCancelled: false};
            var promise = getClick("#radio").then(function(button) {
                return button.value;
            }, null, null, token);
            getClick("#close").then(function(reason) { promise.cancel(reason, token); });
            return promise;
        }
        getUserChoice() // might get rejected "by itself"
* the explicit `token` parameter and `.cancel()` invocation ensure interoperability between implementations

Minus:
* There's not yet a way to add a handler via calling `.then()` without registering a token; such would be necessary to implement `finally` or `onCancelled`. Promise implementations need an additional token-less callback-registering method, or the `.then()` above needs to be tweaked (e.g. to only create an implicit token when `null` or `undefined` is passed, and not to register anything when something that is not a cancellation token is passed (`false`, objects with `isCancelled`, etc).
* Adding a parameter to `then` is cumbersome, it should not collide with [progression callbacks](https://github.com/promises-aplus/progress-spec) (that's why I have simply chosen to use the fourth parameter, better ideas welcome)
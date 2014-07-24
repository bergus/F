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
Naming
------

Data structures:

> Stream Flow Behaviour List Sequence Node Bus Property Eventstream Signal Series Pipe Channel EventEmitter
>
> data item event element value packet error

The library:

* F
* It's complicated.
* Functional ... glitch free ... reactive

Influences
----------

http://baconjs.blogspot.de/
https://github.com/baconjs/bacon.js
https://github.com/baconjs/bacon.js/wiki/Diagrams
http://www.flapjax-lang.org/docs/
The way Elm does it: https://github.com/baconjs/bacon.js/issues/85#issuecomment-17771273
For literature see https://en.wikipedia.org/wiki/Functional_reactive_programming

Thoughts
--------

Collections provide interesting temporal manipulations like filtering by "add" time window, or N most recent values
 Example: an ajax request queue
  var q = new EventCollection("queue"); make=promise(q.dispatch(type=add,value=requestparams); |->e.isExecuted); new Interval(500).mapSend(q,action=shift).executeEach()
  with side effect: q.get(length).displayAt(...)
  q.removeScanl(x->execute x)?

watch out:
* bypassing asynchronous computation can be hazardous. compose(fetch(urlB), urlB) leads to invalid state during fetching
* timeouts should be done with a global clock, to prevent unnecessary dispatches when several "branches" do independent timeouts of equal length

listening an event should return?
* the priority level
* the current value
* the unlisten function
* lazyness of values

Problems (and suggested solutions)
----------------------------------

* unknown priorities: compose(streamPrio1, streamPrio2.bind(()->streamPrioN))
* propagating priorities should not greedily update whole graph
* who is allowed to change the priority, and in which direction?
* when does the priority need to be updated?
			Imho: after level n, all priorities in n+1 need to have been updated.
			or is it: in level n, we update n instead of executing it? NO
* How do multiple concurrent/parallel events work?
			Extra handler method or calling handleEvent() multiple times before the next priority level
			- Am I crazy? This will horribly complicate state in nodes
			  or is it necessary?
			should this be handled by the listenermanager (and the listenercreator)?
			why not simply pass an array of events? - only where expected or what?
  Use wrappers to "discretize" parallel events in own environment with own dispatch method and explicit, "parallel" output
* How does lazy listening work with asynchronous combinators?
			It does not, async is a kind of output and requires a strict listener
			The computations may be deferred though, using lazyness
* Adding the first listener starts event propagation - go(). How is its priority computed and assigned?
			Recursively. After the call to go(), the priority is expected to be known; and can be assigned as usual
* Should a listener receive the current event (if any?) when being installed?
  What about a listener that is removed?
  			A Behaviour listener should definitely.
  Regardless of yes or no, this must not depend on the priority of the listener and the current state of dispatching at the installation 
* How is the outside world representated? Isn't there a circular event stream?
            run :: (EventStream a -> ValueStream (IO b) | EventStream b) -> output (O b, I a) -> IO b
            @TODO check FRP paper on exact type signature
* 

Methods and Functions proposals
-------------------------------

Behavior.object :: `{*:(Behavior *)} -> Behavior {*:*}`

all, seq, allSettled:	[Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..] -> Monad Arg([a1,b1,..],[a2,b2,..])
						Arg(Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..) -> Monad Arg(a1, b1, ..) -- spread or transposed?
spread:					Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg(a1, b1, ..)
transpose:				Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg([a1,a2,..], [b1,b2,..], ..)


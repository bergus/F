Naming
------

Data structures:

> Stream Flow Behaviour List Sequence Node Bus Property Eventstream Signal Series Pipe Channel EventEmitter
>
> data item event element value packet error

The library:

* F
* It's complicated. complex?
* Functional ... glitch free ... reactive ... fluid
* Rhea, rhei?


Influences
----------

- http://baconjs.blogspot.de/
- https://github.com/baconjs/bacon.js
- https://github.com/baconjs/bacon.js/wiki/Diagrams
- http://www.flapjax-lang.org/docs/
- The way Elm does it: https://github.com/baconjs/bacon.js/issues/85#issuecomment-17771273
- For literature see https://en.wikipedia.org/wiki/Functional_reactive_programming


Thoughts
--------

Collections provide interesting temporal manipulations like filtering by "add" time window, or N most recent values

How to do describe collections and (application of) actions on them in terms of event streams?
Possible syntax for an ajax request queue
  var q = new EventCollection("queue"); make=promise(q.dispatch(type=add,value=requestparams); |->e.isExecuted); new Interval(500).mapSend(q,action=shift).executeEach()
  with side effect: q.get(length).displayAt(...)
  q.removeScanl(x->execute x)?

watch out:
* bypassing asynchronous computation can be hazardous. compose(fetch(urlB), urlB) leads to invalid state during fetching
* timeouts should be done with a global clock, to prevent unnecessary dispatches when several "branches" do independent timeouts of equal length
  If this is not anticipated in user code, it can lead to parallel event dispatch which might not be expected 

listening to an event should return?
* the priority level
* the current value
* the unlisten function
* lazyness of values

  An event listener added during the dispatch is expected not to receive the current event.
  An event listener removed during the dispatch is expected to have received the current event already. (i.e. should wait for it!)
  A  value listener added during the dispatch is expected     to receive the current value (at some point during the dispatch)
  A  value listener removed during the dispatch is not expected to know anything

Problems (and suggested solutions)
----------------------------------

* unknown priorities: compose(streamPrio1, streamPrio2.bind(()->streamPrioN))
			Propagate priorities as well.
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
* Do ValueStreams update only for the last value in a sequence? No - compromises state. "SkipUpdate" might be an option for some behaviours, evaluating to a single propagated value.
                                                               of parallel events?  Yes. There is no state in between. 
* How does lazy listening work with asynchronous combinators?
			It does not, async is a kind of output and requires a strict listener
			The computations may be deferred though, using lazyness
* Should ValueStreams have Promise-like error handling?
			Propagating Error objects instead of arguments objects could work fine.

* Adding the first listener starts event propagation - go(). How is its priority computed and assigned?
			Recursively. After the call to go(), the priority is expected to be known; and can be assigned as usual
* Should a listener receive the current event (if any?) when being installed?
  What about a listener that is removed?
			A Behaviour listener should definitely.
  Regardless of yes or no, this must not depend on the priority of the listener and the current state of dispatching at the installation
* How are listeners attached during dispatch phase?
			The behaviour should be defined explicitly by used method, which may return a Continuation for the action
			see proposal under #thoughts.
* 
 
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


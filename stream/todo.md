Naming
------

Data structures:

> Stream Flow List Node Property Eventstream Eventsource Signal Series EventEmitter Variable
>
>> Bus Pipe Channel: plugged between source and drain
>> Sequence: something that ends
>> Behaviour: continuous-time varying value (with "time function" part)
>
> data item event element value packet error

The library:

* F
* It's complicated. complex?
* Functional ... glitch free ... reactive ... fluid
* Rhea, rhei?
* F\rhei - functional reactive high efficiency implementation
                               higher-order environment
                               highly-


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

Ideas:
* Collections provide interesting temporal manipulations like filtering by "add" time window, or N most recent values
* TimeBehaviour: A ValueStream of TimeEquations that can be composed lazily and executed/evaluated for a given time to produce a value
  they might allow Integration / Derivation over time
* Replay Streams: Store start values, record input events - and have a time machine for every output state in the event sequence
  only well-suited for referential transparent functions - the streams should have no internal state and should not be time-dependent
* CircularEvaluation: Fix-point behaviours! Where does the circle start when two of its inputs are changed at the same time?
  Kreise können nur mit einem Prioritätssprung verwirklicht werden, derjenige Knoten hat die Verantwortung für die Semantik

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
  A  value listener added during the dispatch is expected     to receive the current value, which might be the old or new value
  A  value listener removed during the dispatch is not expected to know anything

Problems (and suggested solutions)
----------------------------------

* unknown priorities: `compose(streamPrio1, streamPrio2.bind(()->streamPrioN))`
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
* What if they occur at the same time, but are ordered in a defined sequence?
  Use wrappers to "discretize" parallel events in own environment with own dispatch method and explicit, "parallel" output
* Do ValueStreams update only for the last value in a sequence? No - compromises state. "SkipUpdate" might be an option for some behaviours, evaluating to a single propagated value.
                                                               of parallel events?  Yes. There is no state in between.
* Do multiple, concurrently propagated values make sense in ValueStreams at all? Which one should be the "last", persisting one?
* How does lazy listening work with asynchronous combinators?
			It does not, async is a kind of output and requires a strict listener
			The computations may be deferred though, using lazyness
* Should streams have Promise-like error handling?
			Propagating Error objects instead of arguments objects could work fine.
			Yes, ValueStreams should be able to represent an error state, and respect this in their monadic properties
				How? Node-style callbacks? Separate error listeners? What about `fire()`
			No, EventStreams have no notion of state and treat every passed item (event or error) equally

* Adding the first listener starts event propagation - `go()`. How is its priority computed and assigned?
			Recursively. After the call to `go()`, the priority is expected to be known; and can be assigned as usual
* How to detect circles in the priority DAG
  How to detect circles in `valueOf()` calls
			Putting a lock on `setPriority()`? Notice that it's not recursive
* Should a listener receive the current event (if any?) when being installed?
  What about a listener that is removed?
			A Behaviour listener should definitely.
  Regardless of yes or no, this must not depend on the priority of the listener and the current state of dispatching at the installation
* How are listeners attached during dispatch phase?
			see proposal under #thoughts.
			A behaviour listener could happen to be called multiple times for initialisation, but should only use the last of these values
			Identity is expected: `anyStream.flatMap(_ -> someStream) = someStream`
* How can an EventStream.getLastEvent() ValueStream be garbage-collected? Does it need to be explicitly stopped?
  
  idea: something along the lines of
  Stream.prototype.fork = function(o) {
  	if (o == null) {
  		o = Object.create(Object.getPrototypeOf(this));
  		for (var p in this)
  			if (this.hasOwnProperty(p))
  				o[p] = this[p];
  	}
  	var disposed = false,
  		that = this;
  	o.dispose = function() {
  		if (disposed) return;
  		disposed = true;
  		if (! --that.forks)
  			that.dispose();
  		o.dispose = noop; // garbage collect!
  	};
  	this.forks = (this.forks || 0) + 1;
  	return o;
  }
  though "dispose" might use send() actually
 
* How is the outside world representated? Isn't there a circular event stream?
			`run :: (EventStream a -> ValueStream (IO b) | EventStream b) -> output (O b, I a) -> IO b`
			@TODO check FRP paper on exact type signature
* Can `fire` and `propagatePriority` be used as a listener and it's setPriority method, for most easy (performant?) chaining?
* Circular dependent components:
  - game (input events -> state) and player (state[, game events] -> actions)
  - filtering a collection by attributes, greying out non-availabe attribute values in the filter interface

Methods and Functions proposals
-------------------------------

Behavior.object :: `{*:(Behavior *)} -> Behavior {*:*}`

all, seq, allSettled:	[Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..] -> Monad Arg([a1,b1,..],[a2,b2,..])
						Arg(Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..) -> Monad Arg(a1, b1, ..) -- spread or transposed?
spread:					Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg(a1, b1, ..)
transpose:				Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg([a1,a2,..], [b1,b2,..], ..)

combine:				(Arg(a1, b1, …) -> r), [Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..] -> Monad Arg(r)

merge:					[EventStream a] -> EventStream a
zip:					[EventStream a] -> EventStream [a]


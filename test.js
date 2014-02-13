/*
var mouse = getEventStream(document, "mousemove")
	position = mouse.get("clientX"),
	barleft = position.map(add(-50)),
	barright = position.map(add(50)),
	clipleft = barleft.map(Math.max.bind(null, -100)),
	clipright = barright.map(Math.min.bind(null, 100)),
	actuallength = compose(clipleft, clipright, function(l, r){ return r-l;});
	// expect actuallength to be updated only once per mouse event

var rStr = getRandomEventStream(),
    doubled = merge(rStr, rStr),
    num = doubled.count();
    // expect num to be always even
var mult = getMultiEventStream(), // where a couple of events are fired at the same time
    doubled = merge(mult, mult), // well, what's supposed to happen here?
    num = doubled.count(), // must be even and might update only a single time
    counts = mult.tag(num) // but not if we rip an event of it every time `mult` fires
    // Also: (how) Can we get mult events back from doubled?

*/
// Behavior.object :: {*:(Behavior *)} -> Behavior {*:*}
/*
Stream: propagates events. Might be/have a context that changes.
EventStream: fires discrete events. Those should have a `type` or be Error instances otherwise.
Behavior / ValueStream: represents a changing value. Can have initial value (defaults to undefined). Does not propagate unchanged values.
                        Updates only for the last value in a sequence? No - compromises state. "SkipUpdate" might be an option for some behaviours.
                                                                     of parallel events?  Yes. There is no state in between.  
						has .valueOf method to evaluate value during a propagation phase
						Promise-like error handling?

Collections: streams with add/remove(/update) events in context of a set or list or map
 a collection can have an ordering, like fifo, lifo (stack), sortedBy, or custom.
 interesting temporal manipulations like filtering by "add" time window, or N most recent values
 Example: an ajax request queue
  var q = new EventCollection("queue"); make=promise(q.dispatch(type=add,value=requestparams); |->e.isExecuted); new Interval(500).mapSend(q,action=shift).executeEach()
  with side effect: q.get(length).displayAt(...)
  q.removeScanl(x->execute x)?
*/

/* Examples:
Drag'n'Drop: ValueStream of Promises (for drop actions) that fire Progress-EventStreams for the drag-animation
Resettable Timer: ValueStream of Clock-Behaviors or Interval-EventStreams -> flatten to Stream of "reset" and "tick" events
CircularEvaluation: Fix-point behaviours! Where does the circle start when two of its inputs are changed at the same time?

watch out:
* bypassing asynchronous computation can be hazardous. compose(fetch(urlB), urlB) leads to invalid state during fetching
* timeouts should be done with a global clock, to prevent unnecessary dispatches when several "branches" do independent timeouts of equal length
* 

*/
/*
Continuation [extends Function?] {
	call(null): do what is to be done. Return a Continuation or undefined
	priority: lower is more urgent. Must not be changed.
}
EventListener extends Continuation {
	handleEvent(v) extends call(s: Stream, v): receive value in context 
	setPriority(p): a new priority level, set by the EventTarget on which the listener is installed
	                returns Continuation or undefined
	// better: increasePriority()/decreaseUrgency()? 
	priority: 0. Should be read-only
}

Invarianten auf dem Graphen:
* Kreisfreiheit. Kreise können mit einem Prioritätssprung verwirklicht werden, derjenige Knoten hat die Verantwortung für die Semantik
* priority/subordinacy are used to describe a partial ordering, so that the nodes can be topologically sorted
* A listener MUST NOT be executed when there is a waiting listener with higher priority
* The priority of a (yielded) continuation MUST not be changed
* A continuation MUST NOT yield a continuation with lower priority than itself
* An event listener added during the dispatch is expected not to receive the current event.
  An event listener removed during the dispatch is expected to have received the current event already. (i.e. should wait for it!)
  A  value listener added during the dispatch is expected     to receive the current value (at some point during the dispatch)
  A  value listener removed during the dispatch is not expected to know anything
* 

Problems:
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

*/

/*

listening an event should return?
 * the priority level
 * the current value
 * the stop function
 * lazyness of values

*/

function map(fn, stream) {
	return new Stream(function(fire, propagatePriority) {
		function listener(v) {
			return fire(fn(v));
		}
		listener.priority = 0;
		listener.setPriority = function(p) {
			this.priority = p;
			return propagatePriority(p).getContinuation();
		}
		function go() {
			stream.addListener(listener);
			propagatePriority(listener.priority);
			return stop;
		}
		function stop() {
			stream.removeListener(listener);
			return go;
		}
		return go;
	});
}
function compose(streams) {
	var l = streams.length;
	
	return new Stream(function(fire, propagatePriority) {
		var listeners = new Array(l),
		    prio = 0; // priority of the listeners
		    steps = [], // @TODO: simple counter instead of set of active steps?
		    values = new Array(l); // @FIXME array of arrays of arguments
		function setPriority(p) {
			if (p <= prio || p <= this.priority) return;
			prio = this.priority = p;
			propagatePriority(prio+1).each(steps, function(_, i) {
				return steps[i] = makeStep();
			}).getContinuation();
		}
		function makeStep() {
			function continuation() {
				var i = steps.indexOf(continuation);
				if (i < 0) // || continuation.priority <= prio
					return;
				steps.splice(i, 1);
				return fire(values.map(function(vs) {
					return vs.shift();
				}));
			}
			continuation.priority = prio+1;
			return continuation;
		}
		function makeListener(i) {
			function listener(v) {
				if (i in values)
					values[i].push(v);
				else
					values[i] = [v];
					
				if (values[i].length > steps.length) {
					var last = makeStep();
					steps.push(last);
					return last;
				}
			}
			listener.setPriority = setPriority;
			return listener;
		}
		for (var i=0; i<l; i++)
			listeners[i] = makeListener(i); 
		function go() {
			for (var i=0; i<l; i++) {
				streams[i].addListener(listeners[i]);
				if (listeners[i].priority > prio) {
					prio = listeners[i].priority;
					propagatePriority(prio+1);
					// console.assert(typeof propagatePriority(prio+1) == "function", "Stream|compose: propagating priority during go() requires continuation dispatch");
				}
			}
			return stop;
		}
		function stop() {
			for (var i=0; i<l; i++) {
				streams[i].removeListener(listeners[i]);
			}
			return go;
		}
		return go;
	});
}

// all, seq, allSettled:	[Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..] -> Monad Arg([a1,b1,..],[a2,b2,..])
// 							Arg(Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..) -> Monad Arg(a1, b1, ..) -- spread or transposed?
// spread:					Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg(a1, b1, ..)
// transpose:				Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg([a1,a2,..], [b1,b2,..], ..)

// The way Elm does it: https://github.com/baconjs/bacon.js/issues/85#issuecomment-17771273


Array.prototype.insertSorted = function(el, by) {
	if (typeof by != "function")
		by = Object.get(by);
	var l = this.length,
		cel = by(el);
	if (l == 0)
		this[0] = el;
	else if (cel < by(this[0])) // check common case in O(1)
		this.unshift(el);
	else if (l == 1 || cel >= by(this[l-1]))
		this.push(el);
	else
		// insortBy - see also Array::insort
		this.splice(1+this.binaryIndexFor(function(a) {
			var ca = by(a);
			return +(ca>cle) || -(ca<cel);
		}), 0, el);
};
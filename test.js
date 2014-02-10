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
 interesting temporal manipulations like filtering by "add" time window, or N most recent values
*/

/* Examples:
Drag'n'Drop: ValueStream of Promises (for drop actions) that fire Progress-EventStreams for the drag-animation
Resettable Timer: ValueStream of Clock-Behaviors or Interval-EventStreams -> flatten to Stream of "reset" and "tick" events
CircularEvaluation: Fix-point behaviours! Where does the circle start when two of its inputs are changed at the same time?

watch out: bypassing asynchronous computation can be hazardous. compose(fetch(urlB), urlB) leads to invalid state during fetching

*/
/*
Continuation [extends Function?] {
	call(c): do what is to be done. Return a Continuation or undefined
	priority: lower is more urgent. Must not be changed.
}
EventListener extends Continuation {
	handleEvent(v) extends call(c, v): receive value in context 
	setPriority(p): a new priority level, set by the EventTarget on which the listener is installed
	                returns Continuation or undefined
	// better: increasePriority()/decreaseUrgency()? 
	priority: 0. Should be read-only
}

Invarianten auf dem Graphen:
* Kreisfreiheit. Kreise können mit einem Prioritätssprung verwirklicht werden, derjenige Knoten hat die Verantwortung für die Semantik
* priority/subordinacy are used to describe a partial ordering, so that the nodes can be topologically sorted
* A listener MUST NOT be executed when there is a waiting listener with higher priority
* 

Problems:
* unknown priorities: compose(streamPrio1, streamPrio2.bind(()->streamPrioN))
* propagating priorities should not greedily update whole graph
* what should happen to waiting continuations/event listeners whose priority has changed?
* who is allowed to change the priority, and in which direction?
* when does the priority need to be updated? Imho: after level n, all priorities in n+1 need to have been updated.
                                             or is it: in level n, we update n instead of executing it? NO
* How do multiple concurrent/parallel events work? Extra handler method
                                                   or calling handleEvent() multiple times before the next priority level
                                                      - Am I crazy? This will horribly complicate state in nodes
                                                        or is it necessary?
                                                   should this be handled by the listenermanager (and the listenercreator)?
                                                   why not simply pass an array of events? - only where expected or what?
  Use wrappers to "discretetisize" parallel events in own environment with own dispatch method and explicit, "parallel" output
* How does lazy listening work with asynchronous combinators? It does not, async is a kind of output and requires a strict listener
                                                              The computations may be deferred though, using Lazy.js
*     

*/

/*

listening an event should return?
 * the priority level
 * the current value
 * the stop function
 * lazyness of values

*/
function ContinuationManager() {
	var waiting = [];
	
	function next() {
		if (waiting.length <= 1)
			return waiting.shift();
		suspended.priority = waiting[0].priority;
		return suspended;
	}
	function suspended() {
		var postponed = waiting.shift().call();
		if (typeof postponed == "function")
			waiting.insertSorted(postponed, "priority");
		return next();
	}
	this.each = function (arr, cb) {
		for (var i=0, l=arr.length; i<l; i++) {
			var cont = cb(arr[i], i);
			if (typeof cont == "function")
				waiting.insertSorted(cont, "priority");
		}
		return this;
	};
	this.getContinuation = next;
	// ensure all waiting have higher priority than the current?
}

function dispatch(event, listeners, context) {
	var next = fire(event, listeners, context);
	while (typeof next == "function") // boing boing boing
		next = next();                // trampolining is fun!
	/*
	var waiting = listeners.slice(),
		postponed;
	while (waiting.length)
		if (typeof (postponed = listeners.shift().call(context, event)) == "function")
			waiting.insertSorted(postponed, "priority"); */
}
function map(fn, listeners) {
	// stream.listen(map(fn, [...]))
	return function listener(event) {
		event = fn.apply(this, arguments);
		return fire(event, listeners, this);
	};
}
function compose() {
	var args = arguments,
	    l = args.length;
	
	return new Stream(function(fire, propagatePriority) {
		var listeners = new Array(l),
		    prio = 0;
		    steps = [],
		    latest = null; // @TODO: steps could intersect calling their listeners (a1,a2,b1,b2 instead of a1,b1,a2,b2)
		    new Array(l);
		function setPriority(p) {
			if (p < prio) return;
			prio = p;
			propagatePriority(p);
		}
		function makeStep(vals) {
			var values = vals || new Array(l),
				hasFired = false;
			function continuation() {
				if (hasFired)
					return;
				if (continuation.priority < prio)
					// @TODO: problems
				return fire(values);
			}
			continuation.priority = prio;
			values.cont = continuation;
			return values;
		}
		function makeListener(i) {
			function listener(v) {
				if (!latest || i in latest)
					steps.push(latest = makeStep());
				latest[i] = v;
				return latest.continuation;
			}
			listener.setPriority = setPriority;
			return listener;
		}
		for (var i=0; i<l; i++)
			listeners[i] = makeListener(i); 
		function go() {
			for (var i=0; i<l; i++) {
				arguments[i].addEventListener(listeners[i]);
				if (listeners[i].priority > prio)
					// @TODO
			}
			return stop;
		}
		function stop() {
			for (var i=0; i<l; i++) {
				args[i].removeEventListener(listeners[i]);
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
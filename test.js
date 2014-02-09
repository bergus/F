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
* 

*/

/*

listening an event should return?
 * the priority level
 * the current value
 * the stop function

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
function ListenerManager() {
	var listeners = [],
		prio = 0;
	this.add = function(ls) {
		listeners.push(ls);
		ls.priority = prio+1;
		return this;
	};
	this.remove = function(ls) {
		var i = listeners.indexOf(ls);
		if (i >= 0)
			listeners.splice(i, 1);
		return this;
	};
	this.fire = function(event) {
		// invokes all given listeners with event and context
		// returns: Continuation or undefined

		return new ContinuationManager().each(listeners, function(l) {
			return l.call(context, event);
		}).getContinuation();
	};
	this.setPriority(p) {
		// might be invoked on a listener function, not the manager
		if (p < prio)
			throw "ListenerManager::setPriority: Reducing priority is not designed (yet)";
		if (p <= this.priority)
			return;
		prio = p;
		return new ContinuationManager().each(listeners, function(l) {
			if (l.priority <= prio) {
				return l.setPriority(prio+1);
		}).getContinuation();
	}
}

Array.insertSorted = function(el, by) {
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
	var res = new ListenerManager(),
		l = argument.length,
		values = new Array(l);
	function makeListener(i) {
		function listener(v) {
			values[i] = v;
			return continuation;
		}
		listener.setPriority = res.setPriority;
		return listener;
	}
	for (var i=0; i<l; i++) {
		arguments[i].add(makeListener(i))
	}
	return res;
}

// all, seq, allSettled:	[Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..] -> Monad Arg([a1,b1,..],[a2,b2,..])
// 							Arg(Monad Arg(a1,a2,..), Monad Arg(b1,b2,..),..) -> Monad Arg(a1, b1, ..) -- spread or transposed?
// spread:					Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg(a1, b1, ..)
// transpose:				Monad Arg([a1,b1,..],[a2,b2,..]) -> Monad Arg([a1,a2,..], [b1,b2,..], ..)

// The way Elm does it: https://github.com/baconjs/bacon.js/issues/85#issuecomment-17771273
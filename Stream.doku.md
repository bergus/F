Invariants and Contracts
---------------------------

* The priority graph is acyclic.
* priority/subordinacy are used to describe a partial ordering, so that the nodes can be topologically sorted
* dispatcher.start SHOULD only be invoked asynchronically, i.e. in a dedicated event loop cycle
* dispatcher.start MUST NOT be invoked during a dispatch phase
* A listener MUST NOT be executed when there is a waiting continuation with smaller priority value
* The priority of a (yielded, therefore waiting) continuation MUST not be changed
* A continuation MUST NOT yield a continuation with lower priority than itself
* `addListener(l)` does increase or create the `l.priority` property
* `addListener(l)` does not invoke l.setPriority()
* `l.setPriority(p)` MUST set the `l.priority` property to `p`
* a Stream function fn(fire, priority) SHOULD return a handler function that can receive "go" and "stop" messages
* when such a handler receives a "go" message, it MUST call the priority() setter but does not need to propagate the returned continuation
* when such a handler receives a "go" message in a ValueStream, it MUST call fire() with the current value but does not need to propagate the returned continuation
* fire() MUST return `undefined` when invoked before or during "go" message or after a "stop" message
* priority() MUST return `undefined` when invoked before or during "go" message or after a "stop" message

Interfaces and Constructors
---------------------------

Stream {
	* propagates events. Might be/have a context that changes.
}
EventStream extends Stream {
	* fires discrete events. Those should have a `type` property or be Error instances otherwise.
	  Errors and other non-events do have a type == undefined.
}
Behavior / ValueStream extends Stream {
	* represents a changing value. Can have initial value (defaults to undefined). Does not propagate unchanged values.  
	`valueOf()`: method to get value during an evaluation phase (not necessarily a dispatch)
}

Collections: streams with add/remove(/update) events in context of a set or list or map
 a collection can have an ordering, like fifo, lifo (stack), sortedBy, or custom.

Continuation [extends Function]? {
	call(null): do what is to be done. Return a Continuation or undefined. If it returns itself, it wants to be deferred.
	priority: lower is more urgent. MUST NOT change (from return until call).
}
EventListener extends Continuation {
	`handleEvent(v) extends call(s: Stream, v)`: receive value in context 
	`setPriority(p)`: a new priority level, set by the EventTarget on which the listener is installed
	                returns Continuation or undefined.
	                `p` SHOULD NOT be lower than the current `priority` 
	`priority`: `0`. MUST NOT be changed [during a dispatch] other than by a call to `setPriority` 
}


Examples
---------

Drag'n'Drop: ValueStream of Promises (for drop actions) that fire Progress-EventStreams for the drag-animation
Resettable Timer: ValueStream of Clock-Behaviors or Interval-EventStreams -> flatten to Stream of "reset" and "tick" events

Invarianten auf dem Graphen
---------------------------

* Kreisfreiheit. Kreise können mit einem Prioritätssprung verwirklicht werden, derjenige Knoten hat die Verantwortung für die Semantik
* priority/subordinacy are used to describe a partial ordering, so that the nodes can be topologically sorted
* A listener MUST NOT be executed when there is a waiting listener with smaller priority value
* The priority of a (yielded) continuation MUST not be changed
* A continuation MUST NOT yield a continuation with lower priority than itself


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
	call(null): do what is to be done. Return a Continuation or undefined
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
CircularEvaluation: Fix-point behaviours! Where does the circle start when two of its inputs are changed at the same time? 
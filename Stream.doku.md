Invarianten auf dem Graphen
---------------------------

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


Interfaces and Constructors
---------------------------

Stream: propagates events. Might be/have a context that changes.
EventStream: fires discrete events. Those should have a `type` or be Error instances otherwise.
Behavior / ValueStream: represents a changing value. Can have initial value (defaults to undefined). Does not propagate unchanged values.
                        Updates only for the last value in a sequence? No - compromises state. "SkipUpdate" might be an option for some behaviours.
                                                                     of parallel events?  Yes. There is no state in between.  
						has .valueOf method to evaluate value during a propagation phase
						Promise-like error handling?

Collections: streams with add/remove(/update) events in context of a set or list or map
 a collection can have an ordering, like fifo, lifo (stack), sortedBy, or custom.

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


Examples
---------

Drag'n'Drop: ValueStream of Promises (for drop actions) that fire Progress-EventStreams for the drag-animation
Resettable Timer: ValueStream of Clock-Behaviors or Interval-EventStreams -> flatten to Stream of "reset" and "tick" events
CircularEvaluation: Fix-point behaviours! Where does the circle start when two of its inputs are changed at the same time? 
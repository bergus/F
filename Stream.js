// Functional Reactive Programming

function Stream(fn) {
	var that = this,
	    listeners = [],
	    priority = 0,
	    stop = null,
	    go = fn(fire, setPriority);
	function add(ls) {
		if (listeners.length == 0)
			stop = go();
		
		listeners.push(ls);
		
		if (!(ls.priority >= priority))
			ls.priority = priority;
		return this;
	}
	function remove(ls) {
		var i = listeners.indexOf(ls);
		if (i >= 0) {
			listeners.splice(i, 1);
			if (listeners.length == 0)
				go = stop();
		}
		return this;
	}
	function fire(event) {
		// invokes all given listeners with event and context
		// returns: Continuation or undefined
		
		return new ContinuationBuilder().each(listeners, function(l) {
			return l.call(that.context, event);
		}).getContinuation();
	}
	function setPriority(p) {
		// updates the priority of the listeners
		// returns ContinuationBuilder
		if (p < priority)
			throw "Stream|setPriority: Reducing priority is not designed (yet)";
		if (p == priority)
			return new ContinuationBuilder();
		priority = p;
		return new ContinuationBuilder().each(listeners, function(l) {
			if (l.priority < priority)
				return l.setPriority(priority);
		});
	}
	
	this.addListener = add;
	this.removeListener = remove;
	// @TODO: Allow synonyms?
	// this.onItem = add;
	// this.off = remove;
}

function ContinuationBuilder() {
	var waiting = [];
	
	function next() {
		// invariant: waiting.length > 0
		if (waiting.length <= 1)
			return waiting.shift();
		suspended.priority = waiting[0].priority;
		
		return suspended;
	}
	function suspended() {
		// invariant: suspended.priority == waiting[0].priority
		// the priority value of a continuation in waiting never changes
		var active = waiting[0];
		do {
			var postponed = active.call(); // might trigger continueDispatch()
			if (active == waiting[0]) // "still" in the first place (where expected) after call() returned
				waiting.shift();
			if (typeof postponed == "function")
				waiting.insertSorted(postponed, "priority");
		} while ((active = waiting[0]) && active.priority == suspended.priority);
		return next();
	}
	this.each = function(arr, cb) {
		for (var i=0, l = arr.length; i<l; i++) {
			var cont = cb(arr[i], i);
			if (typeof cont == "function")
				waiting.insertSorted(cont, "priority");
		}
		return this;
	};
	this.add = function(cont) {
		if (typeof cont == "function")
			waiting.insertSorted(cont, "priority");
		return this;
	};
	this.getContinuation = next;
}

/* @implements EventTarget */
function EventStream(fn, context) {
	Stream.apply(this, arguments);
	this.context = context || this;
}
EventStream.prototype = Object.create(Stream.prototype, {constructor: {value: EventStream}});

EventStream.prototype.addEventListener = function addEventListener(type, handler) {
	if (handler !== Object(handler))
		return;
	var that = this;
	function listener(e) {
		if (e.type !== type)
			return;
		if (typeof handler == "function")
			return handler.call(that.context, e);
		else
			return handler.handleEvent(e);
	}
	listener.setPriority = handler.setPriority.bind(handler);
	this.addListener(listener);
	handler.priority = listener.priority;
	handler._removeFromEventTarget = (function(remove) {
		return function self(ta, ty) {
			// @FIXME: avoid memory leaks of references to Streams from which the listener has been removed already
			//         or where _removeFromEventTarget could not be resetted  
			if (ty == type && ta == that) {
				that.removeListener(listener);
				if (this._removeFromEventTarget == self)
					this._removeFromEventTarget = remove;
			} else if (typeof remove == "function")
				remove.call(this, ta, ty);
		}
	})(handler._removeFromEventTarget);
	return function remove() {
		that.removeListener(listener);
	};
};
EventStream.prototype.removeEventListener = function removeEventListener(type, handler) {
	if (typeof handler._removeFromEventTarget == "function")
		handler._removeFromEventTarget(this, type);
};
EventStream.prototype.dispatchEvent = function() {
	throw new Error("InvalidStateError: EventStream.dispatchEvent must not be invoked from outside");
};

function ValueStream(fn) {
	// @TODO: code duplication (remove, setPriority)
	var that = this,
	    value = [],
	    listeners = [],
	    priority = 0,
	    stop = null,
	    go = fn(fire, setPriority);
		// fire SHOULD be invoked at any time to notify the stream of a new current value
		// it is EXPECTED that this happens during go() to initialise the value, and CAN even happen during fn()
		// it MUST NOT happen during a dispatch phase after the dispatch priority value is higher than the propagated one
		// don't forget to `return` the continuation which `fire()` yields
	function add(ls) {
		if (listeners.length == 0)
			stop = go();
		
		ls.apply(that.context, value);
		listeners.push(ls);
		if (!(ls.priority >= priority))
			ls.priority = priority;
		return this;
	}
	function remove(ls) {
		var i = listeners.indexOf(ls);
		if (i >= 0) {
			listeners.splice(i, 1);
			if (listeners.length == 0)
				go = stop();
		}
		return this;
	}
	function fire() {
		// invokes all given listeners with arguments and context
		// returns: Continuation or undefined
		value = arguments; // @TODO: Should fire() take arguments or a single args array?
		return new ContinuationBuilder().each(listeners, function(l) {
			return l.apply(that.context, value); // @TODO: handle errors
		}).getContinuation();
	}
	
	function setPriority(p) {
		// updates the priority of the listeners
		// returns ContinuationBuilder
		if (p < priority)
			throw "Stream|setPriority: Reducing priority is not designed (yet)";
		if (p == priority)
			return new ContinuationBuilder();
		priority = p;
		return new ContinuationBuilder().each(listeners, function(l) {
			if (l.priority < priority)
				return l.setPriority(priority);
		});
	}
	
	this.addListener = add;
	this.removeListener = remove;
	
	this.valueOf = function() {
		if (!dispatcher.evaluating) {
			console.warn("ValueStream.valueOf can only be invoked during an evaluation phase");
			return this;
		}
		var cont = dispatcher.evaluating.add(this); // triggers computation by adding a listener
		dispatcher.continueUntil(cont, function() {
			return priority;
		}); // dispatch (fire, trigger the listener) and propagate priorities until own priority is matched  
		return value[0]; // @TODO: How to handle multiple values?
	}
}
ValueStream.prototype = Object.create(Stream.prototype, {constructor: {value: ValueStream}});

ValueStream.of = function(fn) {
	return new ValueStream(function(fire, propagatePriority) {
		var watching = false,
		    deps = [],
		    prio = 0;
		// @TODO: What do we really need to wait for (in terms of listener.priority)?
		//        * re-evaluating on the first listener works because it will continueDispatch until it's time, but that might be unnecessary
		//        * re-evaluating after the last listeners' level may be unnecessary late when that is no more a dependency 
		function execute() {
			if (!watching)
				return; // second run during continueDispatch
			if (execute.priority <= prio) {
				execute.priority = prio+1;
				return execute;
			}
			var cont = fire(dispatcher.evaluate(fn, deps, listener));
			watching = false;
			return cont;
		}
		execute.priority = prio+1;
		
		function listener() { // does not take a value...
			// fires when any of the dependencies does update or initialize
			if (!watching) {
				watching = true;
				return execute; // ...but yields the update continuation
			}
		};
		listener.setPriority = function(p) {
			if (p <= prio)
				return;
			prio = this.priority = p; // increases the priority on all dependencies. Doesn't matter, does it?
			return propagatePriority(prio+1).getContinuation();
		};
		
		function go() {
			watching = true; // no need to yield `execute` from the listeners
			fire(dispatcher.evaluate(fn, deps, listener)); // assuming we're not currently dispatching. @TODO?
			watching = false;
			prio = listener.priority;
			execute.priority = prio+1;
			propagatePriority(prio+1);
			return stop;
		}
		
		function stop() {
			while (deps.length)
				deps.pop().removeListener(listener);
			return go;
		}
		return go;
	})
}
var dispatcher = (function() {
	var next;
	
	function evaluate(fn, deps, listener) {
		var old = this.evaluating, // stacking :-)
		    i = 0,
		    rem = [];
		this.evaluating = deps;
		deps.add = function(d) {
			var j = this.indexOf(d);
			if (j > i)
				rem.push.apply(rem, this.splice(i, j));
			else if (j < 0) {
				// d might be in rem, but that doesn't matter
				this.splice(i, 0, d);
				d.addListener(listener);
			}
			i++;
			return listener.setPriority(listener.priority);
		}
		var res = fn();
		
		while (deps.length > i)
			deps.pop().removeListener(listener);
		for (var l=rem.length; l--; )
			rem[l].removeListener(listener);
		
		this.evaluating = old; // restore
		return res;
	}
	function startDispatching(n) {
		if (typeof next == "function")
			throw new Error("dispatcher.start: must not be invoked during dispatch phase");
		next = n;
		while (typeof next == "function") // boing boing boing
			next = next();                // trampolining is fun!
	}
	function continueDispatching(n, getPriority) {
		next = new ContinuationBuilder().add(next).add(n).getContinuation();
		while (typeof next == "function" && next.priority < getPriority())
			next = next();
	}
	return {
		isDispatching: function() { return typeof next == "function"; },
		evaluating: null,
		evaluate: evaluate,
		continueUntil: continueDispatching,
		start: startDispatching
	};
}());
Stream.dispatch = dispatcher.start;

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
		    prio = 0, // priority of the listeners
		    steps = [], // @TODO: simple counter instead of set of active steps?
		    values = new Array(l); // @FIXME array of arrays of arguments
		function setPriority(p) {
			if (p <= prio || p <= this.priority)
				return;
			prio = this.priority = p;
			return propagatePriority(prio+1).each(steps, function(_, i) {
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
					// console.assert(typeof propagatePriority(prio+1).getContinuation() == "function", "Stream|compose: propagating priority during go() requires continuation dispatch");
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

function sample(eventStream, fn) {
	// builds a ValueStream for the result of execung `fn()`, updates (executes `fn`) every time `eventStream` fires 
	return new ValueStream(function(fire, propagatePriority) {
		function listener() {
			return fire(fn())
		}
		listener.setPriority = function(p) {
			return propagatePriority(p+1).getContinuation(); // @TODO: really needed?
		};
		
		function go() {
			eventStream.addListener(listener);
			listener();
			return stop;
		}
		
		function stop() {
			eventStream.removeListener(listener);
			return go;
		}
		return go;
	});
}

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
		this.splice(1 + this.binaryIndexFor(function(a) {
			var ca = by(a);
			return +(ca>cel) || -(ca<cel);
		}), 0, el);
};

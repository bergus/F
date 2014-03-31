// Functional Reactive Programming

function Stream(fn) {
	var that = this,
	    listeners = [],
	    priority = 0,
	    send = fn(fire, setPriority);
	function add(ls) {
		if (listeners.length == 0)
			send("go");
		
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
				send("stop");
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
Stream.prototype.addEventListener = function addEventListener(type, handler) {
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
	handler._removeFromEventTarget = (function(prev) {
		return function removeFrom(ta, ty) {
			if (that != null && ta == that && ty == type) {
				that.removeListener(listener);
				handler = listener = that = null;
			} else if (typeof prev == "function")
				prev.call(this, ta, ty);
			if (that == null && this._removeFromEventTarget == removeFrom)
				this._removeFromEventTarget = prev;
		}
	})(handler._removeFromEventTarget);
	return function remove() {
		// @TODO: "simply" call removeFrom(that, type)?
		if (that != null)
			that.removeListener(listener);
		handler = listener = that = null;
	};
};
Stream.prototype.removeEventListener = function removeEventListener(type, handler) {
	if (handler && typeof handler._removeFromEventTarget == "function")
		handler._removeFromEventTarget(this, type);
};
Stream.prototype.dispatchEvent = function() {
	throw new Error("InvalidStateError: Stream::dispatchEvent must not be invoked from outside");
};


Stream.prototype.poll = function poll(fn) {
	// builds a ValueStream for the result of executing `fn()`, updates (executes `fn`) every time `eventStream` fires
	var eventStream = this;
	return new ValueStream(function(fire, propagatePriority) {
		function listener() {
			return fire([fn()]);
		}
		listener.setPriority = function(p) {
			this.priority = p;
			return propagatePriority(p).getContinuation();
		};
		
		return Function.delegateName({
			go: function go() {
				eventStream.addListener(listener);
				listener();
				propagatePriority(listener.priority);
			},
			stop: function stop() {
				eventStream.removeListener(listener);
			}
		})
	});
};

Stream.prototype.scan = function scan(fn, value) {
	// builds a ValueStream by scanning over the `eventStream` values, fn is called with the previous result and the new value every time it fires
	var eventStream = this;
	return new ValueStream(function(fire, propagatePriority) {
		var active = false;
		function listener() {
			Array.prototype.unshift.call(arguments, value);
			value = fn.apply(this, arguments);
			if (active)
				return fire([value]);
		}
		listener.setPriority = function(p) {
			this.priority = p;
			return propagatePriority(p).getContinuation();
		};
		
		// add it immediately to start collecting events
		eventStream.addListener(listener);
		
		return Function.delegateName({
			go: function go() {
				fire([value]);
				active = true;
				propagatePriority(listener.priority);
			},
			stop: function stop() {
				active = false; // does not stop collecting values!
			},
			destroy: function destroy() {
				eventStream.removeListener(listener);
			}
		})
	});
};


function EventStream(fn, context) {
	var that = this,
	    listeners = [],
	    typedlisteners = {},
	    errorlisteners = [],
	    listenercount = 0,
	    priority = 0,
	    send = fn(fire, setPriority);
	// @TODO: Code duplication in add/on/onError, remove/off/offError
	function add(ls) {
		if (listenercount == 0)
			send("go");
		
		listeners.push(ls); // @FIXME: During dispatch, defer after firing
		listenercount++;
		ls.priority = priority;
		return this;
	}
	
	function remove(ls) {
		var i = listeners.indexOf(ls);
		if (i >= 0) {
			listeners.splice(i, 1);
			listenercount--;
			if (listenercount == 0)
				send("stop");
		}
		return this;
	}
	
	function on(t, ls) {
		if (!(t in typedlisteners))
			typedlisteners[t] = [];
		if (listenercount == 0)
			send("go");
		
		typedlisteners[t].push(ls);
		listenercount++;
		ls.priority = priority;
		return this;
	}
	
	function off(t, ls) {
		if (!(t in typedlisteners))
			return this;
		var i = typedlisteners[t].indexOf(ls);
		if (i >= 0) {
			typedlisteners[t].splice(i, 1);
			listenercount--;
			if (listenercount == 0)
				send("stop");
		}
		return this;
	}
	
	function onError(ls) {
		if (listenercount == 0)
			send("go");
		
		errorlisteners.push(ls);
		errorlistenercount++;
		ls.priority = priority;
		return this;
	}
	
	function offError(ls) {
		var i = errorlisteners.indexOf(ls);
		if (i >= 0) {
			errorlisteners.splice(i, 1);
			listenercount--;
			if (listenercount == 0)
				send("stop");
		}
		return this;
	}
	
	function fire(event) {
		// invokes all given listeners with event and context
		// returns: Continuation or undefined
		function invoke(l) {
			return l.call(that.context, event);
		}
		
		var cb = new ContinuationBuilder().each(listeners, invoke);
		if (!("type" in event))
			cb.each(errorlisteners, invoke)
		else if (event.type in typedlisteners)
			cb.each(typedlisteners[event.type], invoke);
		return cb.getContinuation();
	}
	
	function setPriority(p) {
		// updates the priority of the listeners
		if (p < priority)
			throw "EventStream|setPriority: Reducing priority is not designed (yet)";
		if (p == priority)
			return;
		priority = p;
		return new ContinuationBuilder().each(listeners, function(l) {
			if (l.priority < priority)
				return l.setPriority(priority);
		});
	}
	
	
	this.context = context || this;
	
	this.addListener = add;
	this.removeListener = remove;
	this.addEventListener = on;
	this.removeEventListener = off;
	this.addErrorListener = onError;
	this.removeErrorListener = offError;
}

EventStream.prototype = Object.create(Stream.prototype, {constructor: {value: EventStream}});

EventStream.prototype.on = function(t, ls) {
	if (Array.isArray(t))
		for (var i=0; i<t.length; i++)
			this.addEventListener(t[i], ls);
	else
		this.addEventListener(t, ls);
	return this;
};
EventStream.prototype.off = function(t, ls) {
	if (Array.isArray(t))
		for (var i=0; i<t.length; i++)
			this.removeEventListener(t[i], ls);
	else
		this.removeEventListener(t, ls);
	return this;
};


function ValueStream(fn, equal) {
	// @TODO: code duplication (remove, setPriority)
	var that = this,
	    value = [],
	    listeners = [],
	    priority = 0,
	    send = fn(fire, setPriority);
		// fire SHOULD be invoked at any time to notify the stream of a new current value
		// it is EXPECTED that this happens during go() to initialise the value, and CAN even happen during fn()
		// it MUST NOT happen during a dispatch phase after the dispatch priority value is higher than the propagated one
		// don't forget to propagate the continuation which `fire()` yields
	if (typeof equal == "function" && (equal = [equal]) || Array.isArray(equal))
		equal = Array.zipAp(equal); // @TODO: Should it be Array.prototype.zipAp.bind(eqaul)?
	else if (typeof equal != "function")
		equal = Array.equals;
	
	function add(ls) {
		if (listeners.length == 0)
			send("go");
		
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
				send("stop");
		}
		return this;
	}
	function fire(data) {
		// invokes all given listeners with arguments and context
		// returns: Continuation or undefined
		if (equal(value, data)) // no need to propagate unchanged values
			return; // @TODO: Should the new values be stored nonetheless to garbage the old ones? What if equal is non-transitive?
		value = data; // @TODO: Should fire() take arguments or a single args array?
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
		return value[0]; // @TODO: How to handle multiple values? @FIXME: How to handler errors?
	}
}
ValueStream.prototype = Object.create(Stream.prototype, {constructor: {value: ValueStream}});

ValueStream.of = function() {
	var args = arguments;
	return new ValueStream(function(fire) {
		fire(args);
		return Function.noop;
	});
};

ValueStream["for"] = function(expression) {
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
			var cont = fire(dispatcher.evaluate(expression, deps, listener));
			watching = false; // @FIXME: Put before fire()?
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
		
		return Function.delegateName({
			go: function go() {
				watching = true; // no need to yield `execute` from the listeners
				fire(dispatcher.evaluate(expression, deps, listener)); // assuming we're not currently dispatching. @TODO?
				watching = false;
				prio = listener.priority;
				execute.priority = prio+1;
				propagatePriority(prio+1);
			},
			stop: function stop() {
				while (deps.length)
					deps.pop().removeListener(listener);
			}
		});
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
		var res = [fn()];
		
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

ValueStream.prototype.map = function map(fn) {
	var stream = this;
	return new ValueStream(function(fire, propagatePriority) {
		function listener() {
			return fire([fn.apply(this, arguments)]);
		}
		listener.priority = 0;
		listener.setPriority = function(p) {
			this.priority = p;
			return propagatePriority(p).getContinuation();
		};
		
		return Function.delegateName({
			go: function go() {
				stream.addListener(listener);
				propagatePriority(listener.priority);
			},
			stop: function stop() {
				stream.removeListener(listener);
			}
		});
	});
};
ValueStream.prototype.switchValue = function switchValue(fn) {
	var stream = this;
	return new ValueStream(function(fire, propagatePriority) {
		var cur = null,
			val = null;
		function propagateVal() {
			return fire(val);
		}
		propagateVal.piority = 1;
		function streamListener() {
			if (cur)
				cur.removeListener(listener);
			listener.priority = 0;
			cur = fn.apply(this, arguments);
			cur.addListener(listener);
			propagateVal.priority = Math.max(listener.priority, streamListener.priority + 1);
			return propagatePriority(propagateVal.priority + 1).add(fire(val)).getContinuation();
		}
		streamListener.priority = 0;
		function listener() {
			val = arguments;
			return propagateVal;
		}
		streamListener.setPriority = listener.setPriority = function(p) {
			if (this.priority >= p) return;
			this.priority = p;
			propagateVal.priority = Math.max(listener.priority, streamListener.priority + 1);
			return propagatePriority(propagateVal.priority + 1).getContinuation();
		}
		
		return Function.delegateName({
			go: function go() {
				stream.addListener(streamListener);
			},
			stop: function stop() {
				cur.removeListener(listener);
				cur = val = null;
				stream.removeListener(streamListener);
			}
		});
	});
};
ValueStream.combine = function() {
	var streams = Array.prototype.concat.apply([], arguments),
	    l = streams.length;
	return new ValueStream(function(fire, propagatePriority) {
		var listeners = new Array(l),
		    prio = 0, // max priority of the listeners
		    values = new Array(l),
		    watching = false;
		function setPriority(p) {
			if (p <= prio || p <= this.priority)
				return;
			prio = this.priority = p;
			propagateValue.priority = prio+1;
			return propagatePriority(prio+1).getContinuation();
		}
		
		function propagateValue() {
			if (propagateValue.priority <= prio) {
				propagateValue.priority = prio+1;
				return propagateValue;
			}
			watching = false;
			return fire(values.slice());
		}
		function makeListener(i) {
			function listener(v) {
				values[i] = v;
				if (!watching) {
					watching = true;
					return propagateValue; // ...but yields the update continuation
				}
			}
			listener.setPriority = setPriority;
			return listener;
		}
		for (var i=0; i<l; i++)
			listeners[i] = makeListener(i);
		
		return Function.delegateName({
			go: function go() {
				watching = true; // don't return the continuation on initialisation
				for (var i=0; i<l; i++) {
					streams[i].addListener(listeners[i]);
					if (listeners[i].priority > prio)
						prio = listeners[i].priority;
				}
				propagateValue.priority = prio+1;
				propagatePriority(prio+1);
				// console.assert(typeof propagatePriority(prio+1).getContinuation() == "function", "ValueStream.combine: propagating priority during go() requires continuation dispatch");
				watching = false;
				fire(values.slice());
			},
			stop: function stop() {
				for (var i=0; i<l; i++)
					streams[i].removeListener(listeners[i]);
			}
		});
	});
};

function PrimitiveError(p) {
	var e = new Error(p);
	e.name = "";
	e.valueOf = function() { return p; }
	return e;
}

function map(fn, stream) {
	return new stream.constructor(function(fire, propagatePriority) {
		function listener(v) {
			return fire(fn(v));
		}
		listener.priority = 0;
		listener.setPriority = function(p) {
			this.priority = p;
			return propagatePriority(p).getContinuation();
		};
		
		return Function.delegateName({
			go: function go() {
				stream.addListener(listener);
				propagatePriority(listener.priority);
			},
			stop: function stop() {
				stream.removeListener(listener);
			}
		});
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
		
		return Function.delegateName({
			go: function go() {
				for (var i=0; i<l; i++) {
					streams[i].addListener(listeners[i]);
					if (listeners[i].priority > prio) {
						prio = listeners[i].priority;
						propagatePriority(prio+1);
						// console.assert(typeof propagatePriority(prio+1).getContinuation() == "function", "Stream|compose: propagating priority during go() requires continuation dispatch");
					}
				}
			},
			stop: function stop() {
				for (var i=0; i<l; i++)
					streams[i].removeListener(listeners[i]);
			}
		});
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
Function.delegateName = function (methods) {
	return function(name) {
		if (methods.hasOwnProperty(name))
			return methods[name].apply(this, Array.prototype.slice.call(arguments, 1));
		else
			return methods._forward.apply(this, arguments);
	};
};

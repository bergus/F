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
		if (p < priority)
			throw "Stream|setPriority: Reducing priority is not designed (yet)";
		if (p == priority)
			return;
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
		if (waiting.length <= 1)
			return waiting.shift();
		suspended.priority = waiting[0].priority;
		return suspended;
	}
	function suspended() {
	    do {
    		var postponed = waiting.shift().call();
    		if (typeof postponed == "function")
    			waiting.insertSorted(postponed, "priority");
    	} while (waiting[0].priority == suspended.priority)
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
	this.add = function(cont) {
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

function EventStream(fn, context) {
    var that = this,
        listeners = [],
        typedlisteners = {},
        errorlisteners = [],
        listenercount = 0,
        priority = 0,
        stop = null,
        go = fn(fire, setPriority);
    // @TODO: Code duplication in add/on/onError, remove/off/offError
    function add(ls) {
        if (listenercount == 0)
            stop = go();
            
        listeners.push(ls);
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
                go = stop();
        }
        return this;
    }
    function on(t, ls) {
        if (!(t in typedlisteners))
            typedlisteners[t] = [];
         if (listenercount == 0)
            stop = go();
            
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
                go = stop();
        }
        return this;
    }
    function onError(ls) {
        if (listenercount == 0)
            stop = go();
            
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
                go = stop();
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
            throw "Stream|setPriority: Reducing priority is not designed (yet)";
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
EventStream.prototype = Object.create(Stream.prototype, {constructor:{value:EventStream}});
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
    function add(ls) {
        if (listeners.length == 0)
            stop = go();
        
        ls.apply(that.context, value);
        listeners.push(ls);
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
        // invokes all given listeners with value and context
        // returns: Continuation or undefined
        value = arguments;
        return new ContinuationBuilder().each(listeners, function(l) {
            return l.apply(that.context, value);
        }).getContinuation();
    }
    function setPriority(p) {
        // updates the priority of the listeners
        if (p < priority)
            throw "Stream|setPriority: Reducing priority is not designed (yet)";
        if (p == priority)
            return;
        priority = p;
        return new ContinuationBuilder().each(listeners, function(l) {
            if (l.priority < priority)
                return l.setPriority(priority);
        });
    }

    this.addListener = add;
    this.removeListener = remove;
}
ValueStream.prototype = Object.create(Stream.prototype, {constructor:{value:ValueStream}});

function dispatch(fire, event) {
    var next = fire(event);
    while (typeof next == "function") // boing boing boing
        next = next();                // trampolining is fun!
};
Stream.dispatch = dispatch;

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

function sample(eventStream, fn) {
    return new ValueStream(function(fire, setPriority) {
        function listener() {
            fire(fn())
        }
        listener.setPriority = function(p) {
            setPriority(p+1); // @TODO: really needed?
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
        this.splice(1+this.binaryIndexFor(function(a) {
            var ca = by(a);
            return +(ca>cle) || -(ca<cel);
        }), 0, el);
};
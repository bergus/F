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
	// @FIXME: Allow synonyms?
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
    		var postponed = waiting[0].call();
    		if (postponed != dispatcher.active) waiting.shift();
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
function EventStream(fn, context) {
    Stream.apply(this, arguments);
    this.context = context || this;
}
EventStream.prototype = Object.create(Stream.prototype, {constructor:{value:EventStream}});

EventStream.addEventListener = function addEventListener(type, handler) {
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
        return function(ta, ty) {
            if (ty == type && ta == that) {
                that.removeListener(listener);
                this._removeFromEventTarget = remove;
            } else if (typeof remove == "function")
                remove.call(this, ta, ty);
        }
    })(handler._removeFromEventTarget);
    return function remove() {
        that.removeListener(listener);
    };
};
EventStream.removeEventListener = function removeEventListener(type, handler) {
    if (typeof handler._removeFromEventTarget == "function")
        handler._removeFromEventTarget(this, type);
};
EventStream.dispatchEvent = function() {
    throw new Error("InvalidStateError: EventStream.dispatchEvent must not be invoked from outside");
};


function ValueStream(fn) {
    // @TODO: code duplication 
    var that = this,
        listeners = [],
        value = null,
        priority = 0,
        stop = null,
        go = fn(fire, setPriority);
    function add(ls) {
        if (listeners.length == 0)
            stop = go();
            
        listeners.push(ls);
        if (!(ls.priority >= priority))
            ls.priority = priority;
        // @TODO: pass current value (that might not yet have arrived)
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
    function fire(val) {
        // invokes all given listeners with arguments and context
        // returns: Continuation or undefined
        value = val;
        return new ContinuationBuilder().each(listeners, function(l) {
            return l.apply(that.context, value);
        }).getContinuation();
    }
    function setPriority(p) {
        // updates the priority of the listeners
        if (p < priority)
            throw "ValueStream|setPriority: Reducing priority is not designed (yet)";
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

    this.valueOf = function() {
        if (!dispatcher.evaluating) {
            console.warn("ValueStream.valueOf can only be invoked during a dispatch phase");
            return this;
        }
        dispatcher.evaluating.add(this);
        if (dispatcher.isDispatching)
            while (dispatcher.priority < priority)
                dispatcher.continueDispatching();
        return value;
    }
}
ValueStream.of = function(fn) {
    return new ValueStream(function(fire, propagatePriority) {
        debugger;
        
        var watching = false;
        function execute() {
            if (!watching)
                return dispatcher.active; // second run during continueDispatch 
            watching = false;
            while (deps.length)
                deps.pop().removeListener(listener);
            deps = dispatcher.evaluate(fn, listener);
        }
        execute.priority = prio+1;
        function listener() { // does not take a value
            if (!watching) { watching = true; return execute; } // but yields the update continuation
        };
        listener.setPriority = function(p) {
            prio = this.priority = p; // @FIXME: increases the priority on all dependencies. Doesn't matter, does it?
            execute.priority = prio+1; // @FIXME: do we need a new execute function? I guess so.
            return propagatePriority(prio+1); // @FIXME: could this be unnecessary?
        };
        
        var deps = dispatcher.evaluate(fn, listener); // assuming we're not currently dispatching. @TODO?
        var prio = listener.priority;
        propagatePriority(prio+1);
        
        function go(){
            execute();
            return stop;
        }
        function stop(){
            return go;
        }
        return go;
    })
}
var dispatcher = {
    stack: [],
    priority: 0,
    next: null,
    active: {}, // a token
    isDispatching: false,
    evaluate: function(fn, listener) {
        var old = this.evaluating, // stacking :-)
            deps = this.evaluating = [];
        deps.add = function(d) {
            this.push(d);
            d.addListener(listener);
            listener.setPriority(listener.priority); // @FIXME: How to propagate this?
        }
        fn();
        this.evaluating = old; // restore
        return deps;
    },
    continueDispatching: function(){
        if (typeof dispatcher.next == "function") { // boing boing boing
            dispatcher.next = dispatcher.next();    // trampolining is fun!
            dispatcher.priority = dispatcher.next.priority;
        }
    },
    start: function dispatch(next) {
        debugger;
        dispatcher.isDispatching = true;
        dispatcher.next = next;
        while (typeof next == "function") { // boing boing boing
            dispatcher.priority = next.priority;
            next = next();                  // trampolining is fun!
            dispatcher.next = next;
        }
        dispatcher.isDispatching = false;
    }
};
Stream.dispatch = dispatcher.start;

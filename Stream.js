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

function dispatch(fire, event) {
	var next = fire(event);
	while (typeof next == "function") // boing boing boing
		next = next();                // trampolining is fun!
};
Stream.dispatch = dispatch;

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
    throw new Error("InvalidStateError: EventStreams::dispatchEvent must not be invoked from outside");
};

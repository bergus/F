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

	this.addEventListener = add;
	this.removeEventListener = remove;
	
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

function Clock(from, interval) {
	if (arguments.length == 1) {
		interval = from;
		from = new Date;
	}
	var time = from.getTime();
	this.getTime = function() { return time; };
	Stream.call(this, function(fire) {
		var timeout, nexttime;
		function check() {
			var t = Date.now();
			if (t >= nexttime-2) { // @FIXME: Just believe the timeout?
				Stream.dispatch(fire, t);
				nexttime += interval;
			}
			timeout = setTimeout(check, nexttime-t);
		}
		function go() {
			var t = Date.now();
			nexttime = t - (t-time) % interval + interval;
			timeout = setTimeout(check, nexttime-t);
			return stop;
		}
		function stop() {
			clearTimeout(timeout);
			return go;
		}
		return go;	
	});
}

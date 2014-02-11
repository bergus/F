// Functional Reactive Programming 

function Stream(fn) {
	var listeners = [],
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

		return new ContinuationManager().each(listeners, function(l) {
			return l.call(context, event);
		}).getContinuation();
	}
	function setPriority(p) {
		// updates the priority of the listeners
		if (p < priority)
			throw "ListenerManager::setPriority: Reducing priority is not designed (yet)";
		if (p == priority)
			return;
		priority = p;
		return new ContinuationBuilder().each(listeners, function(l) {
			if (l.priority < priority) {
				return l.setPriority(priority);
		});
	}

	this.addEventListener = add;
	this.removeEventListener = remove;
	
}

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
			if (t >= nexttime) {
				dispatch(fire(t));
				nexttime += interval;
			}
			timeout = setTimeout(check, t-nexttime);
		}
		function go() {
			var t = Date.now();
			nexttime = t - (t-time % interval) + interval;
			timeout = setTimeout(check, t-nexttime);
			return stop;
		}
		function stop() {
			clearTimeout(timeout);
			return go;
		}
		return go;	
	});
}

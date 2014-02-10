// Functional Reactive Programming 

function Stream(fn) {
	var listeners = [],
		priority = 0,
		stop = null,
		go = fn(fire, setPriority);
	function add(ls) {
		listeners.push(ls);
		ls.priority = prio+1;
		
		if (listeners.length == 1)
			stop = go();
		return this;
	}
	function remove(ls) {
		var i = listeners.indexOf(ls);
		if (i >= 0) {
			listeners.splice(i, 1);
			if (listeners.length == 0)
				go = stop();
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
		// might be invoked on a listener function, not the manager
		if (p < prio)
			throw "ListenerManager::setPriority: Reducing priority is not designed (yet)";
		if (p <= this.priority)
			return;
		prio = p;
		return new ContinuationManager().each(listeners, function(l) {
			if (l.priority <= prio) {
				return l.setPriority(prio+1);
		}).getContinuation();
	}

	this.addEventListener = add;
	this.removeEventListener = remove;
	
}
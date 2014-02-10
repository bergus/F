// Functional Reactive Programming 

function Stream(fn) {
	var listeners = [],
		priority = 0,
		stop = null,
		go = fn(fire, setPriority);
	function add(ls) {
		// @TODO: go or push first?
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
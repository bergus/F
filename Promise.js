/* OPEN ISSUES
* if a promise is already fulfilled, you can add on*-Handlers which will never be called
** call handlers when adding them to fulfilled promises? What about restartables then?
** public getState function?
* conventions for errors: Must be multiple callback, Must be string message in first place, Must be object details in second, happened where?
* dann-Promises have no chance to receive messages from wenn. Any need for that?
* implement a get(prop) function. ridicoulus approach?
* abort dann in error case / abort sonst in sucess case ???
			// wenn.onError(dann.abort) ???
			// wenn.onSucess(sonst.abort) ???
* .then(function(r, s){ [...]; s(x, y, z)}).then(fn) == .then(function(r, s){ [...]; return fn(x, y, z);})
*/

jBergi.Promise = window.Promise = function Promise(fn, multiple) {
/* get: function callback(Array arguments, Function onsucess, Function onerror[, Function onmessage])[, 0/false: only once | 1/true: restartable | 2: multiple (cloneable)]
return: a Promise to call all added Listeners when fn returns a result after invoking start()
		ein Versprechen, alle angefügten Listener aufzurufen, wenn nach dem Aufruf von start() Ergebnisse von fn zurückkomen */

	if (typeof fn != "function")
		throw new TypeError("(new) Promise must be called with a function argument");
	var that = this,
		wenn = null,
		erg = null,
		stopped = false, // ↔ true, solange ended!==true
		// Wäre es evtl besser, mit stopped anzufangen? So können von Anderen ausgelöste Handler (???) abgefangen werden, zumindest vor dem Starten.
		ended = false, // → "sucess"/"error"/… → true
		stopp = null,
		go = null,
		cache = null,
		on = {
			sucess: [],
			error: [],
			message: [],
			'final': []
		},
		filter = {
			sucess: [],
			error: [],
			message: [],
			abort: []
		};
	if (multiple === true)
		multiple = 1;
	if ([0, 1, 2].indexOf(multiple) > -1)
		multiple = 0;
	
	function end(result, type) {
//console.debug(this);
		if (ended === true)
			return false; // nur einmal ausführen (wie vorgeschrieben)
		ended = type;
//console.log("Promise|end: on"+ended+", stopp="+stopped);
		if (stopped) {
			cache = result;
			return true;
		}
		var filters = filter[type];
		for (var i=0; i<filters.length; i++) {
			if (typeof result == "undefined")
				break; // allows filter funtions to suppress handlers
			result = filters[i](result); // Achtung: result ist ein Array!
		}
		if (typeof result != "undefined") {
console.assert(result instanceof Array, "Promise|end: result ist weder undefined noch Array");
//console.log("Promise|end: result.length == "+result.length+" ("+result.map(function(x){return typeof x})+")");
			var handlers = on[type];
			for (var i=0; i<handlers.length; i++) {
				if (typeof handlers[i] == "function")
					/* handlers[i] = Huh? */ handlers[i].apply(null, result);
				if (handlers[i] instanceof that.constructor) // gibts die überhaupt noch?
					handlers[i].start.apply(null, result);
				// Rest ignorieren (wie vorgeschrieben)
			}
		}
		var of = on["final"];
		for (var i=0; i<of.length; i++)
			if (typeof of[i] == "function")
				of(result, type);
		
		return ended = true;
	}
	function sucessCallback() {
		return end([].slice.call(arguments, 0), "sucess");
	}
	function errorCallback() {
		return end([].slice.call(arguments, 0), "error");
	}
	function messageCallback(res) {
		for (var i=0; i<filter.message.length; i++) {
			if (typeof res == "undefined")
				return false; // allows filter funtions to suppress handlers
			res = filter.message[i](res); // Achtung: res ist ein Array!
		}
console.assert(res instanceof Array, "Promise|messageCallback: result ist weder undefined noch Array");
		var source = this instanceof that.constructor ? this : that;
		for (var i=0; i<on.message.length; i++)
			if (typeof on.message[i] == "function")
				on.message[i].apply(source, res);
		return true;
	}
	
	this.start = function(p) {
		var params = [].slice.call(arguments, 0);
		if (ended === true) {
			if (multiple > 0) {
				ended = false;
				stopp = null;
				go = null;
				// cache ???
			} else
				return false; // restart verhindern
		}
		if (multiple < 2 && stopp) // fn/wenn läuft bereits
			return false;
		if (stopped) {
			stopped = false;
			if (ended)
				return end(cache, ended); // continue
console.assert(typeof go == "function", "Promise.start: gestopptes Promise ohne go-Funktion");
			return go();
		}

		erg = fn(arguments.length > 1 ? params : p, sucessCallback, errorCallback, messageCallback);
		if (erg instanceof that.constructor) { // ermöglicht "REKURSION"
			wenn = erg;
			wenn.onSucess(sucessCallback);
			wenn.onError(errorCallback);
//console.log("Uuuh, eine zum Promise expandierende Funktion: "+wenn);
			stopp = wenn.start(); // .apply(null, params); ?
			if (! stopp)
				console.log("Promise.start: wenn ließ sich nicht starten");
		} else if (typeof erg == "function") { // das start-Ergebnis sei die stopp-Funktion ("Startbestätigung" einer callback nutzenden Funktion)
			stopp = erg;
		} else /* if (typeof erg == "boolean") { // "Startbestätigung" einer callback nutzenden Funktion
			if (!erg) end(["unable to start", null, that, erg], "error"); // Fehler beim Starten: Error ???
		} else */ if (typeof erg == "object" || typeof erg == "string") { // "echte" Rückgabewerte einer callback-losen Funktion
			// nutze im Zweifelsfall syncThen()
			if (erg instanceof Error)
				end([erg.message, erg.result, that, erg], "error");
			else
				end([erg], "sucess");
		} else { // typeof erg: (boolean,) number, undefined
			; // gehen wir davon aus, dass die Funktion die ihr übergebenen Callbacks asynchron aufruft
		}
		if (! stopp)
			stopp = true;
		return this.stop;
	};
	this.stop = function() {
		if (stopped || ended === true)
			return false;
		stopped = true;
//console.log("promise stopped");
		if (typeof stopp == "function")
			return go = stopp();
	};
	this.onSucess = function() {
		Array.prototype.push.apply(on.sucess, arguments);
		return this;
	};
	this.onError = function() {
		Array.prototype.push.apply(on.error, arguments);
		return this;
	};
	this.onMessage = function() {
		Array.prototype.push.apply(on.message, arguments);
		return this;
	};
	this.onFinal = function() {
		Array.prototype.push.apply(on['final'], arguments);
		return this;
	};
	this.filter = function(what, fn) {
		if (["sucess","error","message","abort"].indexOf(what) == -1)
			throw new RangeError("Promise.filter only can filter 'sucess', 'error', 'message' and 'abort', not "+what); // RangeError ? eigentlich für number
		Array.prototype.push.apply(filter[what], Array.prototype.slice.call(arguments, 1));
		return this;
	};
	this.toString = function() {
		return "[Promise\nstart: "+(wenn
			? wenn.toString().split("\n").join("\n\t")
			: fn.name || "<anonymus>"
		)+"\n"+Object.join(on, "\n", function(key, value) {
			return key+"handler: "+value.map( function(h) {
				return (typeof h == "function"
					? h.name || "<anonymus>"
					: h.toString() // ???
				)/* filter for promiseXyz-functions ??? */.split("\n").join("\n\t");
			}).join(", ");
		})+"\n]";
	};
	this.abort = function abortPromise() {
		return end(undefined, "abort");
	};
	if (multiple > 1) {
		this.clone = function clonePromise() {
			return new this.constructor(fn, 2);
		}
	}
};
Object.extend(window.Promise.prototype, {
	then: function(dann, sonst) {
		var wenn = this;
		if (! (dann instanceof this.constructor))
			dann = new Promise(dann); // console.assert(typeof dann == "function")
console.assert(dann instanceof Promise, "Promise.then: dann ist kein Promise");
		wenn.onSucess(dann.start);
		if (sonst) {
			if (! sonst instanceof this.constructor)
				sonst = new Promise(sonst); // console.assert(typeof sonst == "function")
			wenn.onError(sonst.start);
		}
		return new Promise(function(p, s, e, m) {
			dann.onSucess(s);
			dann.onError(e);
			dann.onMessage(m);
			if (sonst) {
				sonst.onSucess(s);
				sonst.onError(e);
				sonst.onMessage(m);
			} else {
				wenn.onError(e);
			}
			wenn.onMessage(m); // unmöglich, die Message an dann weiterzuleiten
			
			if(!wenn.start(p))
				return false;
			return function stop() {
				var start;
				if (start = wenn.stop() || start = dann.stop() || start = sonst.stop())
					return start;
				return false;
			};
		});
	},
	syncThen: function(fn) { // see also Promise.filter (which can't raise errors)
		var wenn = this;
		return new Promise(function(p, s, e, m) {
			wenn.onSucess(function(r) {
				var erg = fn(r); // apply?
				if (erg instanceof Error)
					e(erg.message, erg.result, erg);
				else
					s(erg);
			});
			wenn.onError(e); // forwarding
			wenn.onMessage(m); // forwarding
			
			return wenn.start(p);
		});
	},
	correct: function(sonst) {
/* handler errors, wie bei then() nur ohne dann */
		var wenn = this;
		
		if (! (sonst instanceof this.constructor))
			sonst = new Promise(sonst); // console.assert(typeof sonst == "function")
		wenn.onError(sonst.start);
		
		return new Promise(function(p, s, e, m) {
			wenn.onSucess(s);
			wenn.onMessage(m);
			
			sonst.onSucess(s);
			sonst.onError(e);
			sonst.onMessage(m);
			
			if(!wenn.start(p))
				return false;
			return function stop() {
				return wenn.stop() || sonst.stop() || false; // ist das nicht kürzer?
				var start;
				if (start = wenn.stop() || start = sonst.stop())
					return start;
				return false;
			};
		});
	},
	cache: function(cacheError) {
/* get: boolean whether errors should be cached - otherwise a new try is possible
		Achtung! gibt für unterschiedliche start-Parameter denselben Rückgabewert!
return: a restartable (not multiple) Promise which calls this only once to get */
		var that = this;
		var c, ec;
		return new Promise(function(p, s, e, m) {
			if (typeof c != "undefined")
				s.apply(null, c);
			if (cacheError && typeof ec != "undefined")
				e.apply(null, ec);
			that.onSucess(function(r) {
				s.apply(null, c = arguments);
			});
			if (cacheError === true)
				that.onError(function(r) {
					e.apply(null, ec = arguments);
				});
			else
				that.onError(e); // restart possible
			that.onMessage(m);
			
			return that.start(p);
		}, true);
	},
	branch: function() {
	// neues Promise, das aber von der Ausführungsreihenfolge abgekoppelt ist (wird nur erfüllt, wenn es _selbst_ gestartet wurde)
	}
});

Object.extend(window.Promise, {
	when: function(p, dann, sonst) {
		return p.then(dann, sonst);
	},
	wait: function(time) {
		return new Promise(function(p, s) {
			window.setTimeout(function() {
				s(p);
			}, time);
		});
	},
	merge: function(promises, automerge) {
/* get: Promise, Promise[, Promise][, ...]
return: Promise, dass jedes übergebene erfüllt ist */
		if (!Array.isArray(promises)) {
			promises = Array.prototype.slice.call(arguments, 0);
			automerge = false;
		}
		if (promises.length == 1)
			return automerge
				? promises[0]
				: promises[0].filter("sucess", function(r) {
					return [r]; // man erwartet schließlich ein Array von uns
				});
		var results = [];
		var counter = 0;
		return new Promise(function(p, s, e, m) {
			function newValues(r, i) {
				for (var j=0; j<r.length; j++) {
					if (! results[j])
						results[j] = [];
					results[j][i] = r[j];
				}
				if (++counter < promises.length)
					return;
				if (automerge)
					for (var j=0; j<results.length; j++)
						results[j] = (Array.isArray(results[j][0]) ? [] : Object).merge.apply([], results[j]);
				s.apply(null, results);
			}
			for (var i=0; i<promises.length; i++) {
				promises[i].onSucess(function(r) {
					// m("new Value");
					newValues(arguments, i);
				}).onError(e).onMessage(m).start(p);
			}
		});
	},
	Chain: function() {
		
	},
	get Automat() { return this.Machine; },
	Machine: function() {
/* get:
return: a Promise to be fulfilled when the final state is reached
	implements a full finite-state-machine */
		
	},
	Stream: Object.set( function PromiseStream(fn) {
/* get: function(params, callback, e, m)
		jeder callback(item) löst ein item-Event aus, callback(undefined) bedeutet Ende des Streams (sucess)
return: a Stream Object:
		* promise: a Promise to end the stream (with messages and error state)
		* each(): append listener function(s) for the item-Event
		* start() / stop(): do what they say
Example (sinnfrei, da kein Ende oder Fehler abzusehen):
		interval = new Promise.Stream( function(p, s) {
			var id = window.setInterval(function() {
				s(Date.now());
			}, p[0]);
			return window.clearInterval.bind(window, id);
		});
*/
		var onItem = [];
		var items = [];
		var counter = 0;
		var stopped = false;
		function run() {
//console.debug("Promise.Stream|onEachItem", onItem);
			for (; counter < items.length; counter++) {
				for (var i=0; i<onItem.length; i++)
					if (typeof onItem[i] == "function")
						onItem[i](items[counter]);
			}
		}
		var promise = this.promise = new Promise(function startStreamPromise(p, s, e, m) {
			var stop = fn(p, function(item) {
				if (typeof item != "undefined") {
console.debug("Promise.Stream: new item", item);
					items.push(item);
					if (!stopped)
						run();
				} else {
					s(items);
				}
			}, e, m);
			return function stopStream() {
				stopped = true;
				var start = stop(); // fn?
				return function startStream() {
					stopped = false;
					run(); // ausstehende callbacks
					stop = start();
					return stopStream;
				};
			};
		});
		this.each = function() {
			Array.prototype.push.apply(onItem, arguments);
			return this;
		};
		this.start = function() {
			return promise.start.apply(null, Array.prototype.slice.call(arguments, 0));
		};
		this.stop = function() {
			return promise.stop();
		};
	}, "prototype", { // some cute Array-like function, but here: asynchrounus!
		concat: function(stream) {
			var streams = s.concat(Array.prototype.slice.call(arguments, 0));
			var running = streams.length;
			return new Promise.Stream(function(p, callback, e, m) {
				streams.forEach( function(stream) {
					if (! stream instanceof this.constructor)
						throw new TypeError("Promise.Stream.concat: Es dürfen nur Streams miteinander verkettet werden");
					stream.each( callback );
					stream.promise.onSucess(function() {
						if (--running == 0)
							callback();
					}).onError(e).onMessage(m);
				});
				streams.invoke("start", p); // .apply(streams, "start", p) ???
			});
		},
		filter: function(fn, context) {
			if (typeof fn !== "function")
				throw new TypeError();
			var i = 0, s = this;
			return new Promise.Stream(function(p, callback, e, m) {
				s.each(function(r){
					if (fn.call(context, r, i++))
						callback(r);
				}).promise.onSucess(callback.arg()).onError(e).onMessage(m).start(p);
			});
		},
		get forEach() { return this.each },
		map: function(fn, context) {
			if (typeof fn !== "function")
				throw new TypeError();
			var i = 0, s = this;
			return new Promise.Stream(function(p, callback, e, m) {
				s.each(function(r){
					callback(fn.call(context, r, i));
				}).promise.onSucess(callback.arg()).onError(e).onMessage(m).start(p);
			});
		},
		reduce: function(fn, accum) {
			if (typeof fn !== "function")  
				throw new TypeError(); 
			var i = 0, s = this;
			return new Promise(function(p, s, e, m) {
				s.each(function(r){
					accum = fn.call(null, accum, r, i);
				}).promise.onSucess(function(){
					s(accum);
				}).onError(e).onMessage(m).start(p);
			});
		}
	})
});
// 3 Promise-Funktionen sind wichtig und beschreibbar:
// * chain / Verkettung -> Nacheinander, mit Option was ein Error (jeglicher Art) auslösen soll (returnError | nextPromise | defaultError (spezialError) -> Kontinue after Error ...)
// * merge / Vereinigung -> Parallelität, mit Option ob All-/Existenzquantor für Error-/Sucess-return gilt
// * endlicher Automat: -> Menge der Zustände (mit Start- und Endzustand), Ablaufrelationen, defaultSucess, defaultError

// message-Konzept ausarbeiten (Kettendurchlauf?)
// Start-Stop-Konzept ausarbeiten
// insbesondere bei Verzweigungen nur eigene Zweige anhalten? Implementation im endlichen Automaten?

// Ein bestimmtes Promise ist bereits vorhanden. Was soll darufhin ausgeführt werden?
// * einfache Funktion - ohne Promise-Rückgabe  => onSucess, onError, onFinal
// * synchrone "Filter"-Funktion - neues Promise | unstoppbar
// * synchroner Filter oder Funktion mit callback - neues Promise | möglichst stoppbar
// * synchroner Filter oder Rückgabe Promise - neues Promise | möglichst stoppbar
// * Funktion mit callback - neues Promise | stoppbar ?
// * weiteres Promise - neues Promise (Chain?) | auf alle Fälle stoppbar
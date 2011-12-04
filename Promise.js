/* OPEN ISSUES
* if a promise is already fulfilled, you can add on*-Handlers which will never be called
** call handlers when adding them to fulfilled promises? What about restartables then?
** public getState function?
* What happens to a stopped multiple promise, which gets started with a new parameter?
* multiple promises getting ended with different types while beeing stopped are not correctly restarted!
* conventions for errors: Must be multiple callback, Must be string message in first place, Must be object details in second, happened where?
* dann-Promises have no chance to receive messages from wenn. Any need for that?
* implement a get(prop) function. ridicoulus approach?
* abort dann in error case / abort sonst in sucess case ???
			// wenn.onError(dann.abort) ???
			// wenn.onSucess(sonst.abort) ???
* .then(function(r, s){ [...]; s(x, y, z)}).then(fn) == .then(function(r, s){ [...]; return fn(x, y, z);})
*/

window.Promise = function Promise(fn, multiple) {
/* get: function callback(Array arguments, Function onsucess, Function onerror[, Function onmessage])[, 0/false: only once | 1/true: restartable | 2: multiple (cloneable)]
return: a Promise to call all added Listeners when fn returns a result after invoking start()
		ein Versprechen, alle angefügten Listener aufzurufen, wenn nach dem Aufruf von start() Ergebnisse von fn zurückkomen */
	if (fn instanceof Promise)
		return fn;
	if (typeof fn != "function")
		throw new TypeError("(new) Promise must be called with a function as the argument");
	var that = this,
		wenn = null,
		erg = null,
		stopped = false, // ↔ true, solange ended!==true
		// Wäre es evtl besser, mit stopped anzufangen? So können von Anderen ausgelöste Handler (???) abgefangen werden, zumindest vor dem Starten.
		ended = false, // → "sucess"/"error"/… → true
		stopp = null,
		go = null,
		cache = [],
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
	multiple = Number(multiple);
	if (multiple < 0) // nicht [0,1,2].contains(multiple) // multiple == 1.5 -> not multiple but coneable
		multiple = 0;

	function end(result, type) {
//console.debug(this);
		if (ended === true && multiple < 1)
			return false; // nur einmal ausführen (wie vorgeschrieben)
if (stopped && ended !== type) console.log("Promise|end: already ended as "+ended+", but multiple ending with "+type+"!!!");
		ended = type;
//console.log("Promise|end: on"+ended+", stopp="+stopped);
		if (stopped) {
			cache.push(result);
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
				of[i](result, type);

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

	this.start = function startPromise(p) {
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
		if (stopped) {
			stopped = false;
			if (ended) {
				for (var i=0; i<cache.length; i++)
					end(cache[i], ended);
				return ended;
			}
			if (typeof go == "function")
				/*return*/ stopp = go();
			return that.stop;
		}
		if (multiple < 2 && stopp) // fn/wenn läuft bereits
			return false;

		erg = fn(arguments.length > 1 ? params : p, sucessCallback, errorCallback, messageCallback);
		if (erg instanceof that.constructor) { // ermöglicht "REKURSION"
			wenn = erg;
			wenn.onSucess(sucessCallback);
			wenn.onError(errorCallback);
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
		return that.stop;
	};
	this.stop = function stopPromise() {
		if (stopped || ended === true)
			return false;
		stopped = true;
//console.log("promise stopped");
		if (typeof stopp == "function")
			/*return*/ go = stopp();
		return that.start;
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
	this.toString = function stringofPromise() {
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
		dann = new this.constructor(dann);
		wenn.onSucess(dann.start);
		if (sonst) {
			sonst = new this.constructor(sonst);
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
			wenn.onMessage(m);
			
			if (!wenn.start(p))
				return false;
			return function stop() {
				var start;
				if ((start = wenn.stop()) || (start = dann.stop()) || (start = sonst.stop()))
					return start.result(stop);
				return false;
			};
		});
	},
	syncThen: function(fn) {
// see also Promise.filter (which can't raise errors)
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
	detachThen: function(fn) {
// fn won't be called with any parameters given to start
		return this.then(function() {
			return new Promise(fn);
		});
	},
	correct: function(sonst) {
/* handle errors, wie bei then() nur ohne dann */
		var wenn = this;
		sonst = new this.constructor(sonst);
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
				var start;
				if ((start = wenn.stop()) || (start = sonst.stop()))
					return start.result(stop);
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
	},
	each: function(fn) {
		return this.then(function each(res) {
			if (!Array.isArray(res))
				return (new Promise(fn)).start.apply(null, Array.prototype.slice.call(arguments, 0));
			return Promise.merge(res.map(fn));
		});
	},
	defer: function(ms) {
		if (ms <= 0)
			return this;
		return Promise.wait(ms).then(this);
	}
});

Object.extend(window.Promise, {
	when: function(p, dann, sonst) {
		return p.then(dann, sonst);
	},
	wait: function(ms) {
// see also Promise.prototype.defer
		if (typeof ms != "number")
			throw new TypeError("Promise.defer: ms must be a number, not a "+typeof ms);
		return new Promise(function(p, s) {
			setTimeout(function() {
				s[Array.isArray(p) ? "apply" : "call"](null, p);
			}, ms);
		});
	},
	merge: function(promises, automerge) {
/* get: Promise, Promise[, Promise][, ...]
return: Promise, dass jedes übergebene erfüllt ist */
		if (!Array.isArray(promises)) {
			promises = Array.prototype.slice.call(arguments, 0);
			automerge = false;
		}
		promises = promises.filter(function(p) {
			return typeof p == "function" || p instanceof Promise;
		});
console.debug("Promise.merge",promises);
		if (promises.length == 1) {
			var promise = new Promise(promises[0]);
			return automerge
				? promise
				: promise.filter("sucess", function(r) {
					return [r]; // man erwartet schließlich ein Array von uns
				});
		}
		return new Promise(function(p, s, e, m) {
			var results = [];
			var stopgo = [];
			var counter = 0;
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
			if (promises.length == 0)
				s.apply(null, results);
			
			promises.forEach(function(promise, i) {
				stopgo.push(new Promise(promise).onSucess(function(r) {
					// m("new Value");
					newValues(arguments, i);
				}).onError(e).onMessage(m).start(p));
			});
			
			return function startstop() {
				for (var i=0; i<stopgo.length; i++)
					if (typeof stopgo[i] == "function")
						stopgo[i] = stopgo[i]();
				return startstop;
			};
		});
	}
});
window.Promise.Stream = function PromiseStream(fn) {
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
					onItem[i](items[counter], counter);
		}
	}
	var promise = this.promise = new Promise(function startStreamPromise(p, s, e, m) {
		var stop = fn(p, function(item) {
			if (typeof item != "undefined") {
//console.debug("Promise.Stream: new item", item);
				items.push(item);
				if (!stopped)
					run();
			} else {
//console.debug("Promise.Stream: items", items);
				s(items);
			}
		}, e, m);
		return function stopStream() {
			stopped = true;
			if (typeof stop == "function")
				var start = stop(); // fn?
			return function startStream() {
				stopped = false;
				run(); // ausstehende callbacks
				if (typeof start == "function")
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
};
Object.extend(window.Promise.Stream.prototype, { // some cute Array-like function, but here: asynchrounus onItem!
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
		var i = 0, s = this;
		if (fn instanceof Promise)
			return new Promise.Stream(function(p, callback, e, m) {
				s.each(function asyncStreamFilter(r){
					;//
				}).promise.onSucess(callback.arg()).onError(e).onMessage(m).start(p);
			});
		else if (typeof fn == "function")
			return new Promise.Stream(function(p, callback, e, m) {
				s.each(function streamFilter(r){
					if (fn.call(context, r, i++))
						callback(r);
				}).promise.onSucess(callback.arg()).onError(e).onMessage(m).start(p);
			});
		else
			throw new TypeError("Promise.Stream:filter must be called with either a function or a Promise");
	},
	get forEach() { return this.each },
	map: function(fn, context) {
		var i = 0, s = this;
		if (fn instanceof Promise)
			return this.mapPromise(fn);
		else if (typeof fn == "function")
			return new Promise.Stream(function(p, callback, e, m) {
				s.each(function streamMapper(r){
					callback(fn.call(context, r, i++));
				}).promise.onSucess(callback.arg()).onError(e).onMessage(m).start(p);
			}); 
		else
			throw new TypeError("Promise.Stream:map must be called with either a function or a Promise");
	},
	reduce: function(fn, accum, context) {
		if (typeof fn !== "function")
			throw new TypeError();
		var i = 0, s = this;
		return new Promise(function(p, callback, e, m) {
			s.each(function(r){
				accum = (i == 0 && typeof accum == "undefined")
					? r
					: fn.call(context || null, accum, r, i++);
			}).promise.onSucess(function(){
				callback(accum);
			}).onError(e).onMessage(m).start(p);
		});
	},
	mapPromise: function(prom, nomix) {
		prom = new Promise(prom, 2);
		nomix = Number(nomix) || 0;
		if (![0, 1, 2].contains(nomix))
			throw new RangeError("Promise.stream.mapPromise: nomix must be either 0 (false), 1 (true) or 2!");
		if (nomix == 1 && !prom.clone)
			throw new Error("Promise.Stream.mapPromise: a nomix value of 1 cannot be used together with an unclonable promise!");
		var s = this;
		return new Promise.Stream(function mappedStream(p, callback, e, m) {
			var stops = [];
			var gos = [];
			var tbd = []; // tobedone
			var counter = 0;
			var running = 0;
			var done = false;
			function run() {
				while (typeof tbd[0] != "undefined") {
					callback(tbd.shift());
					counter++;
				}
			}
			if (nomix == 0) { // Reihenfolge, in der callback aufgerufen wird, muss nicht mit der start-Reihenfolge übereinstimmen
				prom.onSucess(function(r) {
					running--;
					callback(typeof r == "undefined" ? null : r);
					if (!running && done)
						callback();
				}).onError(e).onMessage(m)
				s.each(function asyncStreamMapper(r){
					running++;
					var stop = prom.start(r);
					if (typeof stop != "function")
						throw new Error("Promise.Stream.mapPromise|asyncStreamMapper0: couldn't start promise which should be multiple");
					stops[1] = stop; // prom.stop, immer dasselbe
				});
			} else if (nomix == 1) { // Reihenfolge der callbacks ist exakt die der Starts, daher eigenes Promise für jedes item
				s.each(function asyncStreamMapper(r, i){
					running++;
					stops.push(prom.clone().onSucess(function(r) {
						running--;
						tbd[i-counter] = typeof r == "undefined" ? null : r;
						run();
						if (!running && done) // && !tbd.length ?
							callback();
					}).onError(e).onMessage(m).start(r));
				});
			} else if (nomix == 2) { // Reihenfolge, in der callback aufgerufen wird, ist vom zweiten (onSucess-) Rückgabewert abhängig
				prom.onSucess(function(r, index) {
					running--;
					tbd[index-counter] = typeof r == "undefined" ? null : r;
					run();
					if (!running && done) // && !tbd.length ?
						callback();
				}).onError(e).onMessage(m)
				s.each(function asyncStreamMapper(r, i){
					running++;
					var stop = prom.start(r, i); // !!!
					if (typeof stop != "function")
						throw new Error("Promise.Stream.mapPromise|asyncStreamMapper2: couldn't start promise which should be multiple");
					stops[1] = stop; // prom.stop, immer dasselbe
				});
			}
			stops[0] = s.promise.onSucess(function() {
				done = true;
				if (!running && done)
					callback();
			}).onError(e).onMessage(m).start(p);
			
			return function stopParallelStreams() {
				gos = [stops[0]()]; // s.stop
				var go;
				for (var i=1; i<stops.length; i++)
					if (typeof (go = stops[i]()) == "function")
						gos.push(go);
				return function startParallelStreams() {
					stops = [gos[0]()]; // s.start
					var stop;
					for (var i=1; i<gos.length; i++)
						if (typeof (stop = gos[i]()) == "function")
							stops.push(stop);
					return stopParallelStreams;
				};
			};
		}); 
	}
});
window.Promise.Chain = function() {

};
window.Promise.Automat = window.Promise.Machine = function() {
/* get:
return: a Promise to be fulfilled when the final state is reached
	implements a full finite-state-machine */

}
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
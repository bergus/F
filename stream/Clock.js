/*
Example:
var c = new Clock(1500),
    b = new Clock(c, 750),
    a = compose([b, c]);
a.addListener(console.log); 
*/
var Clock = (function() {
	"use strict";
	
	var timeout = null,
	    timers = [];
	function check() {
		if (!timers.length) {
			timeout = null;
			return;
		}
		var t = Date.now(),
		    nexttime = timers[0].time;
		if (t >= nexttime-2) { // @FIXME: Just believe the timeout?
			var c = new ContinuationBuilder();
			do { // invariant: timers.length does not decrease
				var timer = timers.shift();
				c.add(timer.fire.bind(null, t));
				timers.insertSorted(timer.next(), "time");
			} while (timers[0].time == nexttime);
			Stream.dispatch(c.getContinuation()); // but this might remove some
		}
		if (timers.length)
			timeout = setTimeout(check, timers[0].time-t);
	}
	function Clock(from, interval) {
		if (arguments.length == 1) {
			interval = from;
			from = new Date;
		}
		var time = from.getTime();
		this.getTime = function() { return time; };
		Stream.call(this, function(fire) {
			var timer = {
				fire: fire,
				time: time,
				next: function() {
					this.time += interval;
					return this;
				}
			};
			return Function.delegateName({
				go: function go() {
					var t = Date.now(),
					    nexttime = timer.time = t - (t-time) % interval + interval;
					timers.insertSorted(timer, "time"); 
					if (!timeout || nexttime < timers[1].time) {
						if (timeout)
							clearTimeout(timeout);
						timeout = setTimeout(check, nexttime-t);
					}
				},
				stop: function stop() {
					timers.remove(timer);
					if (!timers.length) {
						clearTimeout(timeout);
						timeout = null;
					}
				}
			});	
		});
	}
	Clock.prototype = Object.create(Stream.prototype, {constructor: {value: Clock}});
	
	return Clock;
})();

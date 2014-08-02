var Promise = require("./Promise.js");
exports.resolved = function(v) {
	if (v instanceof Promise || v && {}.hasOwnProperty.call(v, "then")) console.warn("This would not make you lucky if it was Promise.of");
	return Promise.resolve(v);
};
exports.rejected = Promise.reject;
exports.deferred = function() {
	var d = {};
	d.promise = new Promise(function(fulfill, reject) {
		d.resolve = function(v) {
			if (v instanceof Promise || v && {}.hasOwnProperty.call(v, "then")) console.warn("Don't call deferred.resolve() with a promise when it might do a fulfill()");
			fulfill.async(v);
		};
		d.reject = reject.async;
	}).chain(Promise.from); // make .fulfill() a .resolve()
	return d;
};

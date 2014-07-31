var Promise = require("./Promise.js");
exports.resolved = function(v) {
	if (v && (v instanceof Promise || {}.hasOwnProperty.call(v, "then"))) console.error("this will not make you lucky");
	return Promise.resolve(v);
};
exports.rejected = Promise.reject;
exports.deferred = function() {
	var d = {};
	d.promise = new Promise(function(fulfill, reject) {
		d.resolve = function(v) {
			if (v instanceof Promise) console.error("Don't call deferred.resolve with a promise");
			fulfill.async(v);
		};
		d.reject = reject.async;
	}).chain(Promise.resolve);
	return d;
};

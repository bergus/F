var Promise = require("./Promise.js");
exports.resolve = Promise.of; // Promise.resolve
exports.reject = Promise.reject;
exports.deferred = function() {
	var d = {};
	d.promise = new Promise(function(fulfill, reject) {
		d.resolve = fulfill.async;
		d.reject = reject.async;
	});
	return d;
};

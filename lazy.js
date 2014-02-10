Function.const = function(x) {
	return function() {
		return x;
	};
};
function Lazy(fn, args, context) {
	if (!args)
		return Lazy.fmap(fn);
	if (!this.lazy)
		this.lazy = true;
	this.execute = function() {
		for (var i=0, l=args.length; i<l; i++)
			if (args[i] instanceof Lazy)
				args[i] = args[i].execute();
		if (context instanceof Lazy)
			context = context.execute();
		var result = fn.apply(context, args);
		this.execute = Function.const(result);
		return result;
	};
}
Lazy.prototype.lazy = true;

Lazy.fmap = function map(fn) {
	return function() {
		return new Lazy(fn, arguments, this);
	};
};

function lazy(fn, args) {
	if (!args)
		return fmap(fn);
	var result;
	function execute() {
		if (!args)
			return result;
		for (var i=0, l=args.length; i<l; i++) {
			var a = args[i];
			if (a && a.lazy && typeof a.execute == "function")
				args[i] = a.execute();
		}
		result = fn.apply(null, args);
		fn = args = null; // collect garbage
		execute.execute = Function.const(result);
		return result;
	}
	execute.execute = execute;
	execute.lazy = true;
	return execute;
}
function fmap(fn) {
	return function() {
		if (this == null)
			return lazy(fn, arguments);
		Array.prototype.unshift.call(arguments, this);
		return lazy(Function.prototype.call.bind(fn), arguments);
	};
}
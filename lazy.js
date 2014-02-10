Function.const = function(x) {
	return function() {
		return x;
	};
};
function Lazy(fn, args, context) {
	if (args)
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
	else
		return function() {
			return new Lazy(fn, arguments, this);
		};
}
Lazy.prototype.lazy = true;

function lazy(fn, args) {
	if (!args)
		return function() {
			if (this == null)
				return lazy(fn, arguments);
			Array.prototype.unshift.call(arguments, this);
			return lazy(Function.prototype.call.bind(fn), arguments);
		};
	var result,
		done = false;
	function execute() {
		if (done)
			return result;
		for (var i=0, l=args.length; i<l; i++) {
			var a = args[i];
			if (a && a.lazy && typeof a.execute == "function")
				args[i] = a.execute();
		}
		result = fn.apply(null, args);
		done = true;
		execute.execute = Function.const(result);
		return result;
	}
	execute.execute = execute;
	execute.lazy = true;
	return execute;
}

/* better garbage collection (of fn and args) with this pattern:
function lazy(fn, args, context) {
	var result = null;
	var todo = function() {
		todo = false;
		return result = fn.apply(context, args);
	};
	return function() {
		return !todo ? result : todo();
	};
}
*/
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

Lazy.fmap = function fmap(fn) {
// lift :: (a -> b) -> ((Lazy a|a)... -> Lazy b)
	return function() {
		return new Lazy(fn, arguments, this);
	};
};

/* https://github.com/fantasyland/fantasy-land */
// Functor
Lazy.prototype.map = function map(fn) {
	return new Lazy(fn, [this], arguments[1]);
	// return new Lazy(this.execute.map(fn), []);
};
// Applicative
Lazy.prototype.ap = function ap(g) {
	return new Lazy(Function.prototype.call, [null, g], this);
	// return new Lazy(function(fn, v) { fn(v); }, [this, g]);
};
// Applicative, Monad
Lazy.prototype.of = Lazy.of = function(v) {
	var l = Object.create(Lazy.prototype);
	l.execute = Function.const(v);
	return l;
};
// Chain, Monad
Lazy.prototype.chain = function chain(fn) {
	return new Lazy(function(self) {
		return fn(self).execute();
	}, [this]);
};


// ==============================
// functional, without instances:

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
// lift :: (a -> b) -> (()->a|a)... -> (()->b))
	return function() {
		if (this == null)
			return lazy(fn, arguments);
		Array.prototype.unshift.call(arguments, this);
		return lazy(Function.prototype.call.bind(fn), arguments);
	};
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
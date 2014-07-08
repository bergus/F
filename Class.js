function subclass(superConstructor, makeConstructor, prototype) {
	var constructor = makeConstructor(superConstructor);
	constructor.prototype = Object.create(superConstructor.prototype);
	constructor.prototype.constructor = constructor;
	if (typeof prototype == "function")
		prototype = prototype.call(constructor.prototype, superConstructor.prototype);
	if (Object(prototype) === prototype && constructor.prototype !== prototype)
		Object.extend(constructor.prototype, prototype);
	return constructor;
}

function composeConstructor(child, parent) {
	// maybe just .curry()?
	if (arguments.length < 2)
		return function(parent) { return composeConstructor(child, parent); };
	function constructor() {
		var that = parent.apply(this, arguments);
		if (!that || Object(that) !== that) that = this;
		return child.apply(that, arguments);
	}
	constructor.prototype = child.prototype;
	constructor.prototype.constructor = constructor;
	return constructor;
}

/* Example usage:

function Animal(name) {
	this.name = name;
}
Animal.prototype.greet = function() {
	return "Hi, I'm "+this.name;
}

var Cat = subclass(Animal, composeConstructor(function(name, color) {
	this.color = color;
}), function(super) { // You might as well pass an object literal here
	this.greet = function() {
		return super.greet.call(this)+" and my fur is "+this.color;
	};
	// or just
	return {
		shout: function() {
			return "Meow!";
		}
	};
});

var cat = new Cat("Garfield", "orange");

*/
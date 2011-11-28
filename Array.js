Array.toArray = Array.from = function(o) {
/* get: array-�hnliches Objekt mit L�nge "length" und ggf. Eintr�gen
return: echtes Array */
	if (! o)
		return []; // new Array()
	if (o !== Object(o))
		throw new TypeError('Array.toArray called on non-object');
	if ('toArray' in o && typeof o.toArray == "function")
		return o.toArray();
	if (typeof o.length != "number")
		throw new TypeError('Array.toArray called on object without length');
	var i, l=o.length, ret=Array(l);
	for (i=0; i<l; i++)
		if (Object.prototype.hasOwnProperty.call(o, i))
			ret[i] = o[i];
	return ret;
};

Array.kartesischesProdukt = Array.cartesian = function cartesian() {
/* get: Array, Array[, ...]
return: (multiples) kartesisches Produkt der �bergebenen Arrays,
			sprich ein Array mit allen Arrays, die jeweils die Zahl der �bergebenen Arrays als L�nge haben und deren Werte eine Kombination aus Werten der �bergebenen Arrays darstellen
			die Reihenfolge wird dabei nicht ver�ndert, d.h. der 5. Wert eines Ergebnisarrays stammt aus dem 5. �bergebenen Array 
			Bsp: Array.kartesisches Produkt([1,2],[3,4,5])==[[1,3],[1,4],[1,5],[2,3],[2,4],[2,5]] */
	var r = [], arg = arguments, max = arg.length-1;
	function helper(arr, i) {
		for (var j=0, l=arg[i].length; j<l; j++) {
			var a = arr.slice(0); //Object.clone(arr);
			a.push(arg[i][j])
			if (i==max) {
				r.push(a);
			} else
				helper(a, i+1);
		}
	}
	helper([], 0);
	return r;
};
Array.potenzMenge = Array.power = function power(a) { // This is not a prototype function, even if it takes only one argument!
/* get: Array a
		nat�rlich ist diese Implementation nicht unbedingt performant (a wird a.length mal durchlaufen, ebenso das kartesische Produkt aus a.length zweistelligen Arrays), aber elegant :-)
return: Array mit allen m�glichen Untermengen von a (alle Arrays, deren Elemente in a enthalten sind) */
	return Array.cartesian.apply(null, Array.build(a.length, [true, false])).map(function(set) {
		return a.filter(function(v, i){return set[i];}); // each set is an Array of boolean values
	});
}

Array.build = function(times, fn, context) {
	var ret = new Array(times);
	if (typeof fn == "function")
		for (var i=0; i<times; i++)
			ret[i] = fn.call(context || null, i, ret/*, ret.last*/);
	else if (typeof fn == "number")
		for (var i=0; i<times; i++)
			ret[i] = i * fn;
	else if (typeof fn == "string")
		for (var i=0; i<times; i++)
			ret[i] = fn.replace(/\$1/g, i);
	else
		for (var i=0; i<times; i++)
			ret[i] = fn; // no cloning!
	return ret;
};

/* Array.prototype.contains = function(el, fn) {
	if (typeof fn == "function") {
		for (var i=0;i<this.length;i++)
			if (fn(this[i], el) )
				return true;
	} else {
		for (var i=0;i<this.length;i++)
			if (this[i] === el)
				return true;
	}
	return false;
};*/

Array.prototype.merge = function merge(a) {
    for ( var nodupl = [], i = 0, l = a.length; i<l; i++ )
        if ( this.indexOf(a[i]) === -1 )
            nodupl.push(a[i]);
	if (arguments.length > 1)
		return merge.apply(this.concat(nodupl), Array.prototype.slice.apply(arguments, 1));
    return this.concat(nodupl);
};

Array.prototype.uniqueMerge = function uniqueMerge(a, /*key, fn*/) {
	if (!Array.isArray(this))
		throw new TypeError("Array.prototype.uniqueMerge must be called on an Array");
	var al = arguments.length, test, fn, key;
	if (typeof arguments[l-1] == "function")
		test = fn = arguments[--l];
	if (typeof arguments[l-1] == "string") {
		key = arguments[--l];
		test = fn
			? function(a, b) { return a[key] == b[key] && fn(a, b); }
			: function(a, b) { return a[key] == b[key]; }
	}
	var res = [].combine(this, test);
	for (var i=0; i<al; i++)
		res.combine(arguments[i]);
	return res;
};

Array.prototype.unique = function(test) {
	if (!Array.isArray(this))
		throw new TypeError("Array.prototype.unique must be called on an Array");
	return this.slice(0).sort().filter( typeof test == "function"
		? function(v, i, a) { return !i || !test(v, a[i-1]); }
		: function(v, i, a) { return !i || v !== a[i-1]; }
	);
};
/* unsorted, but longer:
Array.prototype.unique = function () {
	var r = [];
	if (typeof test == "function")
		for (var i=0, l=this.length; i<l; i++)
			if (! r.some(function(v) { return test(v, this); }, this[i]) )
				r.push(this[i]);
    else
		for (var i=0, l=this.length; i<l; i++)
			if (r.indexOf(this[i]) == -1)
				r.push(this[i]);
    return r;
}; */

Array.prototype.removeDuplicates = function(test) {
	if (!Array.isArray(this))
		throw new TypeError("Array.prototype.removeDuplicates must be called on an Array");
	var dupl = [];
	if (typeof test == "function") {
		for (var i=this.length-1; i>=0; i--)
			if (this.some(function(v, vi) { return vi!=i && test(v, this); }, this[i]) )
				dupl.unshift(this.splice(i, 1)[0]);
	} else {
		for (var i=this.length-1; i>=0; i--)
			if (i && this.lastIndexOf(this[i], i-1) > -1)
				dupl.unshift(this.splice(i, 1)[0]);
	}
	return dupl;
};

Array.prototype.erase = function(item) {
	var i = 0;
	while ((i = this.indexOf(item, i)) > -1)
		this.splice(i--, 1);
	return this;
};

Array.prototype.include = function(item, test) {
	if (test
		? ! this.some(function(v){return test(v, item);})
		: this.indexOf(item) == -1
	)
		this.push(item);
	return this;
};

Array.prototype.combine = function(a, test) {
	//for (var i=0; i<a.length; i++) this.include(a[i], test);
	if (typeof test == "function") {
		for (var i=0; i<a.length; i++)
			if (! this.some(function(v){return test(v, a[i]);}))
				this.push(a[i]);
	} else {
		for (var i=0; i<a.length; i++)
			if (this.indexOf(a[i]) == -1)
				this.push(a[i]);
	}
	return this;
};

Array.prototype.invoke = function(methodName/*, arguments*/) {
	var args = Array.prototype.slice(arguments, 1);
    for (var i=0; i<this.length; i++)
		if (Object(this[i]) === this[i] && typeof this[i][methodName] == "function")
			this[i][methodName].apply(this[i], args);
	return this;
};

Array.prototype.clean = Array.prototype.compact = function compact() {
	for (var i=0; i<this.length; i++)
		if (!(i in this) || this[i] == null)
			this.splice(i--, 1);
	return this;
};

Array.prototype.by = function(key) {
	return this.toObject(function(map, el) {
		map[el[key]] = el;
		// delete el[key];
	});
};

Object.extend(Array.prototype, {
	get last() {
		return this[this.length-1];
	},
	set last(x) {
		this [this.length-1] = x;
	},
	get first() {
		return this[0];
	},
	set first(x) {
		return this[0] = x;
	}
});

if (!Array.prototype.toObject) Array.prototype.toObject = function(fn, context) {
/* get: function(map, value, index, array)[, context]
		inspiriert von [...].reduce(function(map, value, index, array){ return Object.set(map, "...", ...); }, {});
		jetzt einfach  [...].toObject(function(map, ...              ){ map["..."] = ...; }); // return-Wert f�llt weg
return: new Object with setted keys and values */
	var map = {};
	this.forEach(fn.curry(map), context);
	return map;
};

Array.prototype.mapToObject = function(f, col) {
/* get: [function(Wert, Index, ganzes Array)returns Objekt mit key und value][, Kollisionsfunktion wie bei Object.extend f�r gleiche Schl�ssel]
return: Object mit den zur�ckgegebenen Schl�sseln und Werten */
	if (typeof f != "function")
		f = function(val, index, array) {
			var o = {};
			switch(typeof val) {
				case "string":
				case "number":
					o[val] = null; return o;
				case "function":
					o[val.name || "anonymus" ] = val; return o;
				case "object":
					if (Object.keys(val).length = 1) return val;
					if (typeof f == "string" || typeof f == "number") { o[val[f]] = val; return o; }
					return val;
			}
			alert ("Array.prototype.toObject: unrecognised type: "+typeof val); return o;
		}
	return this.reduce(function(map, val, index) {
		return Object.extend(map, f(val, index, this), col);
	}, {});
};

Array.prototype.flatten = function flatten() {
	for (var i=0; i<this.length; i++)
		if (Array.isArray(this[i])) {
			this[i].unshift(1);
			this[i].unshift(i);
			this.splice.apply(this, this[i]);
		}
	return this;
};
Array.prototype.flattened = function flattened(level) {
	return this.reduce(function(a, v) {
		if (Array.isArray(v) && level>0)
			return a.concat(a.flattened(level-1));
		a.push(v);
		return a;
	}, []);
};
/* noch zu bearbeiten
Array.prototype.getHexRGB = function() {
	if (this.length != 3) return "";
	return "#"+(this[0]%256).hex().padleft(2,"0")+(this[1]%256).hex().padleft(2,"0")+(this[2]%256).hex().padleft(2,"0");
};
Array.prototype.trimleft = function() {
	while(this.length && !this[0]) this.shift();
	return this;
};
Array.prototype.trimright = function() {
	while(this.length && !this[this.length-1]) this.pop();
	return this;
};
Array.prototype.trim = function() {
	return this.trimleft().trimright();
};
Array.prototype.splitBy = function(per) {
	var r = [];
	for (var i=0; i<this.length; i+=per)
		r.push(this.slice(0, per));
	return r;
} */

Object.keys(Array.prototype).concat(
	["concat", "join", "slice"/*, "toString",*/ "indexOf", "lastIndexOf"]
).concat(
	["filter", "forEach", "every", "map", "some", "reduce", "reduceRight"]
).forEach(function(method) {
	Array[method] = Array.prototype[method].

});

Array.prototype.durchschnitt = function() {
	return this.reduce(function(x, y){return x+y;},0)/this.length;
};
Array.prototype.min = function(){
	return Math.min.apply(null, this);
};

Array.prototype.max = function(){
	return Math.max.apply(null, this);
};

Array.prototype.average = function(){
	return this.length ? this.sum() / this.length : 0;
};

Array.prototype.sum = function(){
	// return this.reduce(function(x, y){return x+y;}, 0);
	var result = 0, l = this.length;
	while (l--)
		result += this[l];
	return result;
};
	
Array.prototype.kumulierteQuadratischeAbweichung = function(e) {
	if (typeof e != "number") e = this.durchschnitt();
	return this.reduce(function(x, y){var d=y-e; return x+d*d;},0);
};
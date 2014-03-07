Array.toArray = Array.from = function(o) {
/* get: array-ähnliches Objekt mit Länge "length" und ggf. Einträgen
return: echtes Array */
	if (! o)
		return []; // new Array()
	if (o !== Object(o))
		throw new TypeError('Array.toArray called on non-object');
	if ('toArray' in o && typeof o.toArray == "function")
		return o.toArray();
	if (typeof o.length != "number")
		throw new TypeError('Array.toArray called on object without length');
	// return Array.prototype.slice.call(o, 0);
	var i, l=o.length, ret=Array(l);
	for (i=0; i<l; i++)
		if (Object.prototype.hasOwnProperty.call(o, i))
			ret[i] = o[i];
	return ret;
};

Array.kartesischesProdukt = Array.cartesian = function cartesian() {
/* get: Array, Array[, ...]
return: (multiples) kartesisches Produkt der übergebenen Arrays,
			sprich ein Array mit allen Arrays, die jeweils die Zahl der übergebenen Arrays als Länge haben und deren Werte eine Kombination aus Werten der übergebenen Arrays darstellen
			die Reihenfolge wird dabei nicht verändert, d.h. der 5. Wert eines Ergebnisarrays stammt aus dem 5. übergebenen Array
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
		http://jsperf.com/power-set
return: Array mit allen möglichen Untermengen von a (alle Arrays, deren Elemente in a enthalten sind) */
// nicht unbedingt performant, aber elegant :-)
//	return Array.cartesian.apply(null, Array.build(a.length, [true, false])).map(function(set) {
//		return a.filter(function(v, i){return set[i];}); // each set is an Array of boolean values
//	});
// andere Implementationsmöglichkeit:
//    return Array.build(Math.pow(2, a.length), function(i) {
//		var r=[];
//		for (var j=0; j<a.length; j++)
//			if (i & Math.pow(2,j))
//				r.push(a[j]);
//		return r;
//	});
// und noch eine:
    var r = [[]], l=1;
	for (var i=0; i<a.length; l=1<<++i) // OK, l is just r[i].length, but this looks nicer :)
		for (var j=0; j<l; j++) {
			r.push(r[j].slice(0)); // copy
			r[j].push(a[i]);
		}
	return r;
}

Array.build = function(n, fn, context) {
/* get: ( number, function[, context] | number, number[, number] | number, string[, number] | number, any )
return: an Array with n items - build depending on typeof fn */
	var ret = new Array(n);
	if (typeof fn == "function")
		for (var i=0; i<n; i++)
			ret[i] = fn.call(context || null, i, ret/*, ret.last*/);
	else if (typeof fn == "number")
		for (var i=0; i<n; i++)
			ret[i] = context ? (i*fn)%context : i*fn;
	else if (typeof fn == "string")
		for (var i=0; i<n; i++)
			ret[i] = fn.replace(/\$1/g, context ? i%context : i);
	else
		for (var i=0; i<n; i++)
			ret[i] = fn; // no cloning!
	return ret;
};

Array.prototype.merge = function merge(a) {
/* get: Array[, Array, ...]
return: a new Array with items of this and all items from the argument arrays which were not in the result */
    for ( var nodupl = [], i = 0, l = a.length; i<l; i++ )
        if ( this.indexOf(a[i]) === -1 )
            nodupl.push(a[i]);
	if (arguments.length > 1)
		return merge.apply(this.concat(nodupl), Array.prototype.slice.call(arguments, 1));
    return this.concat(nodupl);
};

Array.prototype.uniqueMerge = function uniqueMerge(a/*, key, fn*/) {
/* get: Array[, Array, ...][, string][, function(a, b)]
return: a new Array with all items from this and the argument arrays without duplicates, equality determined optionally by the function or the function and equality of property values with the key */
	if (!Array.isArray(this))
		throw new TypeError("Array.prototype.uniqueMerge must be called on an Array");
	var al = arguments.length, test, fn, key;
	if (typeof arguments[al-1] == "function")
		test = fn = arguments[--al];
	if (typeof arguments[al-1] == "string") {
		key = arguments[--al];
		test = fn
			? function(a, b) { return a[key] == b[key] && fn(a, b); }
			: function(a, b) { return a[key] == b[key]; }
	}
	var res = [].combine(this, test);
	for (var i=0; i<al; i++)
		res.combine(arguments[i], test);
	return res;
};

Array.prototype.unique = function(test) {
/* get: [function(a, b)]
	the values in the Array must be sortable!
	Equality determined either by === or optional function
return: a new, sorted Array without duplicates.  */
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
/* get: [function(a, b)]
		removes duplicate values. Equality optionally determined by given function
return: the removed values */
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

Array.prototype.remove = Array.prototype.erase = function erase(item) {
/* get: any[, any, ...]
		removes all appearances of the given item(s)
return: this */
	var i = 0;
	while ((i = this.indexOf(item, i)) > -1)
		this.splice(i--, 1);
	if (arguments.length > 1)
		return erase.apply(this, Array.prototype.slice.call(arguments, 1));
	return this;
};

Array.prototype.include = function include(item, test) {
/* get: any[, function(b, a)]
		appends item if it is not already contained. Equality optionally determined by given function
return: this */
	if (test
		? ! this.some(test.bind(null, item))
		: this.indexOf(item) == -1
	)
		this.push(item);
	return this;
};

Array.prototype.combine = function(a, test) {
/* get: Array[, function(b, a)]
		appends all items from the array if they are not already contained. Equality optionally determined by given function
		equal to: for (var i=0; i<a.length; i++) this.include(a[i], test);
return: this */
	if (typeof test == "function") {
		for (var i=0; i<a.length; i++)
			if (! this.some(test.bind(null, a[i])))
				this.push(a[i]);
	} else {
		for (var i=0; i<a.length; i++)
			if (this.indexOf(a[i]) == -1)
				this.push(a[i]);
	}
	return this;
};

Array.prototype.equals = function(b) {
	return this.length >= b.length && this.every(function(v, i) {
		return v == b[i];
	})
};
Array.prototype.equalsBy = function(b, fn) {
	if (typeof this == "function") { // Partial application for Array.equalsBy()
		fn = this;
		return function(a, b) {
			return a.equalsBy(b, fn);
		}
	}
	return this.length >= b.length && this.every(function(v, i) {
		return fn(v, b[i]);
	});
}

Array.prototype.invoke = function(methodName/*, arguments*/) {
/* get: property name[, any, ...]
		if an item is an Object and has such a method, the function is invoked (in context of the item and optionally with given arguments)
		the results are not stored
return: this */
	var args = Array.prototype.slice(arguments, 1);
    for (var i=0; i<this.length; i++)
		if (Object(this[i]) === this[i] && typeof this[i][methodName] == "function")
			this[i][methodName].apply(this[i], args);
	return this;
};

Array.prototype.clean = Array.prototype.compact = function compact() {
/*		removes any undefined values and not existing keys from the array
return: this */
	for (var i=0; i<this.length; i++)
		if (!(i in this) || typeof this[i] == "undefined")
			this.splice(i--, 1);
	return this;
};

Array.prototype.swap = function swap() {
/* get: index, index[, index, ...]
		swaps the item from the last given index to the second-to-last given index, ... from the second given index to the first and from the first to the last
		or: rotateLeft by one the subarray of items with the given indizes
		negative indizes are seen as from the end of the array
		["a","b","c","d","e"].swap(0,4,3) -> e b c a d
return: this */
	for (var i=0; i<arguments.length; i++)
		if (arguments[i] < 0)
			arguments[i] += this.length;
	var temp = this[arguments[0]];
	for (var i=0; i<arguments.length-1; i++)
		this[arguments[i]] = this[arguments[i+1]];
	this[arguments[i]] = temp;
	return this;
};
Array.prototype.orderTo = function orderTo(order) {
/* get: {Array|Object} new ordered indizes
		orders the items
		["a","b","c","d","e"].orderFrom([0,1,4,2,3]) -> a b e c d
return: a new Array */
	var res = new Array(this.length);
	for (var i=0; i<this.length; i++)
		res[i in order ? order[i] : i] = this[i];
	return res;
};
Array.prototype.orderedFrom = function orderFrom(order) {
/* get: {Array|Object} wrong ordered indizes
		orders the items
		"abcde".split("").orderFrom([0,1,4,2,3]) -> a b e c d
return: a new Array */
	var res = new Array(this.length);
	for (var i=0; i<this.length; i++)
		res[i] = this[i in order ? order[i] : i];
	return res;
};
Array.prototype.take = function fromOrder(order) {
/* get: {Array} indizes
		slices the given indizes to a new array
		"abcdefghijk".split("").take([0,1],2,5,1,[4,3]) -> a b c f b e d
return: new Array */
	order = Array.prototype.flatten.call(arguments);
	var res = new Array(order.length);
	for (var i=0; i<order.length; i++)
		res[i] = this[order[i]];
	return res;
};
Array.prototype.rotateLeft = function rotate(n) {
/* get: how far to rotate (default: 1)
		moves every item n to the left. 
return: this */
	n = typeof n == "number" ? n % this.length : 1;
	for (var i=0; i<n; i++)
		this.push(this.shift());
	return this;
};
Array.prototype.rotateRight = function rotate(n) {
/* get: how far to rotate (default: 1)
		moves every item n to the right. 
return: this */
	n = typeof n == "number" ? n % this.length : 1;
	for (var i=0; i<n; i++)
		this.unshift(this.pop());
	return this;
};

Array.prototype.by = function(key, mult) {
/* get: property name[, boolean]
		maps the array to an object. Items get keyed by their property values of the given property.
		If the mult parameter is true, the object will consist of keyed arrays of items, otherwise items with the same keys will overwrite each other
return: new Object */
	return this.toObject( mult
		? function(map, el) {
			var k = el[key];
			if (map[k])
				map[k].push(el);
			else
				map[k] = [el];
		}
		: function(map, el) {
			map[el[key]] = el;
			// delete el[key];
		}
	);
};

Array.set = function set(arr, index, value, col) {
/* get: {Array|undefined} zu erweiterndes Array, [{Number} index, ]{Mixed} value[, Kollisionsfunktion]
return: erweitertes Array */
	if (typeof arr == "undefined")
		arr = [];
	if (argument.length > 2)
		return Object.set.apply(this, arguments); // exact equivalent
	value = index; // else no index is given
	arr.push(value);
	return arr;
};

Array.prototype.get = function(key) {
/* get: a property-name-"path". See Object.get for the syntax
return: new array with property values of the items*/
	if (typeof key != "string" && typeof key != "number" || arguments.length > 1)
		return this.map(Object.get.apply(null, arguments));
	for (var i=0, l=this.length, res = new Array(l); i<l; i++)
		res[i] = this[i][key];
	return res;
};

Array.prototype.getBy = function getBy(prop, key, mult) {
/* get: {String-Array|String|Function} getting the object, {String-Array|String|Function|Boolean} the key to be stored as[, {Boolean} mult]
		Combination of get() and by()
		maps the array to an object. The selected values (prop parameter) get keyed by the selected property values (key parameter).
		Optionally they get stored in arrays of selected values to support equal keys without overwriting
		special feature: if the second parameter is boolean, the last string of the first parameter will be used to determine the key from the object, if it is false that property will even be deleted from the object.
return: new Object */
	if (typeof prop == "string")
		prop = [prop];
	if (typeof key == "function")
		var kfn = key;
	if (typeof prop == "function")
		var pfn = prop;
	else {
		if (typeof key == "boolean") {
			var del = !key;
			key = prop.pop();
		} else if (Array.isArray(key)) {
			if (key.length > 1)
				kfn = Object.get(key);
			else
				key = key[0];
		}
		if (prop.length > 1)
			pfn = Object.get(prop);
		else if (prop.length == 1)
			prop = prop[0];
		else
			var noprop = true;
	}
	return this.toObject( function(map, el) {
		var o = pfn ? pfn(el) : noprop ? el : el[prop];
		var k = kfn ? kfn(el) : el[key];
		if (del)
			delete o[key];
		map[k] = mult
			? Array.set(map[k], o)
			: o;
	});
};

if (!Array.prototype.toObject) Array.prototype.toObject = function(fn, context) {
/* get: function(map, value, index, array)[, context]
		inspiriert von [...].reduce(function(map, value, index, array){ return Object.set(map, "...", ...); }, {});
		jetzt einfach  [...].toObject(function(map, ...              ){ map["..."] = ...; }); // return-Wert fällt weg
return: new Object with setted keys and values */
	var map = {};
	this.forEach(fn.pcall(map), context);
	return map;
};

Array.prototype.mapToObject = function(f, col) {
/* get: [function(Wert, Index, ganzes Array)returns Objekt mit key und value][, Kollisionsfunktion wie bei Object.extend für gleiche Schlüssel]
return: Object mit den zurückgegebenen Schlüsseln und Werten */
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

Array.prototype.sortNumerical = function sortNumerical(ascending/*=true*/) {
/* get: [false] to sort descending
return: this */
	return this.sort( ascending===false // assume ascending if not disabled (descending)
		? function(a,b) {return b - a;}
		: function(a,b) {return a - b;}
	);
};

Array.prototype.sortBy = function sortBy(get, ascending) {
/* get: ( function(item) to return the value to be compared[, false to sort descending] | property-name-"path" for Object.get )
		sorts the array by a value, determined from an item by the get function.
		If the first of these values is a number (or can be converted to one), the sort will be numerical. Otherwise the sort is alphabetical, ignoring Uppercase.
		@TODO: Use toLocaleLowerCase(), localeCompare()
		@TODO: get returning undefined
return: this */
	if (typeof get != "function") {
		get = Object.get.apply(null, arguments);
		ascending = true;
	}
	if (this[0] && typeof get(this[0]).valueOf() == "number")
		return this.sort( ascending===false // assume ascending if not disabled (descending)
			? function(a,b) {return get(b) - get(a);}
			: function(a,b) {return get(a) - get(b);}
		);
	var tlc = String.prototype.toLowerCase;
	return this.sort( ascending===false
		? function(a, b) {
			var sa = tlc.call(get(a)), sb = tlc.call(get(b));
			return sa<sb ? -1 : sa>sb ? 1 : 0;
		}
		: function(a, b) {
			var sa = tlc.call(get(a)), sb = tlc.call(get(b));
			return sb<sa ? -1 : sb>sa ? 1 : 0;
		}
	);
};
Array.prototype.sortedBy = function sortedBy(get, ascending) {
/* get: function(item) to return the value to be compared[, false to sort descending]
		sorts the array by a value, determined from an item by the get function.
		If the first of these values is a number (or can be converted to one), the sort will be numerical. Otherwise the sort is alphabetical, ignoring Uppercase.
		does execute get() only once per array item, and is therefore faster than .sortBy()
		@TODO: Use toLocaleLowerCase(), localeCompare()
		@TODO: get returning undefined
return: a new, sorted Array */
	if (typeof get != "function")
		throw new TypeError("Array.sortedBy: parameter get must be a function!");
	var result = new Array(this.length),
		i,
		v;
	for (i=0; i<this.length; i++) {
		v = get(this[i]);
		if (typeof v == "object") v = v.valueOf();
		if (typeof v == "string") v = v.toLowerCase();
		result[i] = [v, this[i]];
	}
	result.sort( typeof result[0] == "number"
		? ascending===false // assume ascending if not disabled (descending)
			? function(a,b) {return b[0] - a[0];}
			: function(a,b) {return a[0] - b[0];}
		: ascending===false
			? function(a,b) {return a[0]<b[0] ? -1 : a[0]>b[0] ? 1 : 0;}
			: function(a,b) {return b[0]<a[0] ? -1 : b[0]>a[0] ? 1 : 0;}
	);
	for (i=0; i<result.length; i++)
		result[i] = result[i][1];
	return result;
};

Array.prototype.flatten = function flatten() {
/*		flattens the array for one level, i.e. replaces each Array-item with its items
		Unlike other libraries (base.js) this does no infinite flattening!
return: this */
	for (var i=0; i<this.length; i++)
		if (Array.isArray(this[i]))
			Array.prototype.splice.apply(this, [i, 1].concat(this[i]));
	return this;
};

Array.prototype.flattened = function flattened(level) {
/* get: [level of recursion]
		level = 0  is equal to .slice(0)
return: a new, flattened Array */
    if (typeof level != "number")
		level = Number.POSITIVE_INFINITY;
	if (level == 1)
		return Array.prototype.concat.apply([], this); // works only with arrays!
	return this.reduce(function(a, v) {
		if (Array.isArray(v) && level>0)
			return a.concat(a.flattened(level-1));
		a.push(v);
		return a;
	}, []);
};

Array.prototype.contains = function contains(item, test) {
/* get: item[, function(b, a)]
		Equality optionally determined by given function
return: boolean whether the item is in the array */
	return typeof test == "function"
		? this.some(function(v){return test(v, item);})
		: this.indexOf(item) != -1;
};

(function(){
	
	Array.prototype.binaryIndexOf = createSearch(false); // return: the index of the element, -1 if not found
	Array.prototype.binaryIndexFor = createSearch(true); // return: the index of the element, or the next left of its hypothetical position
	                                                     //         so that always arr[res]<=el && arr[res+1]>=el
	                                                     //         -1 when el<arr[0]  
	
	function createSearch(relativeMatch) {
		return function binaryIndexOf(comparefn, element) {
		/* get: (a compare function(a, b), an element to search for | a compare function(a) against the searched element)
				The compare function should return the same values as for a traditional sort(): <0 means a is smaller than b
				Note: The function might not return the index of the element, but of a element that equals it */
			if (arguments.length > 1)
				comparefn = (function(orig, args) {
					return function(a) {
						args[0] = a;
						return orig.apply(this, args);
					};
				})(comparefn, Array.prototype.slice.call(arguments, 0));
			
			var l = 0,
				r = this.length-1;
			
			while (l <= r) {
				var m = l + ((r - l) >> 1);
				var comp = comparefn(this[m]);
				if (comp < 0) // this[m] comes before the element
					l = m + 1;
				else if (comp > 0) // this[m] comes after the element
					r = m - 1;
				else // this[m] equals the element
					return m;
			}
			return l*relativeMatch-1;
		};
	}
})();

Array.prototype.insort = function insort(el, cmp) {
	var i = typeof cmp == "function"
	  ? this.binaryIndexFor(cmp, el)
	  : this.binaryIndexFor(function(a) {
       		return +(a>el) || -(a<el);
   		});
    this.splice(i+1, 0, el);
    return i+1;
};

Array.prototype.sliceRange = function(min, max) {
	// find a range in the array via binary sort and return it
    if (min > max) return this.sliceRange(max, min);
    var l = 0,
        r = this.length;
    // find an element at index m that is in range
    rough: {
        while (l < r) {
            var m = Math.floor(l + (r - l) / 2);
            if (this[m] < min)
                l = m + 1;
            else if (this[m] > max)
                r = m;
            else
                break rough;
        }
        // l == r: none was found
        return [];
    }
    var lr = m, // right boundary for left search
        rl = m; // left boundary for right search
    // get first position of items in range (l == lr)
    while (l < lr) {
        m = Math.floor(l + (lr - l) / 2);
        if (this[m] < min)
            l = m + 1;
        else
            lr = m;
    }
    // get last position of items in range (r == rl)
    while (rl < r) {
        m = Math.floor(rl + (r - rl) / 2);
        if (this[m] > max)
            r = m;
        else
            rl = m + 1;
    }
    // return the items in range
    return this.slice(l, r);
};

/* noch zu bearbeiten
Array.prototype.getHexRGB = function() {
	if (this.length != 3) return "";
	return "#"+(this[0]%256).hex().padleft(2,"0")+(this[1]%256).hex().padleft(2,"0")+(this[2]%256).hex().padleft(2,"0");
};
};*/
Array.prototype.trimleft = function() {
/*		removes any falsy values from the beginning
return: this */
	while(this.length && !this[0])
		this.shift();
	return this;
};
Array.prototype.trimright = function() {
/*		removes any falsy values from the end
return: this */
	while(this.length && !this[this.length-1])
		this.pop();
	return this;
};
Array.prototype.trim = function() {
/*		trims left and right
return: this */
	return this.trimleft().trimright();
};

Array.prototype.splitBy = function(n) {
/* get: number of items per array
return: array of n-sized arrays with the items (last array may contain less then n) */
	var r = [];
	for (var i=0; i<this.length; i+=n)
		r.push(this.slice(i, i+n));
	return r;
} 

Object.keys(Array.prototype).concat(
	["sort", "reverse"],
	["concat", "join", "slice"/*, "toString"*/, "indexOf", "lastIndexOf"],
	["filter", "forEach", "every", "map", "some", "reduce", "reduceRight"]
).forEach(function(method) {
	if (typeof Array.prototype[method] != "function") // last, first, whatever
		return;
	Array['get'+method.charAt(0).toUpperCase()+method.substr(1)] = Function.prototype.argwith.bind(Array.prototype[method]);
	Array[method] = Array.prototype[method].argcall();
});
/* Mootools: Native.genericize = function(object, property, check){
	if ((!check || !object[property]) && typeof object.prototype[property] == 'function') object[property] = function(){
		var args = Array.prototype.slice.call(arguments);
		return object.prototype[property].apply(args.shift(), args);
	};
};*/

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

Array.prototype.min = function min(){
	return Math.min.apply(null, this);
};

Array.prototype.max = function max(){
	return Math.max.apply(null, this);
};

Array.prototype.durchschnitt = Array.prototype.average = function average(){
	return this.length ? this.sum() / this.length : NaN;
};

Array.prototype.sum = function sum(){
	// return this.reduce(function(x, y){return x+y;}, 0);
	var result = 0, l = this.length;
	while (l--)
		result += this[l];
	return result;
};

Array.prototype.kumulierteQuadratischeAbweichung = function kqa(e) {
	if (typeof e != "number")
		e = this.durchschnitt();
	return this.reduce(function(x, y) {
		var d = y-e;
		return x+d*d;
	}, 0);
};
Array.prototype.mittlereQuadratischeAbweichung = Array.prototype.mse = function mse(e) {
	return this.length ? this.kumulierteQuadratischeAbweichung(e) : 0;
}
Number.prototype.mod = Number.prototype.modulo = function modulo(m) {
// returns this mod m: normalizes this to [0, m[
// JavaScripts % operator normalizes to ]-m, m[ !
	var n = this % m;
	return n < 0 ? n + m : n;
};

Number.prototype.normRad = function() {
// normalizes a float value to ]-p, p]
	return this != Math.pi ? (2 * this) % (2*Math.PI) / 2 : this;
	/* var r = this%(2*Math.PI);
	if (r>0) {
		if (r<=Math.PI) return r;
		return r-2*Math.PI;
	} else {
		if(r>= -1*Math.PI) return r;
		return r+2*Math.PI;
	} */
}
Number.prototype.posRad = Number.prototype.modulo.pcall(2*Math.PI);

Number.prototype.rad2deg = function() {
	return this/Math.PI*180;
}
Number.prototype.deg2rad = function() {
	return this*Math.PI/180;
}

Number.prototype.bin = function() {
	return this.toString(2);
}
Number.prototype.oct = function() {
	return this.toString(8);
}
Number.prototype.dec = function() {
	return this.toString(10);
}
Number.prototype.hex = function() {
	return this.toString(16).toUpperCase();
}

/* Lieber nicht :-)
(function(orig) {
	Number.prototype.toString = function toString(base) {
		if (typeof base != "number")
			throw new Error("Number converted to String without specific base!");
		return orig(base);
	};
})(Number.prototype.toString); */
﻿Math.trunc = function(num) {
    // binary ~~num only works up to 32-bit
	return Math[num < 0 ? "ceil" : "floor"](num);
};

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
};
Number.prototype.posRad = Number.prototype.modulo.pcall(2*Math.PI);

Number.prototype.rad2deg = function() {
	return this/Math.PI*180;
};
Number.prototype.deg2rad = function() {
	return this*Math.PI/180;
};

Number.prototype.bin = function(len) {
    var num = Math.trunc(this), // only works with Integer values
		len = Number(len) || 32,
		max = Math.pow(2, len-1);
	if (isNaN(num) || num >= max || num < -max)
		return "NaN";
    return num >= 0
        ? this
          .toString(2)
          .padleft(len, "0")
		: (-num-1) // for len < 32 we could use ~this
		  .toString(2)
		  .replace(/[01]/g, function(d){return +!+d;}) // hehe: inverts each char
		  .padleft(len, "1");
};
Number.prototype.oct = function() {
	return this.toString(8);
};
Number.prototype.dec = function() {
	return this.toString(10);
};
Number.prototype.hex = function() {
	return this.toString(16).toUpperCase();
};

/* Lieber nicht :-)
(function(orig) {
	Number.prototype.toString = function toString(base) {
		if (typeof base != "number")
			throw new Error("Number converted to String without specific base!");
		return orig(base);
	};
})(Number.prototype.toString); */
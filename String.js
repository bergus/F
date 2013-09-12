// Non-standards from Firefox
if (!String.prototype.quote) String.prototype.quote = function() {
	// return JSON.stringify(this).substr(1,-1);
	var s="";
	for (var i=0; i<this.length; i++) {
		var c = this.charCodeAt(i);
		if (c > 31 && c < 127) {
			if (c == 34 || c == 39 || c == 92)
				s += "\\"; /* for ", ' and \ */
			s += this.charAt(i);
		} else {
			s += "\\";
			if (c == 0)
				s += "0";
			else if (c == 8)
				s += "b";
			else if (c == 9)
				s += "t";
			else if (c == 10)
				s += "n";
			else if (c == 11)
				s += "v";
			else if (c == 12)
				s += "f";
			else if (c == 13)
				s += "r";
			else
				s += "u"+c.toString(16).padleft(4, "0");
		}
	}
	return s;
};
if (!String.prototype.trimRight) String.prototype.trimRight = function () {
/* Trims whitespace from the end of the string */
	return this.replace(/\s+$/,'');
};
if (!String.prototype.trimLeft) String.prototype.trimLeft = function () {
/* Trims whitespace from the beginning of the string */
	return this.replace(/^\s+/,'');
};


// Own implementations
String.prototype.hex = function hex() {
	return parseInt(this, 16);
};
String.prototype.dez = function dez() {
	alert("deprecated: String.dez!");
	throw new Error();
	return parseInt(this, 16);
};
String.prototype.padleft = function padleft(len, cha) {
	return (this.length<len)?((typeof cha=="string"?cha:" ")+this).padleft(len,cha):this.substr(0,len);
};
String.prototype.padright = function padright(len, cha) {
	return (this.length<len)?(this+(typeof cha=="string"?cha:" ")).padright(len,cha):this.substr(0,len);
};
String.prototype.repeat = function repeat(times) {
	for(var r = ""; --times >= 0; r+=this);
	return r;
};
String.prototype.indent = function indent(t, i) {
	t = t || "\t";
	if (typeof i == "number")
		t = (""+t).repeat(i);
	return t+this.split("\n").join("\n"+t);
};
String.prototype.splitreg = function splitreg(expr, times) {
	var erg =[], ze, i=0;
	if (typeof expr=='string') {
		expr = new RegExp("(.*?)("+expr+")","g");
		times = times || Number.POSITIVE_INFINITY;
	} else times = times || 1000;
	while((ze = expr.exec(this)) && i < times) {
		erg.push(ze[1]);
		erg.push(ze[2]);
		i++;
	}
	erg.input = this;
	return erg.trim();
};
String.prototype.reverse = function reverse() {
	return this.split("").reverse().join("");
};
String.prototype.splice = function splice(index, length, replace) {
	return this.substring(0, index) + Array.prototype.slice.call(arguments, 2).join("") + this.substring(index);
};
String.prototype.spn = function spn(s) {
/* Ermittelt die Länge der am Anfang übereinstimmenden Zeichen, PHP: strspn() */
	return this.match(new RegExp("^["+s+"]*"))[0].length;
};
String.prototype.endspn = function endspn(s, e) {
/* Ermittelt die Länge der am Ende übereinstimmenden Zeichen */
// return this.reverse().spn(s);
	return this.match(new RegExp("["+s+"]*$"))[0].length;
};
String.prototype.startsWith = String.prototype.beginsWith = function beginsWith(s) {
	return this.substring(0, s.length) === s;
};
String.prototype.endsWith = function endsWith(s) {
	return this.substr(-s.length) === s;
};
String.prototype.contains = function contains(s) {
	return this.indexOf(s) != -1;
};
String.prototype.replaceChars = function replaceChars(map) {
	var i, reg = "";
	for (i in map)
		reg += i;
	return this.replace(new RegExp("["+reg.replace(/(\]|-)/,"\\$1")+"]",'g'), function(char) { return map[char]; });
};
/* String.specialChars = {
	'\b': "\\b",
	'\t': "\\t",
	'\n': "\\n",
	'\f': "\\f",
	'\r': "\\r",
	'\\': "\\\\"
} */
String.prototype.ucFirst = function ucFirst() {
	return this.replace(/^./, function(x) { return x.toUpperCase(); });
};
String.prototype.rot13 = function rot13() {
	return this.replace(/[A-Za-z]/g, function(char) {
		var code=char.charCodeAt(0);
		if (code < 78) return String.fromCharCode(code + 13); //65-77: A-M
		if (code < 91) return String.fromCharCode(code - 13); //78-90: N-Z
		if (code < 110) return String.fromCharCode(code + 13); //97-109: a-m
		return String.fromCharCode(code - 13); //110-122: n-z
		// start + ( code - start + 13) % 26
	});
};
String.prototype.rescape = String.prototype.regExp = function regExp(save) {
	return this.replace(save
		? /([\\+*?\[^\]$(){}=!<>|:\-])/g // PHP: PRCE preg_quote  =!<> dürften in JS unerheblich sein, / wird von new RegExp() maskiert
		: /([{}()[\]\\.?*+^$|=!:~-])/g //-> {}()[\]\\.?*+^$|=!:~- // Bergi
		/*/([.*+?^=!:${}()|[\]\/\\])/g   -> {}()[\]\\.?*+^$|=!:\/ // Prototype 1.7
		  /([-.*+?^${}()|[\]\/\\])/g     -> {}()[\]\\.?*+^$|-     // MooTools
		  /([{}()|.?*+^$\[\]\\\/])/g     -> {}()[\]\\.?*+^$|\/    // Codeispoetry, Umherirrender
		  /([.?*+^$[\]\\(){}-])/g        -> {}()[\]\\.?*+^$-      // http://stackoverflow.com/questions/2593637/how-to-escape-regular-expression-in-javascript
		  /([\\{}()|.?*+\-^$\[\]])/g     -> {}()[\]\\.?*+^$|-     // /1.17wmf1/resources/mediawiki/mediawiki.js (kopiert von jQuery)
		  /([\/()[\]{}|*+-.,^$?\\])/g    -> {}()[\]\\.?*+^$|-,\/  // base2    
		*/
	, "\\$1");
};
String.prototype.mask = function mask(chars, maske) {
	return this.replace(new RegExp("(["+chars+"])","g"), (maske || "\\")+"$1"); //chars maskieren?
};
/* STRING-PART TEST *
var s = "abcd",
	m = [-5,-4,-3,-2,-1,0,1,2,3,4,5,undefined];
return Array.kartesischesProdukt(m, m).map(function(x) {
	return "("+(x[0]||"u")+","+(x[1]||"u")+"):  \t" +
		[s.substr, s.substring, s.slice].map(function(y) {
			return y.apply(s,x);
		}).join("\t");
}).join("\n");
*/
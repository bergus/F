"use strict";
(function(global) {
    var opcache = F.opcache = {};
    
    function F(op) {
        // create functions for operators | no eval magic!
        // with a Scala-like lamda expression syntax (but no access to local variables)
        // Examples: F("+") == F("_+_"), F("_?_:_").toString(), F("+")(1,2) == 3, F("-_")(5) == -5, F("_+1")(2) == 3
        // DO NOT use too extensively, functions are globally cached
        // DO NOT use for partial application, like var x=1; F("_+"+x)(2) == 3
        // @TODO: Currying
        if (op in opcache)
            return opcache[op];
        var i = 0,
            args = [],
            body = "return "+op.replace(/_/g, function() {
                return args[i] = String.fromCharCode(i+++97);
            });
        if (i == 0) { // assume binary operator
            args = ["a", "b"];
            body = "return a"+op+"b";
        }
        args.push(body);
        var fn = Function.apply(null, args);
        if (i == 0)
            opcache["_"+op+"_"] = fn;
        return opcache[op] = fn;
    }
    
    global.F = F;
})(this);
    
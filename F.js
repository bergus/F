"use strict";
(function(global) {
    var opcache = F.opcache = {};
    
    function F(op) {
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
    
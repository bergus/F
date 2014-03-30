/* Code examples of how to use Streams */

var a = new Clock(2000),
    b = sample(a, Math.random),
    c = ValueStream.for(function(){ return b+1; }); // yes, b instanceof ValueStream!

var a = new Clock(10000),
    b = sample(a, Math.random),
    c = b.switchValue(function(r) {
        var d = new Clock(1300),
            i = 0,
            e = sample(d, function(){ return r+ i++; });
        return e;
    });

var a = new Clock(2000),
    b = sample(a, Math.random),
    c = new Clock(3000),
    d = sample(c, Math.random),
    e = ValueStream.for(function(){return b+d}), // ValueStream.combine(b, d).map(function(x, y){return x+y})
    f = ValueStream.combine(b, d, e);


var mouse = getEventStream(document, "mousemove")
    position = mouse.get("clientX"),
    barleft = position.map(add(-50)),
    barright = position.map(add(50)),
    clipleft = barleft.map(Math.max.bind(null, -100)),
    clipright = barright.map(Math.min.bind(null, 100)),
    actuallength = compose(clipleft, clipright, function(l, r){ return r-l;});
    // expect actuallength to be updated only once per mouse event

var rStr = getRandomEventStream(),
    doubled = merge(rStr, rStr),
    num = doubled.count();
    // expect num to be always even

var mult = getMultiEventStream(), // where a couple of events are fired at the same time
    doubled = merge(mult, mult), // well, what's supposed to happen here?
    num = doubled.count(), // must be even and might update only a single time
    counts = mult.tag(num) // but not if we rip an event of it every time `mult` fires
    // Also: (how) Can we get mult events back from doubled?
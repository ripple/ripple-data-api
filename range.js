/**
 * Represents a set of integers.
 */
var Range = function () {
  this.value	= [];
};

Range.from_element = function (e) {
  var range	= new Range();

  range.value	= [e];

  return range;
};

Range.from_string = function (str) {
  var range	= new Range();

  range.value	=
    '' === str
      ? []
      : str
        .split(",")
        .map(function (str_interval) {
          var interval  = str_interval.split("-");

          return 1 === interval.length ? Number(interval) : interval.map(Number);
        })
        .sort(function (a, b) {
            return ('object' === typeof b ? b[0] : b) - ('object' === typeof a ? a[0] : a);
          });

//  console.log("RANGE: %s --> %s", JSON.stringify(str), JSON.stringify(range.value));

  return range;
};

Range.segment_head = function (s) {
  if ('object' === typeof s) {
    return s[0]; 
  }
  else
  {
    return s;  
  }
};

Range.segment_tail = function (s) {
  if ('object' === typeof s) {
//console.log("tail: %s | %s", s, JSON.stringify(s[1]));
    return s[1]; 
  }
  else
  {
//console.log("tail: %s | %s", s, JSON.stringify(s));
    return s;  
  }
};

// Return the first value in an array or null.
Range.prototype.first = function () {
  return this.value.length ? Range.segment_head(this.value[0]) : null ;
};

// Return the last value in an array or null.
Range.prototype.last = function () {
  return this.value.length ? Range.segment_tail(this.value[this.value.length-1]) : null ;
};

// Insert an element.
Range.prototype.insert = function (e) {
  return this.union(Range.from_element(e));
};

Range.prototype.is_empty = function () {
  return !this.value.length;
};

Range.prototype.is_member = function (n) {
  return !this.value.every(function (r) {
      // Return true if n is not r.
      return 'number' === typeof r
        ? n !== r
        : (n < r[0] || n > r[1]);
    });
};

var segment_merge = function (a, b) {
  if ('number' === typeof a && 'number' === typeof b) {
    if (b < a) {
      return segment_merge(b, a);
    }
    else if (a === b) {
      return a;
    }
    else if (a+1 === b) {
      return [[a, b]];
    }
    else
    {
      return [[a], [b]];
    }
  }
  else if ('number' === typeof b) {
    return segment_merge(b, a);
  }
  else if ('number' === typeof a) {
    if (a < b[0]) {
      return a+1 === b[0] ? [[a, b[1]]] : [a, b];
    }
    else if (a > b[1]) {
      return a-1 === b[1] ? [[b[0], a]] : [b, a];
    }
    else
    {
      return b;
    }
  }
  else if (a[1] < b[0]) {
    return a[1]+1 === b[0] ? [[a[0], b[1]]] : [a, b];
  }
  else if (a[0] > b[1]) {
    return a[0]-1 === b[1] ? [[b[0], a[1]]] : [b, a];
  }
  else {
    return [[min(a[0], b[0]), max(a[1], b[1])]];
  }
};

Range.prototype.to_string = function () {
  var r = "";

  if (!this.is_empty()) {
    r = this.value.map(function (s) {
        if ('number' === typeof s) {
          return s; 
        }
        else {
          return s[0] + (s[0]+1 === s[1] ? "," : "-") + s[1];
        }
      }).join(",");
  }

  return r;
};

Range.prototype.union = function (r) {
  if (r.is_empty())
    return this;

  if (this.is_empty())
    return r;

  var i = 0;
  var j = 0;

  var o = new Range;

  while (i !== this.value.length || j !== r.value.length) {
    var   m;

    if (i === this.value.length) {
      m = r.value[j++];
    }
    else if (j === this.value.length) {
      m = this.value[i++];
    }
    else if (Range.segment_head(this.value[i]) <= Range.segment_head(r.value[j])) {
      m = this.value[i++];

    } else {
      m = r.value[j++];
    }

    if (o.value.length) {
      var e = o.value.pop();

      o.value = o.value.concat(segment_merge(e, m));
    }
    else
    {
      o.value = [m];
    }
  }

//  console.log("union: '%s' '%s' > '%s'", this.to_string(), r.to_string(), o.to_string());

  return o;
};

exports.Range = Range;

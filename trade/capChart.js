var CapitalizationChart = function (options) {
  
  //load historical from API                   
  this.load = function (d) {
    //self.fadeOut();

    if (self.request) self.request.abort();
    self.request = d3.xhr(options.url);

    self.request.header("Content-type","application/x-www-form-urlencoded");
    self.request.post(params({
      gateway       : "Bitstamp",
      startTime     : new Date,
      endTime       : d.offset(new Date),
      timeIncrement : d.interval,
      descending    : true,

    }), function(error, xhr) {
      data = JSON.parse(xhr.response);
      if (data.length<2) self.lineData = [];
      else {
        data.splice(0,1); //remove first    
        console.log(data);
      }
    });
  }
}


function params(o) {
  var s = [];
  for (var key in o) {
    s.push(key + "=" + encodeURIComponent(o[key]));
  }

    return s.join("&");
}
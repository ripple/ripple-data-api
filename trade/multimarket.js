var MiniChart = function(base, trade, div) {
  var self      = this;
  self.base     = base;
  self.trade    = trade;
  self.lineData = [];
  
  var xScale    = d3.time.scale(),
    priceScale  = d3.scale.linear(),
    volumeScale = d3.scale.linear(),
    xAxis       = d3.svg.axis().scale(xScale).ticks(5),
    priceAxis   = d3.svg.axis().scale(priceScale).orient("right");  
  
  var margin = {top: 0, right: 40, bottom: 20, left: 0},
    height   = 200,
    width    = 280;
    
  var details  = div.append("table").attr("class", "chartDetails").append("tr");
  var range    = details.append("td").attr("class","range");
  var showHigh = details.select(".range").append("div").attr("class","high");
  var showLow  = details.select(".range").append("div").attr("class","low");
  var change   = details.append("td").attr("class","change"); 
  var volume   = details.append("td").attr("class","volume"); 
              
  var svg      = div.selectAll("svg").data([0])
  var svgEnter = svg.enter().append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);     
    

  var gEnter = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  //gEnter.append("rect").attr("class", "background").attr("width", width).attr("height", height);
  
  var pointer = gEnter.append("path")
    .attr("class","pointer")
    .attr("d", "M 0 0 L 7 -7 L 40 -7 L 40 7 L 7 7 L 0 0")
    .attr("transform","translate("+(width+margin.left)+","+(height+margin.top)+")");
      
  gEnter.append("g").attr("class","grid");
  gEnter.append("path").attr("class", "line");
  gEnter.append("rect").attr("width", width+margin.left+margin.right)
    .attr("class","timeBackground")
    .attr("height", margin.bottom)
    .attr("transform", "translate(0,"+(height+margin.top)+")"); 
  gEnter.append("g").attr("class", "x axis");  
  gEnter.append("g").attr("class", "price axis").attr("transform", "translate("+width+", 0)")

  var status     = div.append("h4").attr("class", "status");  
  var horizontal = gEnter.append("line")
    .attr("class", "horizontal")
    .attr({x1:0,x2:width})
    .attr("transform","translate(0,"+height+")"); 
  var lastPrice = gEnter.append("text")
    .attr("class","lastPrice")
    .style("text-anchor","middle")
    .attr("x", (width+margin.left)/2);
    
  var loader = div.append("img")
    .attr("class", "loader")
    .attr("src", "images/throbber5.gif")
    .style("opacity", 0); 

  var dropdownA = ripple.currencyDropdown().selected(base)
    .on("change", function(d) {
      });
         
  var dropdownB = ripple.currencyDropdown().selected(trade)
    .on("change", function(d) {
    });
    
  var dropdowns = div.append("div").attr("class", "dropdowns");
  dropdowns.append("div").attr("class","base").call(dropdownA);
  dropdowns.append("div").attr("class","trade").call(dropdownB);
                 
  this.load  = function () {
    loader.transition().style("opacity",1);
    if (self.request) self.request.abort();
    self.request = d3.xhr(self.markets.url);

    self.request.header("Content-type","application/x-www-form-urlencoded");
    self.request.post(params({
      startTime     : new Date,
      endTime       : d3.time.day.offset(new Date, -2),
      timeIncrement : "hour",
      descending    : true,
      "trade[currency]" : self.trade.currency,
      "trade[issuer]"   : self.trade.issuer ? self.trade.issuer : "",
      "base[currency]"  : self.base.currency,
      "base[issuer]"    : self.base.issuer  ? self.base.issuer : "",

    }), function(error, xhr) {
      data = JSON.parse(xhr.response);
      if (data.length<2) chart.lineData = [];
      else {
        data.splice(0,1); //remove first    
        
        self.lineData = data.map(function(d) {

          return {
            time   : moment.utc(d[0]),
            open   : d[4],
            close  : d[5],
            high   : d[6],
            low    : d[7],
            vwap   : d[8],
            volume : d[1],
          };
        });
      }

      self.draw();
    });
  }  
  function amountToHuman (d, opts) {
    if (!opts) opts = {
          precision      : 5,
          min_precision  : 2,
          max_sig_digits : 7,
      }
    return ripple.Amount.from_human(d).to_human(opts);     
  }
  
  this.draw = function () {
    loader.transition().style("opacity",0);
    var area = d3.svg.area()
        .x(function(d) { return xScale(d.time); })
        .y0(height)
        .y1(function(d) { return priceScale(d.close); }),  

      line = d3.svg.line()
        .x(function(d) { return xScale(d.time); })
        .y(function(d) { return priceScale(d.close); }),
      
      open = self.lineData[0].close,
      high = amountToHuman(d3.max(self.lineData, function (d){return d.high})),  
      low  = amountToHuman(d3.min(self.lineData, function (d){return d.low})),
      last = amountToHuman(self.lineData[self.lineData.length-1].close),
      vol  = amountToHuman(d3.sum(self.lineData, function (d){return d.volume}), {min_precision:0, max_sig_digits:7}),
      pct  = (((last-open)/open)*100).toFixed(2),     
      pathStyle, horizontalStyle, pointerStyle, changeStyle; 
      
      
    if (Math.abs(pct)<.5) { //unchanged (less than .5%)
      pathStyle = {fill:"rgba(150,150,150,.5)",stroke:"#aaa"}; 
      horizontalStyle = {stroke:"#777"};
      pointerStyle = {fill:"#999"};
      changeStyle  = {color:"#666"};
    } else if (last < open) {  //down
      pathStyle = {fill:"rgba(250,100,100,.6)",stroke:"#b66"};
      horizontalStyle = {stroke:"#d22"};
      pointerStyle = {fill:"#c33"};
      changeStyle  = {color:"#c33"};
    } else { //up
      pathStyle = {fill:"rgba(140,200,120,.5)",stroke:"#7a5"}; 
      horizontalStyle = {stroke:"#0a0"};
      pointerStyle = {fill:"#2a2"};
      changeStyle  = {color:"#2a2"};
    }
    
    //console.log(open, high, low, last);          
    
    svg.datum(self.lineData).transition().style("opacity",1);
    
    // Update the x-scale.
    xScale
      .domain(d3.extent(self.lineData, function(d) { return d.time; }))
      .range([0, width]);
    

    // Update the y-scale.
    priceScale
      .domain([
        d3.min(self.lineData, function(d) { return d.close; })*.975,
        d3.max(self.lineData, function(d) { return d.close; })*1.025])
      .range([height, 0]).nice();  

   gEnter.select(".grid")         
        .call(d3.svg.axis()
        .scale(priceScale)
        .orient("right")
        .ticks(5)
            .tickSize(width, 0, 0)
            .tickFormat("")
      );
            
    //add the price line
    gEnter.select(".line").datum(self.lineData)
      .transition()
      .duration(600)
      .attr("d", area)
      .style(pathStyle);  
    
    // Update the x-axis.
    gEnter.select(".x.axis").call(xAxis)
      .attr("transform", "translate(0," + priceScale.range()[0] + ")");

    // Update the y-axis.
    gEnter.select(".price.axis").call(priceAxis)
      .attr("transform", "translate(" + xScale.range()[1] + ", 0)");
    showHigh.html("<label>high</label> "+high);
    showLow.html("<label>low</label> "+low);
    change.html((pct>0 ? "+":"")+pct+"%").style(changeStyle);

    volume.html("<label>Vol:</label>"+vol+"<small>"+self.base.currency+"</small>");
    horizontal.transition().duration(600).attr("transform","translate(0, "+priceScale(last)+")").style(horizontalStyle);
    pointer.transition().duration(600).attr("transform","translate("+(width+margin.left)+", "+priceScale(last)+")").style(pointerStyle);
    lastPrice.transition().duration(600).attr("transform","translate(0, "+(priceScale(last)-5)+")").text(last);
  
/*    
    // horizontal lines
svg.selectAll(".hline").data(self.lineData).enter()
    .append("line")
    .attr("y1", function (d) {
      console.log(d);
    return d.close * 26 + 6;
})
    .attr("y2", function (d) {
    return d.close * 26 + 6;
})
    .attr("x1", 0)
    .attr("x2", width)
    .style("stroke", "#eee")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
*/ 
  }
}

var MultiMarket = function (options) {
  var self = this;
  
  self.charts = [];  
  self.url    = options.url;
  self.el     = d3.select("#"+options.id).attr("class","multiMarket");
  
  this.addChart = function (base, trade) {
    var div       = self.el.append("div").attr("class","chart");
    var chart     = new MiniChart(base, trade, div);
    chart.markets = self;
    chart.index   = self.charts.push(chart)-1;
    chart.base    = base;
    chart.trade   = trade;
    chart.load();
    
  }
  
  this.removeChart = function (index) {
    
  }
}

function params(o) {
  var s = [];
  for (var key in o) {
    s.push(key + "=" + encodeURIComponent(o[key]));
  }

    return s.join("&");
}

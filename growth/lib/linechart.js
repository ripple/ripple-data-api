var LineChart = {};

LineChart = function (options){
  var lineData = [];
  var self     = this;

  if (options.title)   d3.select("body").append("h3").html(options.title);
  if (!options.margin) options.margin = {top: 20, right: 50, bottom: 50, left: 50};
  if (!options.height) options.height = 430;
  if (!options.width)  options.width  = 860;

  var div      = d3.select("body").append("div").attr("class","lineChart");
  var svg      = div.selectAll("svg").data([0]); 	
  var svgEnter = svg.enter().append("svg")
    .attr("width", options.width + options.margin.left + options.margin.right)
    .attr("height", options.height + options.margin.top + options.margin.bottom);

  //var status = svg.append("text").attr("class", "status").attr({y:"1em", x:options.margin.left ,fill:"#999"});
  var status  = div.append("h4")
    .attr("class", "status")
    .style("opacity", 0);

  var details = div.append("div")   
    .attr("class", "details")               
    .style("opacity", 0);

  var borderPath = svg.append("rect")
    .attr("x", options.margin.left)
    .attr("y", options.margin.top)
    .attr("height", options.height)
    .attr("width", options.width)
    .style("stroke", "#999")
    .style("fill", "none")
    .style("stroke-width", 1); 

  var hover = svg.append("line")
    .attr("class", "hover")
    .attr("y1", options.margin.top)
    .attr("y2", options.height+options.margin.top)
    .style("opacity", 0);	 

  var horizontal = svg.append("line")
    .attr("class", "hover")
    .style("opacity", 0);  	

  var loader = div.append("img")
    .attr("class", "loader")
    .attr("src", "images/throbber5.gif")
    .style("opacity", 0);	

  this.fadeOut = function () {
    svg.transition().duration(100).style("opacity", 0);
    svg.on("mousemove.hover", "");
    details.style("opacity", 0);
    status.style("opacity", 0);
    div.selectAll(".hover").style("opacity", 0);
    div.selectAll(".details").style("opacity",0);	
    loader.style("opacity",1);	
  }


  this.redraw = function (increment, lineData) {
    if (!lineData.length) {
      loader.style("opacity",0);
      status.html("No Data for this Period").style("opacity",1);
      return;	
    }

    self.lineData = lineData;

    var x    = d3.time.scale().range([0, options.width]).domain(d3.extent(self.lineData, function(d) { return d.x; })),
      y      = d3.scale.linear().range([options.height, 0]).domain(d3.extent(self.lineData, function(d) { return d.y; })).nice(),
      y2     = d3.scale.pow().exponent(0.4).range([options.height, 0]).domain(d3.extent(self.lineData, function(d) { return d.y2; })).nice(),
      xAxis  = d3.svg.axis().scale(x),
      yAxis  = d3.svg.axis().scale(y),
      y2Axis = d3.svg.axis().scale(y2), 
          
      line   = d3.svg.line()
        .x(function(d) { return x(d.x); })
        .y(function(d) { return y(d.y); });
      line2  = d3.svg.line()
        .x(function(d) { return x(d.x); })
        .y(function(d) { return y2(d.y2); }); 

    var gEnter = svgEnter.append("g")
      .attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");
    
    gEnter.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + y.range()[0] + ")")
    gEnter.append("g")
      .attr("class", "y axis left")
      .append("text")
      .text(options.leftTitle ? options.leftTitle : "")
      .attr("class", "title")
      .attr("transform", "rotate(-90)")
      .attr("y",15).attr("x",-110);
    gEnter.append("g")
      .attr("class", "y axis right")
      .attr("transform", "translate(" + x.range()[1] + ")")
      .append("text")
      .text(options.rightTitle ? options.rightTitle : "")
      .attr("class", "title")
      .attr("transform", "rotate(-90)")
      .attr("y",-5).attr("x",-45); 
      
    gEnter.append("path").attr("class", "line2");
    gEnter.append("path").attr("class", "line");  
    
    var g = svg.select("g");

    g.select(".line").datum(self.lineData).attr("d", line);
    g.select(".line2").datum(self.lineData).attr("d", line2);
    g.select(".x.axis").call(xAxis).attr({"fill":"#aaa"});
    g.select(".y.axis.left").call(y2Axis.orient("left")).attr({"fill":"#999"});
    g.select(".y.axis.right").call(yAxis.orient("right")).attr({"fill":"#999"});

    svg.select(".focus").remove();
    var focus = svg.append("g")
      .attr("class", "focus")
      .style("opacity", 0);	

    focus.append("circle").attr("r", 4.5);	

    svg.transition().duration(300).style("opacity", 1);
    loader.transition().duration(300).style("opacity", 0);

    function mousemove(e) {
      var tx = Math.max(options.margin.left, Math.min(options.width+options.margin.left, d3.mouse(this)[0])),
        i    = d3.bisect(self.lineData.map(function(d) { return d.x; }), x.invert(tx-options.margin.left));
        d    = self.lineData[i-1];

      //console.log(i);
      //console.log(x.invert(tx-options.margin.left));
      //console.log(d);

      var details = div.select('.details');
         mouseX = d3.mouse(this)[0];
      if (mouseX<0 || mouseX>options.width+options.margin.left+options.margin.right) {
        hover.style("opacity", 0);
        focus.style("opacity", 0);
        horizontal.style("opacity", 0);
        details.style("opacity", 0);

      } else {
        hover.style("opacity", 1);
        focus.style("opacity", 1);
        horizontal.style("opacity", 1);
      }

      if (d) {
        tx = x(d.x)+options.margin.left;
        ty = y(d.y)+options.margin.top;

        details.html(options.tooltip(d, increment))
          .style("left", (tx-100) + "px")     
          .style("top", (ty-100) + "px") 
          .style("opacity",1);

        hover.attr("transform", "translate(" + tx + ")");
        focus.attr("transform", "translate(" + tx + "," + ty + ")");
        horizontal.attr("x1", tx);
        horizontal.attr("x2", options.width+options.margin.left);
        horizontal.attr("y1", ty);
        horizontal.attr("y2", ty);
      }
    }

    svg.on("mousemove.hover", mousemove);
  }
};
var ripplecharts = {};

ripplecharts.candlestick = function() {
  var margin = {top: 20, right: 50, bottom: 20, left: 50},
      width = 760,
      height = 200,
      candleWidth = 10,
      xScale = d3.time.scale.utc(),
      yScale = d3.scale.linear(),
      volumeScale = d3.scale.linear(),
      xAxis = d3.svg.axis().scale(xScale),
      leftAxis = d3.svg.axis().scale(volumeScale).orient("left").tickFormat(d3.format("s")),
      yAxis = d3.svg.axis().scale(yScale).orient("left"),
      format = String;

  function candlestick(selection) {
    selection.each(function(data) {

      // Select the svg element, if it exists.
      var svg = d3.select(this).selectAll("svg").data([data]);

      // Otherwise, create the skeletal chart.
      var svgEnter = svg.enter().append("svg");
      svgEnter.append("defs").append("clipPath").attr("id", "clip").append("rect");
      var gEnter = svgEnter.append("g");
      gEnter.append("rect").attr("class", "background");
      gEnter.append("g").attr("class", "volume");
      gEnter.append("g").attr("class", "candlesticks").attr("clip-path", "url(#clip)");
      gEnter.append("g").attr("class", "x axis");
      //gEnter.append("g").attr("class", "left axis").append("text").attr("class", "title").attr("transform", "rotate(-90)").attr("dy", ".51em").attr("y", 6).text("Volume");
      gEnter.append("g").attr("class", "y axis").append("text").attr("class", "title").attr("transform", "rotate(-90)").attr("dy", ".51em").attr("y", 6).text("Price");
      gEnter.append("line").attr("class", "hover");
      gEnter.append("text").attr("class", "status").attr("y", -9);

      // Update the outer dimensions.
      svg .attr("width", width)
          .attr("height", height)
          .on("mousemove.candlestick", mousemove);

      // Update the inner dimensions.
      var g = svg.select("g")
          .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      svg.select("rect")
          .attr("width", width - margin.left - margin.right)
          .attr("height", height - margin.top - margin.bottom);

      g.select(".background")
          .attr("width", width - margin.left - margin.right)
          .attr("height", height - margin.top - margin.bottom);

      var status = d3.select(".status");

      var hover = g.select(".hover")
          .attr("y2", height);

      var line = g.select(".volume").selectAll(".line").data(function(d) { return [d]; });
      line.enter().append("path").attr("class", "line");

      // Update the candlesticks.
      var candle = g.select(".candlesticks").selectAll("g").data(function(d) { return d; }, function(d) { return d.x; });
      var candleEnter = candle.enter().append("g")
          .attr("transform", function(d) { return "translate(" + xScale(d.x) + ")"; });
      candleEnter.append("line")
          .attr("y1", function(d) { return yScale(.5 * (d.low + d.high)); })
          .attr("y2", function(d) { return yScale(.5 * (d.low + d.high)); })
      candleEnter.append("rect")
          .attr("x", -candleWidth / 2)
          .attr("y", function(d) { return yScale(.5 * (d.open + d.close)); })
          .attr("height", function(d) { return Math.abs(yScale(d.open) - yScale(d.close)); })
          .attr("width", candleWidth);

      // Update the x-scale.
      xScale
          .domain(d3.extent(data, function(d) { return d.x; }))
          .range([0, width - margin.left - margin.right]);

      // Update the volume scale.
      volumeScale
          .domain(d3.extent(data, function(d) { return d.volume; }))
          .range([height - margin.top - margin.bottom, 0]);

      // Update the y-scale.
      yScale
          .domain([
            d3.min(data, function(d) { return Math.min(d.open, d.close, d.high, d.low); }),
            d3.max(data, function(d) { return Math.max(d.open, d.close, d.high, d.low); })
          ])
          .range([height - margin.top - margin.bottom, 0]);

      var candleUpdate = d3.transition(candle.classed("up", function(d) { return d.open <= d.close; }))
          .attr("transform", function(d) { return "translate(" + xScale(d.x) + ")"; });
      candleUpdate.select("line")
          .attr("y1", function(d) { return yScale(d.low); })
          .attr("y2", function(d) { return yScale(d.high); });
      candleUpdate.select("rect")
          .attr("x", -candleWidth / 2)
          .attr("width", candleWidth)
          .attr("y", function(d) { return yScale(Math.max(d.open, d.close)); })
          .attr("height", function(d) { return Math.abs(yScale(d.open) - yScale(d.close)); });
      d3.transition(candle.exit())
          .attr("transform", function(d) { return "translate(" + xScale(d.x) + ")"; })
          .style("opacity", 1e-6).remove();

      //line.attr("d", d3.svg.line().x(function(d) { return xScale(d.x); }).y(function(d) { return volumeScale(d.volume); }));

      // Update the x-axis.
      g.select(".x.axis")
          .attr("transform", "translate(0," + yScale.range()[0] + ")")
          .call(xAxis);

      // Update the left axis.
      g.select(".left.axis")
          //.call(leftAxis);

      // Update the y-axis.
      g.select(".y.axis")
          .call(yAxis);

      function mousemove() {
        var tx = Math.max(0, Math.min(width - margin.left - margin.right, d3.mouse(g.node())[0])),
            x = (xScale.invert(tx) - data[0].x) / 864e5 | 0,
            d = data[x];
        hover.attr("transform", "translate(" + xScale(d.x) + ")");
        status.text(d.x + " Open: " + format(d.open) + " Close: " + format(d.close) + " High: " + format(d.high) + " Low: " + format(d.low));
      }
    });
  }

  chart.margin = function(_) {
    return arguments.length ? (margin = _, chart) : margin;
  };

  chart.width = function(_) {
    return arguments.length ? (width = +_, chart) : width;
  };

  chart.height = function(_) {
    return arguments.length ? (height = +_, chart) : height;
  };

  return candlestick;
};

var RippleCharts = {};

RippleCharts.line = function (options){
	
	this.options  = options;
	var lineData = [];
	var self     = this;
	  		
	if (options.title)   d3.select("body").append("h3").html(options.title);
	if (!options.margin) options.margin = {top: 10, right: 50, bottom: 50, left: 0};
	if (!options.height) options.height = 500;
	if (!options.width)  options.width  = 1000;
	
	var div = d3.select(options.id);
	
	var details = div.append("div")   
		.attr("class", "chartDetails")               
		.style("opacity", 0);
		
	var svg      = div.selectAll("svg").data([0]); 	
	var svgEnter = svg.enter().append("svg")
		.attr("width", options.width + options.margin.left + options.margin.right)
	  	.attr("height", options.height + options.margin.top + options.margin.bottom);

	var borderPath = svg.append("rect")
		.attr("x", options.margin.left)
	  	.attr("y", options.margin.top)
	  	.attr("height", options.height)
	  	.attr("width", options.width)
	  	.style("stroke", "#999")
	  	.style("fill", "none")
	  	.style("stroke-width", 1); 
	  		  	
	 //var status = svg.append("text").attr("class", "status").attr({y:"1em", x:options.margin.left ,fill:"#999"});
	var status  = div.append("h4")
		.attr("class", "status")
		.style("opacity", 0);
	
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
		loader.style("opacity",1);	
	}
	
	
	this.update = function (base, trade, d) {
		self.fadeOut();
		
		self.base  = base;
		self.trade = trade;
		
		var end    = new Date;
	 	var start  = d.offset(end);
	 	
	 	if (self.request) self.request.abort();
	 	self.request = d3.xhr(options.url);
	 	
	  	self.request.header("Content-type","application/x-www-form-urlencoded");
	  	self.request.post(params({
	  		startTime     : start,
	  		endTime       : end,
	  		timeIncrement : d.interval,
	  		descending    : true,
	  		"trade[currency]" : trade.currency,
	  		"trade[issuer]"   : trade.issuer ? trade.issuer : "",
	  		"base[currency]"  : base.currency,
	  		"base[issuer]"	  : base.issuer  ? base.issuer : "",
	
	  	}), function(error, xhr) {
	  		candles = JSON.parse(xhr.response);
	  		if (candles.length<2) lineData = [];
	  		else {
		  		candles.splice(0,1);		
				lineData = candles.map(function(d) {
		      		return {
				        time   : new Date(d[0]),
			        	open   : d[4],
			        	close  : d[5],
			        	high   : d[6],
			        	low    : d[7],
			        	vwap   : d[8],
			        	volume : d[2],
					};	    		
			    });   			
	  		}
	
			self.redraw(d.interval, lineData);   
	  	});
	}
	
	this.redraw = function (increment, lineData) {
		if (!lineData.length) {
			loader.style("opacity",0);
			status.html("No Data for this Period").style("opacity",1);
			return;	
		}
		
		self.lineData = lineData;
		
	  	var x     = d3.time.scale().range([0, options.width]).domain(d3.extent(self.lineData, function(d) { return d.time; })),
	    	y     = d3.scale.linear().range([options.height, 0]).domain(d3.extent(self.lineData, function(d) { return d.close; })).nice(),
	      	xAxis = d3.svg.axis().scale(x),
	      	yAxis = d3.svg.axis().scale(y),
	      	line  = d3.svg.line()
	        	.x(function(d) { return x(d.time); })
	        	.y(function(d) { return y(d.close); });
	    	        	
	  	var gEnter = svgEnter.append("g")
	      	.attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");
	      	
	  	gEnter.append("path").attr("class", "line");
	  	gEnter.append("g")
	      	.attr("class", "x axis")
	      	.attr("transform", "translate(0," + y.range()[0] + ")")
	  	gEnter.append("g")
	    	.attr("class", "y axis right")
	      	.attr("transform", "translate(" + x.range()[1] + ")");
	  	var g = svg.select("g");
	  	
	  	g.select(".line").datum(self.lineData).attr("d", line);
	  	g.select(".x.axis").call(xAxis).attr({"fill":"#aaa"});
	  	g.select(".y.axis.right").call(yAxis.orient("right")).attr({"fill":"#999"});
	  	
	  	svg.select(".focus").remove();
	   	var focus = svg.append("g")
	 		.attr("class", "focus")
	 		.style("opacity", 0);	
	      
	    focus.append("circle").attr("r", 4.5);	
	
	  	svg.transition().duration(300).style("opacity", 1);
		loader.transition().duration(300).style("opacity", 0);
		
		function mousemove() {
			var tx = Math.max(options.margin.left, Math.min(options.width+options.margin.left, d3.mouse(this)[0])),
				i  = d3.bisect(self.lineData.map(function(d) { return d.time; }), x.invert(tx-options.margin.left));
		    	d  = self.lineData[i-1];
		    
		    //console.log(i);
			//console.log(x.invert(tx-options.margin.left));
			//console.log(d);
			
			var details = div.select('.chartDetails');
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
		 		tx = x(d.time)+options.margin.left;
		 		ty = y(d.close)+options.margin.top;
				
		  		details.html("<span class='date'>"+ parseDate(d, increment) + 
					"</span><span>O:<b>" + d.open.toFixed(4)  + "</b></span>" +
					"<span class='high'>H:<b>" + d.high.toFixed(4) + "</b></span>" +
					"<span class='low'>L:<b>" + d.low.toFixed(4) + "</b></span>" +
					"<span>C:<b>" + d.close.toFixed(4)  + "</b></span>" +
					"<span class='volume'>Volume:<b>" + d.volume.toFixed(4) + " " + self.trade.currency + "</b></span>")
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

RippleCharts.candlestick = function (options) {

  var self = this,
      candleWidth = 10,
      xScale      = d3.time.scale.utc(),
      yScale      = d3.scale.linear(),
      volumeScale = d3.scale.linear(),
      xAxis       = d3.svg.axis().scale(xScale),
      leftAxis    = d3.svg.axis().scale(volumeScale).orient("left").tickFormat(d3.format("s")),
      yAxis       = d3.svg.axis().scale(yScale).orient("right"),
      format      = String;

	if (!options.margin) options.margin = {top: 10, right: 50, bottom: 50, left: 50};
	if (!options.height) options.height = 500;
	if (!options.width)  options.width  = 950;
	
	var div = d3.select(options.id);

	var svg = div.selectAll("svg").data([0])
	var svgEnter = svg.enter().append("svg")
		.attr("width", options.width + options.margin.left + options.margin.right)
	  	.attr("height", options.height + options.margin.top + options.margin.bottom);     
	
	var details = div.append("div")   
		.attr("class", "chartDetails")               
		.style("opacity", 0);      

	var loader = div.append("img")
		.attr("class", "loader")
		.attr("src", "images/throbber5.gif")
		.style("opacity", 0);	


      svg.append("defs").append("clipPath").attr("id", "clip").append("rect");
      
      var gEnter = svg.append("g");
      gEnter.append("rect").attr("class", "background");
      gEnter.append("g").attr("class", "volume");
      gEnter.append("g").attr("class", "candlesticks").attr("clip-path", "url(#clip)");
      gEnter.append("g").attr("class", "x axis");
      gEnter.append("g").attr("class", "left axis").append("text").attr("class", "title").attr("transform", "rotate(-90)").attr("dy", "10px").attr("y", 6).text("Volume");
      gEnter.append("g").attr("class", "y axis").append("text").attr("class", "title").attr("transform", "rotate(-90)").attr("dy", "10px").attr("y", 950).text("Price");
      gEnter.append("line").attr("class", "hover");
      gEnter.append("text").attr("class", "status").attr("y", -9);
      
	this.fadeOut = function () {
		div.selectAll("svg").transition().duration(100).style("opacity", 0);
		//svg.on("mousemove.hover", "");
		details.style("opacity", 0);
		//status.style("opacity", 0);
		div.selectAll(".hover").style("opacity", 0);	
		loader.style("opacity",1);	
	}
		
	this.update = function (base, trade, d) {
		self.fadeOut();
		
		self.base  = base;
		self.trade = trade;
		
		var end     = new Date;
	 	var start   = d.offset(end);
	 	
	 	if (self.request) self.request.abort();
	 	self.request = d3.xhr(options.url);
	 	
	  	self.request.header("Content-type","application/x-www-form-urlencoded");
	  	self.request.post(params({
	  		startTime     : start,
	  		endTime       : end,
	  		timeIncrement : d.interval,
	  		descending    : true,
	  		"trade[currency]" : trade.currency,
	  		"trade[issuer]"   : trade.issuer ? trade.issuer : "",
	  		"base[currency]"  : base.currency,
	  		"base[issuer]"	  : base.issuer  ? base.issuer : "",
	
	  	}), function(error, xhr) {
	  		candles = JSON.parse(xhr.response);
	  		if (candles.length<2) lineData = [];
	  		else {
		  		candles.splice(0,1);		
				lineData = candles.map(function(d) {
		      		return {
				        time   : new Date(d[0]),
			        	open   : d[4],
			        	close  : d[5],
			        	high   : d[6],
			        	low    : d[7],
			        	vwap   : d[8],
			        	volume : d[2],
					};	    		
			    });   			
	  		}
	
			self.redraw(d.interval, lineData);   
	  	});
	}
	
	this.redraw = function (increment, lineData) {
		//div.datum(lineData);
		candleWidth = options.width/lineData.length;
		if (candleWidth<5) candleWidth = 5; 
	
	      // Update the outer dimensions.
	      svg.datum(lineData)
	      	.on("mousemove.candlestick", mousemove);
	
	      // Update the inner dimensions.
	      var g = svg.select("g")
	          .attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");
	
	      svg.select("rect")
	          .attr("width", options.width)
	          .attr("height", options.height);
	
	      g.select(".background")
	          .attr("width", options.width)
	          .attr("height", options.height);
	
	      var status = div.select(".status");
	
	      var hover = g.select(".hover")
	          .attr("y2", options.height);
	
	      var line = g.select(".volume").selectAll(".line").data(function(d) { return [d]; });
	      line.enter().append("path").attr("class", "line");
	
	      // Update the candlesticks.
	      var candle = g.select(".candlesticks").selectAll("g").data(function(d) { return d; }, function(d) { return d.time; });
	      var candleEnter = candle.enter().append("g")
	          .attr("transform", function(d) { return "translate(" + xScale(d.time) + ")"; });
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
	          .domain(d3.extent(lineData, function(d) { return d.time; }))
	          .range([0, options.width]);
	
	      // Update the volume scale.
	      volumeScale
	          .domain(d3.extent(lineData, function(d) { return d.volume; }))
	          .range([options.height, 0]);
	
	      // Update the y-scale.
	      yScale
	          .domain([
	            d3.min(lineData, function(d) { return Math.min(d.open, d.close, d.high, d.low); }),
	            d3.max(lineData, function(d) { return Math.max(d.open, d.close, d.high, d.low); })
	          ])
	          .range([options.height, 0]);
	
	      var candleUpdate = d3.transition(candle.classed("up", function(d) { return d.open <= d.close; }))
	          .attr("transform", function(d) { return "translate(" + xScale(d.time) + ")"; });
	      candleUpdate.select("line")
	          .attr("y1", function(d) { return yScale(d.low); })
	          .attr("y2", function(d) { return yScale(d.high); });
	      candleUpdate.select("rect")
	          .attr("x", -candleWidth / 2)
	          .attr("width", candleWidth)
	          .attr("y", function(d) { return yScale(Math.max(d.open, d.close)); })
	          .attr("height", function(d) { return Math.abs(yScale(d.open) - yScale(d.close))+.01; });
	      d3.transition(candle.exit())
	          .attr("transform", function(d) { return "translate(" + xScale(d.time) + ")"; })
	          .style("opacity", 1e-6).remove();
	
	      //line.attr("d", d3.svg.line().x(function(d) { return xScale(d.time); }).y(function(d) { return volumeScale(d.volume); }));
	
	      // Update the x-axis.
	      g.select(".x.axis")
	          .attr("transform", "translate(0," + yScale.range()[0] + ")")
	          .call(xAxis);
	
	      // Update the left axis.
	      g.select(".left.axis")
	          .call(leftAxis);
	
	      // Update the y-axis.
	      g.select(".y.axis")
	      	  .attr("transform", "translate(" + xScale.range()[1] + ", 0)")
	          .call(yAxis);
	
	  		svg.transition().duration(300).style("opacity", 1);
			loader.transition().duration(300).style("opacity", 0);
					
	      function mousemove() {
	        var tx = Math.max(options.margin.left, Math.min(options.width+options.margin.left, d3.mouse(this)[0])),
	        	x = d3.bisect(lineData.map(function(d) { return d.time; }), xScale.invert(tx-options.margin.left));
	            d = lineData[x];
	        if (d) {
	        	var details = div.select('.chartDetails');
		        details.html("<span class='date'>"+ parseDate(d, increment) + 
						"</span><span>O:<b>" + d.open.toFixed(4)  + "</b></span>" +
						"<span class='high'>H:<b>" + d.high.toFixed(4) + "</b></span>" +
						"<span class='low'>L:<b>" + d.low.toFixed(4) + "</b></span>" +
						"<span>C:<b>" + d.close.toFixed(4)  + "</b></span>" +
						"<span class='volume'>Volume:<b>" + d.volume.toFixed(4) + " " + self.trade.currency + "</b></span>")
			  			.style("opacity",1);
			}
		  			    
	        hover.attr("transform", "translate(" + xScale(d.time) + ")");
	     }	    	
	}
}	


var monthNames = [ "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December" ];
    
function parseDate (date, increment) 
{
	if 		(increment == "month") return monthNames[d.time.getMonth()] + " " + d.time.getYear();
	else if (increment == "day")   return monthNames[d.time.getMonth()] + " " + d.time.getDate();
	else return monthNames[d.time.getMonth()] + " " + d.time.getDate() + " &middot " + d.time.toLocaleTimeString();

}
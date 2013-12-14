PriceChart = function (options) {
	var self        = this,
      	xScale      = d3.time.scale.utc(),
      	priceScale  = d3.scale.linear(),
      	volumeScale = d3.scale.linear(),
      	xAxis       = d3.svg.axis().scale(xScale),
      	volumeAxis  = d3.svg.axis().scale(volumeScale).orient("left").tickFormat(d3.format("s")),
      	priceAxis   = d3.svg.axis().scale(priceScale).orient("right");
      	
    self.type = options.type ? options.type : "line";  //default to line  	

	if (!options.margin) options.margin = {top: 10, right: 60, bottom: 30, left: 60};
	if (!options.height) options.height = 500;
	if (!options.width)  options.width  = 1000;
	
	var div = d3.select(options.id).attr("class","chart");
	var svg = div.selectAll("svg").data([0])
	var svgEnter = svg.enter().append("svg")
		.attr("width", options.width + options.margin.left + options.margin.right)
	  	.attr("height", options.height + options.margin.top + options.margin.bottom);   
	
	svg.append("defs").append("clipPath").attr("id", "clip").append("rect");
    svg.select("rect").attr("width", options.width).attr("height", options.height);
	      
  	var gEnter = svg.append("g")
  		.attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");
  	gEnter.append("rect").attr("class", "background").attr("width", options.width).attr("height", options.height);
  	gEnter.append("g").attr("class", "volumeBars").attr("clip-path", "url(#clip)");   
  	gEnter.append("g").attr("class", "candlesticks").attr("clip-path", "url(#clip)");
  	gEnter.append("path").attr("class", "line");
  	gEnter.append("g").attr("class", "x axis");
  	
  	gEnter.append("g").attr("class", "volume axis")   
  		.append("text").text("Volume")
  		.attr("class", "title")
  		.attr("transform", "rotate(-90)")
  		.attr("y",15).attr("x",-90);
  		
  	gEnter.append("g").attr("class", "price axis")
  		.append("text").text("Price")
  		.attr("class", "title")
  		.attr("transform", "rotate(-90)")
  		.attr("y",-10).attr("x",-80);
  		
  	// gradient for volume bars	    
    var gradient = svg.append("svg:defs")
		.append("svg:linearGradient")
		.attr("id", "gradient")
		.attr("x1", "0%")
		.attr("y1", "0%")
		.attr("x2", "0%")
		.attr("y2", "100%")
		.attr("spreadMethod", "pad");

	gradient.append("svg:stop")
	    .attr("offset", "0%")
	    .attr("stop-color", "#ddd")
	    .attr("stop-opacity", 1);
	
	gradient.append("svg:stop")
	    .attr("offset", "100%")
	    .attr("stop-color", "#eee")
	    .attr("stop-opacity", 1);	
	    
	var hover       = gEnter.append("line").attr("class", "hover").attr("y2", options.height);
  	var horizontal  = gEnter.append("line").attr("class", "hover");
  	var focus       = gEnter.append("circle").attr("class", "focus dark").attr("r",3);
	var status      = div.append("h4").attr("class", "status");
	
	var details = div.append("div")   
		.attr("class", "chartDetails")               
		.style("opacity", 0);      

	var loader = div.append("img")
		.attr("class", "loader")
		.attr("src", "images/throbber5.gif")
		.style("opacity", 0);	
	

	//fade to throber when reloading from history
	this.fadeOut = function () {
		div.selectAll("svg").transition().duration(100).style("opacity", 0);
		svg.on("mousemove.hover", "");
		details.style("opacity", 0);
		status.style("opacity", 0);
		div.selectAll(".hover").style("opacity", 0);
		div.selectAll(".focus").style("opacity", 0);	
		loader.style("opacity",1);	
	}
	  	
	//set to line or candlestick  	
	this.setType = function (type) {
		self.type = type;
		
		if (self.type == 'line') {
        	gEnter.select(".line").style("opacity",1); 
        	gEnter.select(".candlesticks").style("opacity",0);				
		} else {
			gEnter.select(".line").style("opacity",0); 
        	gEnter.select(".candlesticks").style("opacity",1);	
		}
	};
	  	
	//load historical from API  	  	      			
	this.load = function (base, trade, d) {
		self.fadeOut();
		
		self.base     = base;
		self.trade    = trade;
		self.end      = new Date;
	 	self.start    = d.offset(self.end);
	 	self.interval = d.lineInterval;
	 	
	 	if (self.request) self.request.abort();
	 	self.request = d3.xhr(options.url);
	 	
	  	self.request.header("Content-type","application/x-www-form-urlencoded");
	  	self.request.post(params({
	  		startTime     : self.start,
	  		endTime       : self.end,
	  		timeIncrement : d.lineInterval,
	  		descending    : true,
	  		"trade[currency]" : trade.currency,
	  		"trade[issuer]"   : trade.issuer ? trade.issuer : "",
	  		"base[currency]"  : base.currency,
	  		"base[issuer]"	  : base.issuer  ? base.issuer : "",
	
	  	}), function(error, xhr) {
	  		candles = JSON.parse(xhr.response);
	  		if (candles.length<2) self.lineData = [];
	  		else {
		  		candles.splice(0,1); //remove first		
				self.lineData = candles.map(function(d) {
		      		return {
				        time   : new Date(d[0]),
			        	open   : d[4],
			        	close  : d[5],
			        	high   : d[6],
			        	low    : d[7],
			        	vwap   : d[8],
			        	volume : d[1],
					};	    		
			    });   			
	  		}
	
			drawChart();   
	  	});
	}
	
	
	
	function drawChart () {	

		if (!self.lineData || !self.lineData.length) {
			loader.style("opacity",0);
			status.html("No Data for this Period").style("opacity",1);
			return;	
		}
		
		if (self.type == 'line') {
        	gEnter.select(".line").style("opacity",1); 
        	gEnter.select(".candlesticks").style("opacity",0);				
		} else {
			gEnter.select(".line").style("opacity",0); 
        	gEnter.select(".candlesticks").style("opacity",1);	
		}		
		
		var line = d3.svg.line()
       		.x(function(d) { return xScale(d.time); })
           	.y(function(d) { return priceScale(d.close); });
           	
		var candleWidth = options.width/(self.lineData.length*1.15);
		if (candleWidth<4) candleWidth = 4; 
		
	    svg.datum(self.lineData).on("mousemove.hover", mousemove);
	
	    //var g      = svg.select("g");
		//var status = div.select(".status");
		 
		gEnter.select(".axis.price").select("text").text("Price ("+self.trade.currency+")");
		gEnter.select(".axis.volume").select("text").text("Volume ("+self.base.currency+")");
		gEnter.select(".volumeBars").selectAll("rect").data(self.lineData).enter().append("rect"); 

	    // add the candlesticks.
	    var candle = gEnter.select(".candlesticks").selectAll("g").data(self.lineData);
	    var candleEnter = candle.enter().append("g")
	        .attr("transform", function(d) { return "translate(" + xScale(d.time) + ")"; });
	    candleEnter.append("line")
	        .attr("y1", function(d) { return priceScale(.5 * (d.low + d.high)); })
	        .attr("y2", function(d) { return priceScale(.5 * (d.low + d.high)); });
	    candleEnter.append("line")
	    	.attr("class", "high");
	    candleEnter.append("line")
	    	.attr("class", "low")    
	    candleEnter.append("rect")
	        .attr("x", -candleWidth / 2)
	        .attr("y", function(d) { return priceScale(.5 * (d.open + d.close)); })
	        .attr("height", function(d) { return Math.abs(priceScale(d.open) - priceScale(d.close))+.5; })
	        .attr("width", candleWidth);	

	    // Update the x-scale.
	    xScale
	        .domain(getExtents())
	        .range([0, options.width]);
	
	    // Update the volume scale.

	    volumeScale
	        .domain([0, d3.max(self.lineData, function (d) {return d.volume})*2])
	        .range([options.height, 0]);
	
	    // Update the y-scale.
	    priceScale
	    	.domain([
	        	d3.min(self.lineData, function(d) { return Math.min(d.open, d.close, d.high, d.low); })*.975,
	            d3.max(self.lineData, function(d) { return Math.max(d.open, d.close, d.high, d.low); })*1.025
	        ])
	  		.range([options.height, 0]);
	  		
	  	//add the price line	
	  	gEnter.select(".line").datum(self.lineData).attr("d", line);	

		//add the volume bars
		gEnter.select('.volumeBars').selectAll("rect").data(self.lineData)
			.attr("x", function(d){return xScale(d.time)-candleWidth/3})
			.attr("y", function(d){return volumeScale(d.volume)})
			.attr("width", candleWidth/1.5)
			.attr("height", function(d){return options.height - volumeScale(d.volume)})
			.style("fill", "url(#gradient)")
			.exit().remove();
			
	    var candleUpdate = d3.transition(candle.classed("up", function(d) { return d.open <= d.close; }))
	        .attr("transform", function(d) { return "translate(" + xScale(d.time) + ")"; });
	    candleUpdate.select("line")
	        .attr("y1", function(d) { return priceScale(d.low); })
	        .attr("y2", function(d) { return priceScale(d.high); });
	    candleUpdate.select("rect")
	        .attr("x", -candleWidth / 2)
	        .attr("width", candleWidth)
	        .attr("y", function(d) { return priceScale(Math.max(d.open, d.close)); })
	        .attr("height", function(d) { return Math.abs(priceScale(d.open) - priceScale(d.close))+.5; });
	    candleUpdate.select(".high")
	    	.attr("x1", -candleWidth / 4)
	    	.attr("x2", candleWidth / 4)
	    	.attr("transform", function(d) { return "translate(0," + priceScale(d.high) + ")"; });
	    candleUpdate.select(".low")
	    	.attr("x1", -candleWidth / 4)
	    	.attr("x2", candleWidth / 4)
	    	.attr("transform", function(d) { return "translate(0," + priceScale(d.low) + ")"; });	
	    d3.transition(candle.exit())
	        .attr("transform", function(d) { return "translate(" + xScale(d.time) + ")"; })
	        .style("opacity", 1e-6).remove();
	
	    // Update the x-axis.
	    gEnter.select(".x.axis").call(xAxis).attr("transform", "translate(0," + priceScale.range()[0] + ")")

	    // Update the y-axis.
	    gEnter.select(".price.axis").call(priceAxis).attr("transform", "translate(" + xScale.range()[1] + ", 0)")
	    	
	    // Update the left axis.
	    gEnter.select(".volume.axis").call(volumeAxis);
	
	  	
	  	svg.transition().duration(300).style("opacity", 1);
		loader.transition().duration(300).style("opacity", 0);
					    				
	}
	
	function mousemove() {
        var tx = Math.max(0, Math.min(options.width+options.margin.left, d3.mouse(this)[0])),
        	x = d3.bisect(self.lineData.map(function(d) { return d.time; }), xScale.invert(tx-options.margin.left));
            d = self.lineData[x];
  	    
        if (d) {
  	
        	var details = div.select('.chartDetails');
	        details.html("<span class='date'>"+ parseDate(d, self.interval) + 
				"</span><span>O:<b>" + d.open.toFixed(4)  + "</b></span>" +
				"<span class='high'>H:<b>" + d.high.toFixed(4) + "</b></span>" +
				"<span class='low'>L:<b>" + d.low.toFixed(4) + "</b></span>" +
				"<span>C:<b>" + d.close.toFixed(4)  + "</b></span>" +
				"<span class='volume'>Volume:<b>" + d.volume.toFixed(4) + " " + self.base.currency + "</b></span>")
		  		.style("opacity",1);
		  		
			hover.transition().duration(50).attr("transform", "translate(" + xScale(d.time) + ")");
			focus.transition().duration(50).attr("transform", "translate(" + xScale(d.time) + "," + priceScale(d.close) + ")");
			horizontal.transition().duration(50)
				.attr("x1", xScale(d.time))
	  			.attr("x2", options.width)
	  			.attr("y1", priceScale(d.close))
	  			.attr("y2", priceScale(d.close));
	  		
	  		hover.style("opacity",1);
			horizontal.style("opacity",1);
  			focus.style("opacity",1);
		}
    }	
	
	function getExtents () {
		if (self.lineData && self.lineData.length>1) {
			var difference = (self.lineData[1].time - self.lineData[0].time)/1000;

			return [
				d3.min(self.lineData, function(d) { return d.time }),
				d3.time.second.offset(d3.max(self.lineData, function(d) { return d.time }), difference)
			]
			
		}
		
		return d3.extent(lineData, function(d) { return d.volume; });	
	}

    
	function parseDate (date, increment) 
	{
		var monthNames = [ "January", "February", "March", "April", "May", "June",
	    "July", "August", "September", "October", "November", "December" ];
	    
		if 		(increment == "month") return monthNames[d.time.getMonth()] + " " + d.time.getYear();
		else if (increment == "day")   return monthNames[d.time.getMonth()] + " " + d.time.getDate();
		else return monthNames[d.time.getMonth()] + " " + d.time.getDate() + " &middot " + d.time.toLocaleTimeString();
	
	}
}

var RippleCharts = {};

RippleCharts.line = function (options){

	this.options  = options;
	var lineData = [];
	var self     = this;
		
  	var //x     = d3.time.scale().range([0, options.width]).domain(d3.extent(self.lineData, function(d) { return d.time; })),
    	//y     = d3.scale.linear().range([options.height, 0]).domain(d3.extent(self.lineData, function(d) { return d.close; })).nice(),
      	xScale      = d3.time.scale();
      	priceScale  = d3.scale.linear();
      	volumeScale = d3.scale.linear();
      	xAxis       = d3.svg.axis().scale(xScale),
      	priceAxis   = d3.svg.axis().scale(priceScale).orient("right"),
      	volumeAxis  = d3.svg.axis().scale(volumeScale).orient("left").tickFormat(d3.format("s")),
      	line  = d3.svg.line()
        	.x(function(d) { return xScale(d.time); })
        	.y(function(d) { return priceScale(d.close); });	
	      		
	if (options.title)   d3.select("body").append("h3").html(options.title);
	if (!options.margin) options.margin = {top: 10, right: 50, bottom: 50, left: 50};
	if (!options.height) options.height = 500;
	if (!options.width)  options.width  = 950;
	
	
	var div = d3.select(options.id);
	
	var details = div.append("div")   
		.attr("class", "chartDetails")               
		.style("opacity", 0);
		
	var svg      = div.selectAll("svg").data([0]); 	
	var svgEnter = svg.enter().append("svg")
		.attr("width", options.width + options.margin.left + options.margin.right)
	  	.attr("height", options.height + options.margin.top + options.margin.bottom)
	  	.style("opacity",0);

	var background = svg.append("rect")
		.attr("class", "background")
		.attr("x", options.margin.left)
	  	.attr("y", options.margin.top)
	  	.attr("height", options.height)
	  	.attr("width", options.width); 
	  	
	  	
	  		  	
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
		
	var focus = svg.append("circle")
 		.attr("class", "focus")
 		.attr("r", 4.5)
 		.style("opacity", 0);
 				
	var loader = div.append("img")
		.attr("class", "loader")
		.attr("src", "images/throbber5.gif")
		.style("opacity", 0);	

  	var gEnter = svgEnter.append("g")
      	.attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");

	
  	gEnter.append("g")
  		.attr("class", "x axis");
  	gEnter.append("g")
  		.attr("class", "volume axis")
  		.append("text").text("Volume")
  		.attr("class", "title")
  		.attr("transform", "rotate(-90)")
  		.attr("y",15).attr("x",-90);
  	gEnter.append("g")
  		.attr("class", "price axis")
  		.append("text").text("Price")
  		.attr("class", "title")
  		.attr("transform", "rotate(-90)")
  		.attr("y",-10).attr("x",-80);
  		
   	gEnter.append("g").attr("class", "volumeBars")
  		.attr("width", options.width + options.margin.left + options.margin.right)
	  	.attr("height", options.height + options.margin.top + options.margin.bottom);  		
	  	
  	gEnter.append("path").attr("class", "line");
  		
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
	  		timeIncrement : d.lineInterval,
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
			        	volume : d[1],
					};	    		
			    });   			
	  		}
	
			self.redraw(d.lineInterval, lineData);   
	  	});
	}
	
	this.redraw = function (increment, lineData) {
		if (!lineData.length) {
			loader.style("opacity",0);
			status.html("No Data for this Period").style("opacity",1);
			return;	
		}

		barWidth = options.width/(lineData.length*1.15);
		if (barWidth<2) barWidth = 2; 
				
		self.lineData = lineData;
	    
	    var g      = svg.select("g"), 
	    	status = div.select(".status"),     	
	   		line   = d3.svg.line()
       			.x(function(d) { return xScale(d.time); })
           		.y(function(d) { return priceScale(d.close); });
           	
	  	g.select(".volumeBars").selectAll("rect").data(lineData).enter().append("rect"); 
	  	g.select(".axis.price").select("text").text("Price ("+self.trade.currency+")");
		g.select(".axis.volume").select("text").text("Volume ("+self.base.currency+")");
		
	    // Update the x-scale.
	    xScale
	        .domain(RippleCharts.getExtents(lineData))
	        .range([0, options.width]);
	
	    // Update the volume scale.
	    volumeScale
	        .domain([0, d3.max(lineData, function (d) {return d.volume})*2])
	        .range([options.height, 0]);
	
	    // Update the y-scale.
	    priceScale
	    	.domain([
	        	d3.min(lineData, function(d) { return d.close; })*.975,
	            d3.max(lineData, function(d) { return d.close; })*1.025
	        ])
	  		.range([options.height, 0]);
	  		
		// Update the x-axis.
        g.select(".x.axis")
            .attr("transform", "translate(0," + priceScale.range()[0] + ")")
            .call(xAxis);

        // Update the price axis.
        g.select(".price.axis")
                .attr("transform", "translate(" + xScale.range()[1] + ", 0)")
            .call(priceAxis);	
    
        // Update the volume axis.
        g.select(".volume.axis")
            .call(volumeAxis);

	  	g.select(".line").datum(self.lineData).attr("d", line);

		//add the volume bars
		g.select('.volumeBars').selectAll("rect").data(lineData)
			.attr("x", function(d){return xScale(d.time)-barWidth/3})
			.attr("y", function(d){return volumeScale(d.volume)})
			.attr("width", barWidth/1.5)
			.attr("height", function(d){return options.height - volumeScale(d.volume)})
			.exit().remove();
			
				
	  	svg.transition().duration(300).style("opacity", 1);
		loader.transition().duration(300).style("opacity", 0);
		
		function mousemove() {
			var tx = Math.max(options.margin.left, Math.min(options.width+options.margin.left, d3.mouse(this)[0])),
				i  = d3.bisect(self.lineData.map(function(d) { return d.time; }), xScale.invert(tx-options.margin.left));
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
		 		tx = xScale(d.time)+options.margin.left;
		 		ty = priceScale(d.close)+options.margin.top;
				
		  		details.html("<span class='date'>"+ parseDate(d, increment) + 
					"</span><span>O:<b>" + d.open.toFixed(4)  + "</b></span>" +
					"<span class='high'>H:<b>" + d.high.toFixed(4) + "</b></span>" +
					"<span class='low'>L:<b>" + d.low.toFixed(4) + "</b></span>" +
					"<span>C:<b>" + d.close.toFixed(4)  + "</b></span>" +
					"<span class='volume'>Volume:<b>" + d.volume.toFixed(4) + " " + self.base.currency + "</b></span>")
		  			.style("opacity",1);
		  		
		  		hover.transition().duration(50).attr("transform", "translate(" + tx + ")");
		  		focus.transition().duration(50).attr("transform", "translate(" + tx + "," + ty + ")");
		  		horizontal.transition().duration(50)
		  			.attr("x1", tx)
		  			.attr("x2", options.width+options.margin.left)
		  			.attr("y1", ty)
		  			.attr("y2", ty);
		  	}
		}
		
		svg.on("mousemove.hover", mousemove);
	}		
};

RippleCharts.candlestick = function (options) {
	var self = this,
      	xScale      = d3.time.scale.utc(),
      	priceScale  = d3.scale.linear(),
      	volumeScale = d3.scale.linear(),
      	xAxis       = d3.svg.axis().scale(xScale),
      	volumeAxis    = d3.svg.axis().scale(volumeScale).orient("left").tickFormat(d3.format("s")),
      	priceAxis   = d3.svg.axis().scale(priceScale).orient("right");

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
    svg.select("rect").attr("width", options.width).attr("height", options.height);
	      
  	var gEnter = svg.append("g")
  		.attr("transform", "translate(" + options.margin.left + "," + options.margin.top + ")");
  	gEnter.append("rect").attr("class", "background").attr("width", options.width).attr("height", options.height);
  	gEnter.append("g").attr("class", "volumeBars").attr("clip-path", "url(#clip)");   
  	gEnter.append("g").attr("class", "candlesticks").attr("clip-path", "url(#clip)");
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
	    	
    var hover      = gEnter.append("line").attr("class", "hover").attr("y2", options.height);
  	var horizontal = gEnter.append("line").attr("class", "hover");
  	var focus      = gEnter.append("circle").attr("class", "focus dark").attr("r",3).attr("fill", "#555");
	          
	this.fadeOut = function () {
		div.selectAll("svg").transition().duration(100).style("opacity", 0);
		svg.on("mousemove.candlestick", "");
		details.style("opacity", 0);
		//status.style("opacity", 0);
		div.selectAll(".hover").style("opacity", 0);
		div.selectAll(".focus").style("opacity", 0);	
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
	  		timeIncrement : d.candleInterval,
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
			        	volume : d[1],
					};	    		
			    });   			
	  		}
	
			self.redraw(d.candleInterval, lineData);   
	  	});
	}
	
	this.redraw = function (increment, lineData) {

		candleWidth = options.width/(lineData.length*1.15);
		if (candleWidth<4) candleWidth = 4; 
		
	    svg.datum(lineData).on("mousemove.candlestick", mousemove);
	
	    var g      = svg.select("g");
		var status = div.select(".status");
		 
		g.select(".axis.price").select("text").text("Price ("+self.trade.currency+")");
		g.select(".axis.volume").select("text").text("Volume ("+self.base.currency+")");
		g.select(".volumeBars").selectAll("rect").data(lineData).enter().append("rect"); 
		
	    // add the candlesticks.
	    var candle = g.select(".candlesticks").selectAll("g").data(function(d) { return d; }, function(d) { return d.time; });
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
	        .domain(RippleCharts.getExtents(lineData))
	        .range([0, options.width]);
	
	    // Update the volume scale.

	    volumeScale
	        .domain([0, d3.max(lineData, function (d) {return d.volume})*2])
	        .range([options.height, 0]);
	
	    // Update the y-scale.
	    priceScale
	    	.domain([
	        	d3.min(lineData, function(d) { return Math.min(d.open, d.close, d.high, d.low); })*.975,
	            d3.max(lineData, function(d) { return Math.max(d.open, d.close, d.high, d.low); })*1.025
	        ])
	  		.range([options.height, 0]);
	  		
	  		

		//add the volume bars
		g.select('.volumeBars').selectAll("rect").data(lineData)
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
	    g.select(".x.axis").call(xAxis).attr("transform", "translate(0," + priceScale.range()[0] + ")")

	    // Update the y-axis.
	    g.select(".price.axis").call(priceAxis).attr("transform", "translate(" + xScale.range()[1] + ", 0)")
	    	
	    // Update the left axis.
	    g.select(".volume.axis").call(volumeAxis);
	
	  	
	  	svg.transition().duration(300).style("opacity", 1);
		loader.transition().duration(300).style("opacity", 0);
					
	    function mousemove() {
	        var tx = Math.max(0, Math.min(options.width+options.margin.left, d3.mouse(this)[0])),
	        	x = d3.bisect(lineData.map(function(d) { return d.time; }), xScale.invert(tx-options.margin.left));
	            d = lineData[x];
	  	    
	        if (d) {
	  	
	        	var details = div.select('.chartDetails');
		        details.html("<span class='date'>"+ parseDate(d, increment) + 
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
	}
}	

RippleCharts.getExtents = function (lineData) {
		if (lineData.length>1) {
			var difference = (lineData[1].time - lineData[0].time)/1000;

			return [
				d3.min(lineData, function(d) { return d.time }),
				d3.time.second.offset(d3.max(lineData, function(d) { return d.time }), difference)
			]
			
		}
		
		return d3.extent(lineData, function(d) { return d.volume; });	
	}

var monthNames = [ "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December" ];
    
function parseDate (date, increment) 
{
	if 		(increment == "month") return monthNames[d.time.getMonth()] + " " + d.time.getYear();
	else if (increment == "day")   return monthNames[d.time.getMonth()] + " " + d.time.getDate();
	else return monthNames[d.time.getMonth()] + " " + d.time.getDate() + " &middot " + d.time.toLocaleTimeString();

}
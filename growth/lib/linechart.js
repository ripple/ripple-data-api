var LineChart = {};

LineChart = function (options){
	var lineData = [];
	var self     = this;
	var margin   = {top: 20, right: 50, bottom: 50, left: 50},
		width    = 960 - margin.left - margin.right,
	  	height   = 500 - margin.top - margin.bottom;
	  		
	if (options.title) d3.select("body").append("h3").html(options.title);
	var div      = d3.select("body").append("div").attr("class","lineChart");
		
	var svg = div.selectAll("svg").data([0]); 	
	var svgEnter = svg.enter().append("svg")
		.attr("width", width + margin.left + margin.right)
	  	.attr("height", height + margin.top + margin.bottom);
	  	
	 //var status = svg.append("text").attr("class", "status").attr({y:"1em", x:margin.left ,fill:"#999"});
	var status  = div.append("h4")
		.attr("class", "status")
		.style("opacity", 0);
		
	var details = div.append("div")   
		.attr("class", "details")               
		.style("opacity", 0);
		
	var borderPath = svg.append("rect")
		.attr("x", margin.left)
	  	.attr("y", margin.top)
	  	.attr("height", height)
	  	.attr("width", width)
	  	.style("stroke", "#999")
	  	.style("fill", "none")
	  	.style("stroke-width", 1); 
	
	var hover = svg.append("line")
	    .attr("class", "hover")
	    .attr("y1", margin.top)
	    .attr("y2", height+margin.top)
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
		
	  	var x     = d3.time.scale().range([0, width]).domain(d3.extent(self.lineData, function(d) { return d.time; })),
	    	y     = d3.scale.linear().range([height, 0]).domain(d3.extent(self.lineData, function(d) { return d.total; })).nice(),
	      	xAxis = d3.svg.axis().scale(x),
	      	yAxis = d3.svg.axis().scale(y),
	      	line  = d3.svg.line()
	        	.x(function(d) { return x(d.time); })
	        	.y(function(d) { return y(d.total); });
	    	        	
	  	var gEnter = svgEnter.append("g")
	      	.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
	      	
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
	  	
	  	d3.select(".focus").remove();
	   	var focus = svg.append("g")
	 		.attr("class", "focus")
	 		.style("opacity", 0);	
	      
	    focus.append("circle").attr("r", 4.5);	
	
	  	svg.transition().duration(300).style("opacity", 1);
		loader.transition().duration(300).style("opacity", 0);
		
		function mousemove(e) {
			var tx = Math.max(margin.left, Math.min(width+margin.left, d3.mouse(this)[0])),
				i  = d3.bisect(self.lineData.map(function(d) { return d.time; }), x.invert(tx-margin.left));
		    	d  = self.lineData[i-1];
		    
		    //console.log(i);
			//console.log(x.invert(tx-margin.left));
			//console.log(d);
			
			var details = div.select('.details');
		    mouseX = d3.mouse(this)[0];
		    if (mouseX<0 || mouseX>width+margin.left+margin.right) {
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
		 		tx = x(d.time)+margin.left;
		 		ty = y(d.total)+margin.top;
		 		
		  		details.html(options.tooltip(d, increment))
		  			.style("left", (tx-100) + "px")     
	                .style("top", (ty-100) + "px") 
		  			.style("opacity",1);
		  		
		  		hover.attr("transform", "translate(" + tx + ")");
		  		focus.attr("transform", "translate(" + tx + "," + ty + ")");
		  		horizontal.attr("x1", tx);
		  		horizontal.attr("x2", width+margin.left);
		  		horizontal.attr("y1", ty);
		  		horizontal.attr("y2", ty);
		  	}
		}
		
		svg.on("mousemove.hover", mousemove);
	}		
};
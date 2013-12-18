var OrderBook = function (options) {
  var self = this;
  
  self.orders = {};
  
  function priceFilter (price) {
    return ripple.Amount.from_json(price).to_human(
      opts = {
        precision      : 8,
        min_precision  : 0,
        max_sig_digits : 8,
        group_sep      : false
    });  
  }
  

  var handleBook = function(data,action) {
    var max_rows = options.max_rows || 100;
    var rowCount = 0;
    var orders   = [];
    
    for (var i=0; i<data.length; i++) {
      var d = data[i];
 
      // prefer taker_pays_funded & taker_gets_funded
      if (d.hasOwnProperty('taker_gets_funded')) {
        d.TakerGets = d.taker_gets_funded;
        d.TakerPays = d.taker_pays_funded;
      }

      d.TakerGets = ripple.Amount.from_json(d.TakerGets);
      d.TakerPays = ripple.Amount.from_json(d.TakerPays);

      d.price = ripple.Amount.from_quality(d.BookDirectory, "1", "1");

      if (action !== "asks") d.price = ripple.Amount.from_json("1/1/1").divide(d.price);
      
      // Adjust for drops: The result would be a million times too large.
      if (d[action === "asks" ? "TakerPays" : "TakerGets"].is_native())
        d.price  = d.price.divide(ripple.Amount.from_json("1000000"));

      // Adjust for drops: The result would be a million times too small.
      if (d[action === "asks" ? "TakerGets" : "TakerPays"].is_native())
        d.price  = d.price.multiply(ripple.Amount.from_json("1000000"));


      if (rowCount++ > max_rows) break;

      orders.push(d);              
    }
    
    var type = action === "asks" ? "TakerGets" : "TakerPays";
    var sum;
    
    orders.forEach(function(order,index) {
      if (sum) sum = order.sum = sum.add(order[type]);
      else sum = order.sum = order[type];
      
      order.showSum   = parseFloat(priceFilter(order.sum));
      order.showPrice = parseFloat(priceFilter(order.price));
      
      var showValue = action === 'bids' ? 'TakerPays' : 'TakerGets';
      order['show' + showValue] = parseFloat(priceFilter(order[showValue],opts));
      //console.log(order.showPrice, order.showSum, order['show' + showValue]);
    });

    return orders;
  };

  //subscribe to market data for trading pair
  this.getMarket = function (base, trade) {
    options.base  = base;
    options.trade = trade;
    lineData      = [];
    self.orders   = {};

    resetChart();
    
    if (asks) {
      asks.removeListener('model', handleAskModel);
      remote.request_unsubscribe().books([asks.to_json()]).request();
    }
    if (bids) {
      bids.removeListener('model', handleBidModel);
      remote.request_unsubscribe().books([bids.to_json()]).request();
    }
    
    remote._books = {};

    asks = remote.book(options.base.currency, options.base.issuer, options.trade.currency, options.trade.issuer)
    bids = remote.book(options.trade.currency, options.trade.issuer, options.base.currency, options.base.issuer);         
    
    function handleAskModel (offers) {
      self.orders.asks = handleBook(offers,'asks');
      redrawChart();      
    }
    
    function handleBidModel (offers) {
      self.orders.bids = handleBook(offers,'bids');
      self.orders.bids.reverse();
      redrawChart();      
    }
    
    asks.on('model', handleAskModel);   
    bids.on('model', handleBidModel); 
  }

  var asks, bids;
  var div = d3.select("#"+options.id).attr('class','chart');
  var width  = 1000,
    height   = 200,
    margin   = {top: 5, left: 60, right: 60, bottom: 50},
    xScale   = d3.scale.linear(),
    yScale   = d3.scale.linear(),
    lineData = [];
    
  var svg   = div.selectAll("svg").data([0]);       
  var depth = svg.enter().append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom) 
    .on("mousemove", mousemove);

  var gEnter = depth.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
    
    
  var xAxis     = gEnter.append("g").attr("class", "x axis");
  var leftAxis  = gEnter.append("g").attr("class", "y axis");
  var rightAxis = gEnter.append("g").attr("class", "y axis");

  var hover     = gEnter.append("line").attr("class", "hover").attr("y2", height).style("opacity",0);   
  var focus     = gEnter.append("circle").attr("class", "focus dark").attr("r",3).style("opacity",0);
  var path      = gEnter.append("path").attr("class","line");
  
  var details   = div.append("div")   
        .attr("class", "chartDetails")               
        .style("opacity", 0);  
  
  gEnter.append("rect").attr("class", "background").attr("width", width).attr("height", height);  
  
  var loader = div.append("img")
    .attr("class", "loader")
    .attr("src", "images/throbber5.gif")
    .style("opacity", 0); 
            
  function resetChart() {
    depth.transition(100).style("opacity",.5); 
    loader.transition(100).style("opacity",1);
    details.style("opacity",0);
    hover.style("opacity",0);
    focus.style("opacity",0); 
  }  
  
  function redrawChart () {
    if (!self.orders.bids || !self.orders.asks) return;
    
    lineData = self.orders.bids.concat(self.orders.asks);
    var extent = d3.extent(lineData, function(d) { return d.showPrice; });
       
    xScale.domain(extent).range([0, width]);
    yScale.domain([0, d3.max(lineData, function(d) { return d.showSum; })]).range([height, 0]);
   
  
    path.datum(lineData)
        .transition()
        .attr("d", d3.svg.line()
          .x(function(d) { return xScale(d.showPrice); })
          .y(function(d) { return yScale(d.showSum); }));
  
    
    xAxis.attr("transform", "translate(0," + yScale.range()[0] + ")").call(d3.svg.axis().scale(xScale))
    leftAxis.attr("transform", "translate(" + xScale.range()[0] + ",0)").call(d3.svg.axis().scale(yScale).orient("left"));
    rightAxis.attr("transform", "translate(" + xScale.range()[1] + ",0)").call(d3.svg.axis().scale(yScale).orient("right"));
    
    depth.transition(100).style("opacity",1); 
    loader.transition(100).style("opacity",0);      
  }
  
  function mousemove () {
    var tx = Math.max(margin.left, Math.min(width+margin.left, d3.mouse(this)[0]))-margin.left,
        i = d3.bisect(lineData.map(function(d) { return d.showPrice; }), xScale.invert(tx));
        d = lineData[i];

    if (d) {
      var quantity = d.showTakerPays ? d.showTakerPays : d.showTakerGets;
      hover.attr("transform", "translate(" + xScale(d.showPrice) + ")").style("opacity",1);
      focus.attr("transform", "translate(" + xScale(d.showPrice) + "," + yScale(d.showSum) + ")").style("opacity",1); 
      details.html("<span>Quantity:<b>" + quantity + 
        "</b></span><span>Total<b>" +d.showSum + " " + options.base.currency + "</b></span>" + 
        "<span> @ <b>" + d.showPrice + " " + options.trade.currency + "</b></span>")
        .style("opacity",1);
    }
  }
}

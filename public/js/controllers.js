'use strict';

/* Controllers */

function AppCtrl($scope, socket) {
  // Easier access for debugging
  window.$scope = $scope;

  $scope.$watch("tickers", function (tickers) {
    tickers && ($scope.atickers = _.values(tickers));
  }, true);

  socket.on('apply', function (data) {
    angular.extend($scope, data);
  });

  socket.on('set', function (data) {
    var path = data[0], value = data[1];

    path = path.split('.');

    var segment, select = $scope;
    while ((segment = path.shift())) {
      if (path.length && select[segment]) {
        select = select[segment];
      } else if (path.length) {
        select = select[segment] = {};
      } else {
        select[segment] = value;
      }
    }
  });
}

function DashboardCtrl() {}
DashboardCtrl.$inject = [];

function MarketCtrl($scope, $http, $routeParams)
{
  $scope.first = $routeParams.first;
  $scope.second = $routeParams.second;
  var symbol = $scope.symbol = $scope.first + "/" + $scope.second;

  $http.get('api/market/'+symbol+'/daily.json').success(function (data) {
    // Split the data set into ohlc and volume
    var ohlc = [],
        volume = [],
        dataLength = data.length;

    for (var i = 0; i < dataLength; i++) {
      ohlc.push([
        data[i][0], // the date
        data[i][1], // open
        data[i][2], // high
        data[i][3], // low
        data[i][4] // close
      ]);

      volume.push([
        data[i][0], // the date
        data[i][5] // the volume
      ]);
    }

    // set the allowed units for data grouping
    var groupingUnits = [[
      'week',                         // unit name
      [1]                             // allowed multiples
    ], [
      'month',
      [1, 2, 3, 4, 6]
    ]];

    $scope.data = {
      chart: {
        alignTicks: false,
        events: {
          load: function (e) {
            var axis = this.yAxis[0];
            var ex = axis.getExtremes();

            if (ex.min < 0) {
              axis.setExtremes(0, null);
            }
          }
        }
      },

      colors: [
        '#DC504F',
        "#4B80B6"
      ],

      plotOptions: {
        candlestick: {
          upColor: '#79AF7B'
        },
        series: {
            pointPadding: 0.13,
            groupPadding: 0
        }
      },

      rangeSelector: {
        selected: 1
      },

      title: {
        text: symbol
      },

      xAxis: {
        ordinal: false
      },

      yAxis: [{
        title: {
          text: 'OHLC'
        },
        height: 200,
        lineWidth: 2
      }, {
        title: {
          text: 'Volume'
        },
        top: 300,
        height: 100,
        offset: 0,
        lineWidth: 2
      }],

      tooltip: {
        borderColor: "#2F7ED8"
      },

      series: [{
        type: 'candlestick',
        name: symbol,
        data: ohlc,
        dataGrouping: {
          units: groupingUnits
        }
      }, {
        type: 'column',
        name: 'Volume',
        data: volume,
        yAxis: 1,
        dataGrouping: {
          units: groupingUnits
        }
      }]
    };
  });
}

//Caps Control
function CapsCtrl($scope, $http, $routeParams) {
  $scope.first = $routeParams.first;
  var symbol = $scope.symbol = $scope.first;

  $http.get('api/caps/'+symbol+'/caps.json').success(function (data) {
    var dataLength = data.length,
        hot_data = [],
        caps_data = [];

    for (var i = 0; i < dataLength; i++) {
      if (data[i][3] == 0) {
        caps_data.push([data[i][0], data[i][5]]);
      } else {
        hot_data.push([data[i][0], data[i][5]]);
      }
    }
    $scope.data = {
      chart: {
        type: 'line'
      },

      title: {
        text: symbol
      },

      xAxis: {
        type: 'datetime',
        labels: {
          formatter : function() {
            return Highcharts.dateFormat('%a, %b %d', this.value)
          }
        }
      },

      yAxis: {
        title: {
          text: 'Amount'
        },
        plotLines: [{
          value: 0,
          width: 1,
          color: '#808080'
        }]
      },

      tooltip: {
        borderColor: "#2F7ED8"
      },

      series: [{
          name: 'Hotwallets',
          data: hot_data
        }, {
          name: 'Capitalization',
          data: caps_data
      }]
    };
    
  });
}

//Intraday Ctrl
function IntradayCtrl($scope, $http, $routeParams)
{
  $scope.first = $routeParams.first;
  $scope.second = $routeParams.second;
  $scope.period = +$routeParams.period;
  $scope.start = $routeParams.start;
  if(!$scope.period) {
    $scope.period = 72;
    var dateOffset = $scope.period*60*60*1000;
    var now = new Date();
    now.setTime(now.getTime() - dateOffset);
    $scope.start = now.toISOString().slice(0,10).replace(/-/g,"");
  }
  var symbol = $scope.symbol = $scope.first + "/" + $scope.second,
      period_param = $scope.period_param = $scope.period,
      start_param = $scope.start_param = $scope.start;

  $http.get('api/intraday/'+symbol+'/intraday.json?period=' + period_param + '&start=' + start_param ).success(function (data) {
    var dataLength = data.length,
        intra_data = [];

    for (var i = 0; i < dataLength; i++) {
      intra_data.push([data[i][0], data[i][1]]);
    }
    $scope.data = {
      chart: {
        type: 'line'
      },

      title: {
        text: symbol
      },

      xAxis: {
        type: 'datetime',
        labels: {
          formatter : function() {
            return Highcharts.dateFormat('%a, %b %d', this.value)
          }
        }
      },

      yAxis: {
        title: {
          text: 'Price'
        },
        plotLines: [{
          value: 0,
          width: 1,
          color: '#808080'
        }]
      },

      tooltip: {
        borderColor: "#2F7ED8"
      },

      series: [{
          name: 'Intraday',
          data: intra_data
      }]
    };
  });
}

//NewsCtrl
function NewsCtrl ($scope, $http, $routeParams) {
  $scope.first = $routeParams.first;
  if(!$scope.first) 
    $scope.first = 1;
  $http.get('api/news/'+$scope.first+'/news.json').success(function (data) {
    $scope.data = data.news_data;
    var options = {
      currentPage: $scope.first,
      totalPages: data.total,
      pageUrl: function(type, page, current){
        return "/news/"+page;
      }
    }
    $('.pagination').bootstrapPaginator(options);
  });
}

//OrderbookCtrl
function OrderbookCtrl ($scope, $http, $routeParams) {
  $scope.firstcurrency = $routeParams.first.split(':')[0];
  $scope.issuer = $routeParams.first.split(':')[1];
  $scope.secondcurrency = $routeParams.second;

  for (var i = 0; i < all_issuers.length; i++) {
    if (all_issuers[i].name == $scope.issuer) {
      $scope.issuer = all_issuers[i].currencies[$scope.firstcurrency];
    }
  }

  var config = {
    socket: "wss://s1.ripple.com:51233/",
    base: {currency: $scope.firstcurrency, issuer:$scope.issuer},
    counter: {currency: $scope.secondcurrency}
  };
  console.log(config);
  var OrderBook = function(config) {
    this.config = config;
  };
  
  OrderBook.prototype = {
    config: null,
    silent: false,
    index : {
      bids : {},
      asks : {}
    },
    connect: function(callback) {
      function createSubscriptionMessage(id, base, counter) {
        return JSON.stringify({
          command: "subscribe", id: id, books: [{
            snapshot: true,
            taker_gets: base,
            taker_pays: counter
          }]
        });
      }
      var ob = this;
      var seen = {};
      this.writeLog('Connecting to websocket: ' + this.config.socket, 'info');
      var websocket = new WebSocket(this.config.socket);
      websocket.onopen = function(evt) {
        websocket.send(createSubscriptionMessage(1, ob.config.base, ob.config.counter));
        ob.writeLog('Subscribing to Asks.', 'info');
        websocket.send(createSubscriptionMessage(2, ob.config.counter, ob.config.base));
        ob.writeLog('Subscribing to Bids.', 'info');
      };
      websocket.onclose = function(evt) {
        // silent close
      };
      websocket.onmessage = function(evt) {
        var data = JSON.parse(evt.data);
        console.log(data);
        if('transaction' in data && data.transaction.hash in seen) return;
        if(data.id) {
          ob.processBook(data.result.offers, data.id);
        } else if(data.engine_result == "tesSUCCESS") {
          ob.processTransaction(data);
          seen[data.transaction.hash] = 1;
        }
        if(data.id == 1) return;
        callback(ob.index);
        if(data.id == 2) ob.writeLog('Connected and updating live :)');
      };
      websocket.onerror = function(evt) {
        // handle error
      };
    },
    _currencySimplifier : function(currency) {
      return typeof currency.value == 'undefined' ? currency / 1000000
          : parseFloat(currency.value);
    },
    _takerGets : function(order) {
      return typeof order.taker_gets_funded == 'undefined' ? this
          ._currencySimplifier(order.TakerGets) : this
          ._currencySimplifier(order.taker_gets_funded);
    },
    _takerPays : function(order) {
      return typeof order.taker_pays_funded == 'undefined' ? this
          ._currencySimplifier(order.TakerPays) : this
          ._currencySimplifier(order.taker_pays_funded);
    },
    processBook : function(orders, book) {
      this.silent = true;
      for ( var i in orders) this.saveOrder(orders[i], book);
      this.silent = false;
    },
    saveOrder : function(order, book) {
      var key = order.Account + '#' + order.Sequence;
      var temp = this.createOrder(order,book);
      switch (book) {
        case 1:
          this.index.asks[key] = temp;
        break;
        case 2:
          this.index.bids[key] = temp;
        break;
      }
      return temp;
    },
    createOrder : function(order, book) {
      var temp = {
        gets : this._takerGets(order),
        pays : this._takerPays(order),
        rate : 0
      }
      switch (book) {
        case 1:
          temp.rate = temp.pays / temp.gets;
        break;
        case 2:
          temp.rate = temp.gets / temp.pays;
        break;
      }
      return temp;
    },
    writeLog : function(text, color) {
      $('.live-feed').prepend( $('<p>').text(text).addClass(color) );
    },
    deleteOrder : function(key) {
      delete this.index.bids[key];
      delete this.index.asks[key];
    },
    notifyTrade : function(order, book) {
      if(book == 1) this.writeLog('Trade: '
          + order.gets + ' ' + this.config.counter.currency 
          + ' (' + order.pays + ' ' + this.config.base.currency + ')'
          + ' @ ' + order.rate, 
        'green'
      );
      else this.writeLog('Trade: '
        + order.pays + ' ' + this.config.counter.currency
        + ' (' + order.gets + ' ' + this.config.base.currency + ')'
        + ' @ ' + order.rate,
      'red');
    },
    notifyOrder : function(order, book) {
      if(book == 1) this.writeLog('ASK: ' 
        + order.pays + ' ' + this.config.counter.currency
        + ' (' + order.gets + ' ' + this.config.base.currency + ')'
        + ' @ ' + order.rate,
        'black'
      );
      else this.writeLog('BID: ' 
        + order.gets + ' ' + this.config.counter.currency 
        + ' (' + order.pays + ' ' + this.config.base.currency + ')'
        + ' @ ' + order.rate, 
        'black'
      );
    },
    processTransaction : function(data) {
      var transaction = data.transaction;
      if(transaction.TransactionType == 'OfferCancel') {
        var key = transaction.Account + '#' + transaction.OfferSequence;
        this.deleteOrder(key);
        return;
      }
      if(transaction.TransactionType == 'OfferCreate') {
        var pays = typeof transaction.TakerPays.value == 'undefined' ? 'XRP' : transaction.TakerPays.currency;
        var book = pays == this.config.base.currency ? 2 : 1;
        // handle any trades / orders affected by this order
        for(var index in data.meta.AffectedNodes) {
          var n = undefined;
          var node = data.meta.AffectedNodes[index];
          if('DeletedNode' in node) {
            n = node.DeletedNode;
            if(!('PreviousFields' in n)) {
              // user has killed there own order on the other book, remove it
              this.deleteOrder(n.FinalFields.Account + '#' + n.FinalFields.Sequence);
              continue;
            }
          }
          if('ModifiedNode' in node) n = node.ModifiedNode;
          if(!n || n.LedgerEntryType != 'Offer') continue;
          if(!('TakerGets' in n.PreviousFields) || !('TakerPays' in n.PreviousFields)) continue;
          var oldorder = this.createOrder(n.PreviousFields, book == 1 ? 2 : 1);
          var neworder = this.createOrder(n.FinalFields, book == 1 ? 2 : 1);
          var traded = {
            gets: oldorder.gets - neworder.gets,
            pays: oldorder.pays - neworder.pays,
            rate: oldorder.rate,
          };
          if('ModifiedNode' in node) this.saveOrder(n.FinalFields, book == 1 ? 2 : 1);
          if('DeletedNode' in node) this.deleteOrder(n.FinalFields.Account + '#' + n.FinalFields.Sequence);
          this.notifyTrade(traded, book);          
        }
        // add the newly created order, or what's left of it.
        for(var index in data.meta.AffectedNodes) {
          var n = undefined;
          var node = data.meta.AffectedNodes[index];
          if('CreatedNode' in node) n = node.CreatedNode;
          if(!n || n.LedgerEntryType != 'Offer') continue;
          var nn = 'NewFields' in n ? n.NewFields : n.FinalFields;
          if(!('TakerGets' in nn) || !('TakerPays' in nn)) continue;
          var neworder = this.saveOrder(nn, book);
          this.notifyOrder(neworder, book);          
        }
        return;
      }
      
    }
  };

  var ob = new OrderBook(config);

  function rk(v) {
    return Math.floor(v/10000)*10 + 'k';
  }

  ob.connect(function(books) {
    var factor = 1.75;
    var stats = {
      buy: {250000: 0, 500000: 0, 750000: 0, 1750000: 0},
      sell: {250000: 0, 500000: 0, 750000: 0, 1750000: 0},
      av: {},
      supply: { 10: 0, 25: 0 },
      demand: { 10: 0, 25: 0 }
    };
    // BIDS
    var coredata = [];
    var keys = [];
    var biddata = [];	
    var chartdata = [];
    var total = 0;
    for(var i in books.bids) {
      var floored = Math.floor(books.bids[i].rate);
      if(floored == 0 ) continue; // ignore 0 offers
      if (typeof coredata[floored] == 'undefined') {
        coredata[floored] = 0;
        keys.push(floored);
      }
      coredata[floored] += books.bids[i].gets;
    }
    keys.sort(function(a, b) { return a - b; }).reverse();
    var bottomlimits = {
      chart: Math.floor(parseFloat(keys[0]) / factor),
      10: Math.floor(parseFloat(keys[0]) / 1.1),
      25: Math.floor(parseFloat(keys[0]) / 1.25),
    }
    for(var x in keys) {
      if(keys[x] < bottomlimits.chart) continue;
      biddata.push({
        price: keys[x].toFixed(0), 
        amount: (coredata[keys[x]] / keys[x]).toFixed(5),
        value: (coredata[keys[x]]).toFixed(2)
      });
      total += (coredata[keys[x]]);
      if(keys[x] >= bottomlimits[10]) stats.supply[10] = total;
      if(keys[x] >= bottomlimits[25]) stats.supply[25] = total;
      if(total >= 250000 && stats.buy['250000'] == 0) stats.buy['250000'] = keys[x];
      if(total >= 500000 && stats.buy['500000'] == 0) stats.buy['500000'] = keys[x];
      if(total >= 750000 && stats.buy['750000'] == 0) stats.buy['750000'] = keys[x];
      if(total >= 1750000 && stats.buy['1750000'] == 0) stats.buy['1750000'] = keys[x];
      chartdata.push([ keys[x], Math.floor(total) ]);
    }
    chartdata.reverse();

    //ASKS
    coredata = [];
    keys = [];
    total = 0;
    var askdata = [];
    for ( var i in books.asks) {
      var ceiled = Math.ceil(books.asks[i].rate);
      if(ceiled == 0 ) continue; // ignore 0 offers
      if (typeof coredata[ceiled] == 'undefined') {
        coredata[ceiled] = 0;
        keys.push(ceiled);
      }
      coredata[ceiled] += books.asks[i].pays;
    }
    keys.sort(function(a, b) { return a - b; });
    var toplimits = {
      chart: Math.floor(parseFloat(keys[0]) * factor),
      10: Math.floor(parseFloat(keys[0]) * 1.1),
      25: Math.floor(parseFloat(keys[0]) * 1.25)
    }
    for(var x in keys) {
      if(keys[x] > toplimits.chart) continue;
      askdata.push({
        price: keys[x].toFixed(0), 
        amount: (coredata[keys[x]] / keys[x]).toFixed(5),
        value: (coredata[keys[x]]).toFixed(2)
      });
      total += (coredata[keys[x]]);
      if(keys[x] <= toplimits[10]) stats.demand[10] = total;
      if(keys[x] <= toplimits[25]) stats.demand[25] = total;
      if(total >= 250000 && stats.sell['250000'] == 0) stats.sell['250000'] = keys[x];
      if(total >= 500000 && stats.sell['500000'] == 0) stats.sell['500000'] = keys[x];
      if(total >= 750000 && stats.sell['750000'] == 0) stats.sell['750000'] = keys[x];
      if(total >= 1750000 && stats.sell['1750000'] == 0) stats.sell['1750000'] = keys[x];
      chartdata.push([ keys[x], Math.floor(total) ]);
    }
	for(var kk in stats.buy) {
      stats.av[kk] = stats.buy[kk] + ((stats.sell[kk] - stats.buy[kk])/2);
    }
    $scope.biddata = biddata;
    $scope.askdata = askdata;
    $scope.supply10 = rk(stats.supply[10]);
    $scope.supply25 = rk(stats.supply[25]);
    $scope.demand10 = rk(stats.demand[10]);
    $scope.demand25 = rk(stats.demand[25]);
    $scope.center10 = stats.av[250000];
    $scope.center25 = stats.av[750000];
    $scope.data = {
      chart: {
        type: 'area'
      },

      title: {
        text: 'Orderbook'
      },

      xAxis: {
        labels: {
          formatter : function() {
            return this.value
          }
        }
      },

      yAxis: {
        title: {
          text: ''
        },
        plotLines: [{
          value: 0,
          width: 1,
          color: '#808080'
        }]
      },
      plotOptions: {
        area: {
          marker: {
            enabled: false,
            states: {
              hover: {
                enabled: true
              }
            }
          }
        }
      },
      tooltip: {
        borderColor: "#2F7ED8",
        crosshairs: true
      },

      series: [{
          name: $scope.secondcurrency,
          data: chartdata
      }]
    };	
  });
}
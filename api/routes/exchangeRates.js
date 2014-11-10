var moment   = require('moment'),
		ripple   = require('ripple-lib'),
		async    = require('async'),
		_        = require('lodash'),
		utils    = require('../utils'),
		request  = require('request');


/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, returning both a volume weighted average and last price
 *  or the midpoint of the weighted averages of the bid and ask for the given pair
 *
 *  expects params to have with live = false:
 *  {
 *    pairs    : [
 *      {
 *        base    : {currency:'USD','issuer':'bitstamp'},
 *        counter : {currency:'BTC','issuer':'bitstamp'}
 *      },
 *      {
 *        base    : {currency:'CNY','issuer':'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
 *        counter : {currency:'XRP'}
 *      }
 *    ],
 *    live: false
 *  
 *    base    : {currency:'CNY','issuer':'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //required if 'pairs' not present, for a single currency pair exchange rate
 *    counter : {currency:'XRP'}, //require if 'pairs' not present, for a single currency pair exchange rate
 *    range   : 'hour', 'day', 'week', 'month', year',  //time range to average the price over, defaults to 'day'
 *    last    : (boolean) retreive the last traded price only (faster query)
 *    live    : (boolean) decides whether to check for depth or not
 *  }
 * 
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base    : {currency:'CNY','issuer':'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK','name':'rippleCN'},
 *        counter : {currency:'XRP'},
 *        rate    : //volume weighted average price
 *        last    : //last trade price
 *        range   : 'hour', 'day', 'month', year' - from request
 *      },
 * 
 *      ....
 *    ] 
 *  }
 *  
 *  expects params to have with live = true:
 *  if depth is not given but live == true, the midpoint of the best bid and ask will be returned
 *  {
 *    pairs    : [
 *      {
 *        base    : {currency:'USD','issuer':'bitstamp'},
 *        counter : {currency:'BTC','issuer':'bitstamp'}
 *        depth   : 10
 *      },
 *      {
 *        base    : {currency:'CNY','issuer':'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
 *        counter : {currency:'XRP'},
 *        depth   : 100
 *      }
 *    ],
 *    live: true
 *  
 *    base    : {currency:'CNY','issuer':'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //required if 'pairs' not present, for a single currency pair exchange rate
 *    counter : {currency:'XRP'}, //require if 'pairs' not present, for a single currency pair exchange rate
 *    live    : (boolean) decides whether to check for depth or not
 *  }
 * 
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base    : {currency:'CNY','issuer':'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK','name':'rippleCN'},
 *        counter : {currency:'XRP'},
 *        rate    : //midpoint weighted average price of bid and ask
 *        depth   : //amount of currency the exchange rate is being checked for
 *      },
 * 
 *      ....
 *    ] 
 *  }
	curl -H 'Content-Type: application/json' -X POST -d '{
		'pairs' : [{
			'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
			'counter':{'currency':'XRP'},
			'depth':1
		},
		{
			'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
			'counter':{'currency':'XRP'},
			'depth':10
		},
		{
			'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
			'counter':{'currency':'XRP'},
			'depth':50
		},
		{
			'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
			'counter':{'currency':'XRP'},
			'depth':100
		}],
		'live':true 
	}' http://localhost:5993/api/exchangerates

  curl -H 'Content-Type: application/json' -X POST -d '{
    'pairs' : [{
      'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      'counter':{'currency':'XRP'}
    },
    {
      'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      'counter':{'currency':'XRP'}
    },
    {
      'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      'counter':{'currency':'XRP'}
    },
    {
      'base':{'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      'counter':{'currency':'XRP'}
    }] 
  }' http://localhost:5993/api/exchangerates

	curl -H 'Content-Type: application/json' -X POST -d '{

		'base'    : {'currency':'BTC','issuer':'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
		'counter' : {'currency':'XRP'},
		'last'    : true
 
	}' http://localhost:5993/api/exchangerates
		
 */

function exchangeRates (params, callback) {
	var pairs, 
			startTime, 
			list = [],
			endTime = moment.utc(),
			range   = params.range || 'day',
			live = params.live; 
	
	if (params.last)         startTime = moment.utc('Jan 1 2013 z');
	else if (range == 'hour')  startTime = moment.utc().subtract('hours', 1);
	else if (range == 'day')   startTime = moment.utc().subtract('days', 1);
	else if (range == 'week')  startTime = moment.utc().subtract('weeks', 1);
	else if (range == 'month') startTime = moment.utc().subtract('months', 1);
	else if (range == 'year')  startTime = moment.utc().subtract('years', 1);
	else { 
		
		//invalid range
		return callback('invalid time range'); 
	}
	
	if (params.pairs && Array.isArray(params.pairs)) 
		pairs = params.pairs;
	else if (params.base && params.counter) 
		pairs = [{base:params.base,counter:params.counter, depth:params.depth}];
	else 
		return callback('please specify a list of currency pairs or a base and counter currency');

	//invalid number of pairs
	if (list.length > 50) return callback('cannot retrieve more than 50 pairs');

	pairs.forEach(function(pair) {
		var depth,
				currencyPair = parseCurrencyPair(pair);

		if (currencyPair) {
			if (live) {
				if (pair.depth) {
					depth = pair.depth;
					//invalid depth
					if (depth <= 0) return callback('invalid depth');
					currencyPair.depth = depth;
				}
			}
			list.push(currencyPair);
		}
		else { 
			//invalid currency pair
			return callback('invalid currency pair: ' + JSON.stringify(pair));
		}
	});

	async.mapLimit(list, 50, function(pair, asyncCallbackPair) {
		if (live) {
			midpoint_rate(pair, pair.depth, function(error, avg) {
				if (error) return asyncCallbackPair(error);
				else{
					pair.rate = avg;
					asyncCallbackPair(null, pair);
				}
			});
		}
		else{
			var options = {
			base      : pair.base,
			counter   : pair.counter,
			startTime : startTime,
			endTime   : endTime,      
			};
		
			if (params.last) {
				options.reduce     = false;
				options.limit      = 1,
				options.descending = true;
			} else {
				options.timeIncrement = 'all';  
			}
			
			require('./offersExercised')(options, function(error, data) {

				if (error) return asyncCallbackPair(error);

				if (params.last) {
						pair.last = data && data.length > 1 ? data[1][1] : 0;
					
				} else {
					if (data && data.length > 1) {
						pair.rate = data[1][8]; // volume weighted average price
						pair.last = data[1][7]; // close price
					} else {
						pair.rate = 0;
					}
				}
				asyncCallbackPair(null, pair);
			});
		}
	}, function(error, results) {
		if (error) return callback(error);
		var finalResults = _.filter(results, function(result) { return result.rate !== 0; });
		return callback (null, finalResults);
	});
}

function midpoint_rate(pair, depth, mpCallback) {  
	var bid = call_builder('bid', pair),
			ask = call_builder('ask', pair);
	
	//Make both bid and ask api calls in parallel and process the results
	async.parallel({
			bid_avg: function(callback) {
				process_offers(bid, 'bid', depth, function(error, br) {
					if (!error) callback(null, br);
					else callback(error);
				});
			},
			ask_avg: function(callback) {
				process_offers(ask, 'ask', depth, function(error, ar) {
					if (!error) callback(null, ar);
					else callback(error);
				});
			}
	},
	//Return results
	function(error, results) {
		if (error) mpCallback(error);
		else{
			var midpoint = (results.bid_avg + results.ask_avg)/2;
			mpCallback(null, midpoint);
		}
	});
}

//Make api call to rippled to get orderbooks
function process_offers(json, ba, depth, callback) {
	request.post(
		'http://s1.ripple.com:51234/',
		{json: json},
		function (error, response, body) {
			if (!error) {
				var offers = body.result.offers;
				weighted_average(offers, ba, depth, function(error, wavg) {
					if(!error) callback(null, wavg);
					else callback(error);
				});
			}
			else{
				callback(error);
			}
		}
	);
}

//Find weighted average given offers
function weighted_average(offers, ba, depth, callback) {
	var taker_gets, 
			taker_pays,
			total = 0,
			waverage = 0;
	//Iterate through offers
	for (var index in offers) {
		var exchange, 
				value;
		//Check whether TakerGets and TakerPays are objects or integers
		if (typeof(offers[index].TakerGets)==='object') taker_gets = offers[index].TakerGets.value;
		else taker_gets = offers[index].TakerGets/1000000;
		if (typeof(offers[index].TakerPays)==='object') taker_pays =  offers[index].TakerPays.value;
		else taker_pays =  offers[index].TakerPays/1000000;
		//Bid or Ask
		if (ba === 'bid') {
			exchange = taker_gets/taker_pays;
			value = Number(taker_pays);
		}
		else {
			exchange = taker_pays/taker_gets;
			value = Number(taker_gets);
		}
		//If depth is 0, then we only need first offer
		if(!depth) {
			return callback(null, exchange);
		}
		//Check if you're going to go over the depth.
		if (total+value > depth) {
			//If you are, find out how much you need to get to depth.
			value = depth-total;
		}
		//Add weighted exchange rate
		waverage += exchange * (value/depth);
		total += value;
		//If depth has been reached, break.
		if (total >= depth) {
			break;
		}
	}
	//If limit of offers is reached and depth hasnt been reached, return error
	if (total < depth && offers.length > 299) {
		return callback('cannot retrieve more than 300 orders');
	}
	//If the given depth cannot be reached, return error
	else if (total < depth) {
		return callback('cannot retrieve offers with such a high depth');
	}

	return callback(null, waverage);
}

//Builds API call based on currencies provided (xrp has no issuer)
function call_builder(ba, pair) {
	var currencyPair = parseCurrencyPair(pair),
			tg, 
			tp, 
			call;
	if (ba === 'ask') {
		tg = currencyPair.base;
		tp = currencyPair.counter;
	}
	else {
		tg = currencyPair.counter;
		tp = currencyPair.base;
	}
	call = {
		'method': 'book_offers',
		'params': 
		[
			{
				'taker_gets': tg,
				'taker_pays': tp,
			}
		]
	};
	return call;
}

/* HELPER FUNCTIONS */

//format valid currency pairs, reject invalid
function parseCurrencyPair (pair) {
	var base, 
			counter;
	
	if (!pair.base|| !pair.counter) return;
	
	base  = parseCurrency(pair.base);
	counter = parseCurrency(pair.counter); 
	
	if (!base || !counter) return;
	return {base:base,counter:counter};
}

//format valid currency-issuer combinations, reject invalid
function parseCurrency (c) {
	var currency,
			name,
			issuer;
		
	if (!c.currency) return;
	else {
		currency = c.currency.toUpperCase();
		
		if (currency == 'XRP') {
			if (c.issuer) return null;   //XRP should not have an issuer
			return {currency:'XRP'};
		}
		
		else if (currency != 'XRP' && !c.issuer) return null;  //IOUs must have an issuer
		else if (ripple.UInt160.is_valid(c.issuer)) {
		
			issuer = c.issuer;
			name   = utils.getGatewayName(issuer);
			
		} else {  
			
			name   = c.issuer;
			issuer = utils.gatewayNameToAddress(name, currency);
			if (!issuer) return null; //invalid issuer name or address
		} 
	} 
	
	return {currency:currency, issuer:issuer, name:name}; 
}

module.exports = exchangeRates;
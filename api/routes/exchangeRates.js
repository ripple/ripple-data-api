var moment = require('moment'),
	ripple   = require('ripple-lib'),
	async    = require('async'),
	_        = require('lodash'),
	utils    = require('../utils'),
	request = require('request');


/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, returning both a volume weighted average and last price
 *
 *  expects params to have:
 *  {
 *    pairs    : [
 *      {
 *        base    : {currency:"USD","issuer":"bitstamp"},
 *        counter : {currency:"BTC","issuer":"bitstamp"}
 *      },
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
 *        counter : {currency:"XRP"}
 *      }
 *    ]
 *  
 *    base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}, //required if "pairs" not present, for a single currency pair exchange rate
 *    counter : {currency:"XRP"}, //require if "pairs" not present, for a single currency pair exchange rate
 *    range   : "hour", "day", "week", "month", year",  //time range to average the price over, defaults to "day"
 *    last    : (boolean) retreive the last traded price only (faster query)  
 *  }
 * 
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK","name":"rippleCN"},
 *        counter : {currency:"XRP"},
 *        rate    : //volume weighted average price
 *        last    : //last trade price
 *        range   : "hour", "day", "month", year" - from request
 *      },
 * 
 *      ....
 *    ] 
 *  }
 * 
	curl -H "Content-Type: application/json" -X POST -d '{
		"pairs" : [{
			"base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
			"counter":{"currency":"XRP"}
		},
		{
			"base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
			"counter":{"currency":"XRP"}
		},
		{
			"base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
			"counter":{"currency":"XRP"}
		},
		{
			"base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
			"counter":{"currency":"XRP"}
		}] 
	}' http://localhost:5993/api/exchangerates

	curl -H "Content-Type: application/json" -X POST -d '{

		"base"    : {"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
		"counter" : {"currency":"XRP"},
		"last"    : true
 
	}' http://localhost:5993/api/exchangerates
		
 */

function exchangeRates (params, callback) {
	var list;
	if (params.pairs && Array.isArray(params.pairs)) 
		list = params.pairs;
	else if (params.base && params.counter) 
		list = [{base:params.base,counter:params.counter}];
	else 
		return callback('please specify a list of currency pairs or a base and counter currency');

	if (list.length>50) return callback("cannot retrieve more than 50 pairs");

	if (params.depth){
		depth = params.depth;
		if (depth < 0) return callback("invalid depth");
	}
	else depth = 0;

	async.mapLimit(list, 50, function(pair, asyncCallbackPair){
		midpoint_rate(pair, depth, function(error, avg){
			if (error) return asyncCallbackPair(error);
			else{
				pair.rate = avg;
				asyncCallbackPair(null, pair);
			}
		});
		}, function(error, results){
			if (error) return callback(error);
			var finalResults = _.filter(results, function(result){ return result.rate !== 0; });
			return callback (null, finalResults);
	});
}

/* HELPER FUNCTIONS */

function midpoint_rate(pair, depth, mpCallback){
	var results = {};   

	bid = call_builder('bid', depth, pair);
	ask = call_builder('ask', depth, pair);
	
	//Make both bid and ask api calls in parallel and process the results
	async.parallel({
			bid_avg: function(callback){
				process_offers(bid, 'bid', depth, function(error, br){
					if (!error) callback(null, br);
					else callback(error);
				})
			},
			ask_avg: function(callback){
				process_offers(ask, 'ask', depth, function(error, ar){
					if (!error) callback(null, ar);
					else callback(error);
				})
			}
	},
	//Return results
	function(error, results) {
		if (error) mpCallback(error);
		else{
			midpoint = (results.bid_avg+results.ask_avg)/2;
			mpCallback(null, midpoint)
		}
	});
}

//Make api call to rippled to get orderbooks
function process_offers(json, ba, depth, callback){
	request.post(
		'http://s1.ripple.com:51234/',
		{json: json},
		function (error, response, body) {
			if (!error) {
				weighted_average(body.result.offers, ba, depth, function(error, wavg){
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
function weighted_average(offers, ba, depth, callback){
	var rates = [];
	var total = 0;
	var waverage = 0;
	for(var index in offers) {
		//Check whether TakerGets and TakerPays are objects or integers
		if (typeof(offers[index].TakerGets)==='object') taker_gets = offers[index].TakerGets.value;
		else taker_gets = offers[index].TakerGets/1000000;
		if (typeof(offers[index].TakerPays)==='object') taker_pays =  offers[index].TakerPays.value;
		else taker_pays =  offers[index].TakerPays/1000000;
		//Bid or Ask
		if (ba === "bid"){
			exchange = taker_gets/taker_pays;
			value = parseFloat(taker_pays);
		}
		else {
			exchange = taker_pays/taker_gets;
			value = parseFloat(taker_gets);
		}
		//If depth is 0, then we only need first offer
		if(depth === 0){
			console.log("taking only 1");
			return callback(null, exchange)
		}
		//Check if you're going to go over the depth.
		if (total+value > depth){
			//If you are, find out how much you need to get to depth.
			value = depth-total;
		}
		//Add weighted exchange rate
		waverage += exchange * (value/depth);
		total += value;
		//If depth has been reached, break.
		if (total >= depth){
			break;
		}
	}
	//If limit of offers is reached and depth hasnt been reached, return error
	if (total < depth && offers.length > 299){
		return callback('cannot retrieve more than 300 orders');
	}
	//If the given depth cannot be reached, return error
	else if (total < depth){
		return callback('cannot retrieve offers with such a high depth');
	}

	return callback(null, waverage);
}

//Builds API call based on currencies provided (xrp has no issuer)
function call_builder(ba, depth, pair){
	var currencyPair = parseCurrencyPair(pair);
	if (ba === 'ask'){
		tg = currencyPair.base;
		tp = currencyPair.counter;
	}
	else {
		tg = currencyPair.counter;
		tp = currencyPair.base;
	}
	call = {
		"method": "book_offers",
		"params": 
		[
			{
				"taker_gets": tg,
				"taker_pays": tp,
				//"limit": depth
			}
		]
	}
	return call
}

//format valid currency pairs, reject invalid
function parseCurrencyPair (pair) {
	var base, counter;
	
	if (!pair.base|| !pair.counter) return;
	
	base  = parseCurrency(pair.base);
	counter = parseCurrency(pair.counter); 
	
	if (!base || !counter) return;
	return {base:base,counter:counter};
}

//format valid currency-issuer combinations, reject invalid
function parseCurrency (c) {
	var currency,name,issuer;
		
	if (!c.currency) return;
	else {
		currency = c.currency.toUpperCase();
		
		if (currency == "XRP") {
			if (c.issuer) return null;   //XRP should not have an issuer
			return {currency:"XRP"};
		}
		
		else if (currency != "XRP" && !c.issuer) return null;  //IOUs must have an issuer
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
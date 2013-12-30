/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;

/* Loading ripple-lib in a webpage */
// var Remote = ripple.Remote;
// var Amount = ripple.Amount;

var listener = new OffersExercisedListener({
  base: {currency: "XRP"},
  trade: {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
  reduce: true
}, function(data){
  console.log(JSON.stringify(data));
});

// setTimeout(function(){
//   listener.changeViewOpts({
//     base: {currency: "XRP"},
//     trade: {currency: "BTC", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}
//   });  
// }, 5000);


/**
 *  createOffersExercisedListener listens to the live transaction feed,
 *  parses offersExercised events, and passes the parsed data to the
 *  given displayFn
 *
 *  Available options include:
 *  {
 *    base: {currency: "XRP"},
 *    trade: {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *    
 *    reduce: true/false, // optional, defaults to false
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional
 *    timeMultiple: positive integer
 *  }
 */
function OffersExercisedListener(opts, displayFn) {

  if (typeof opts === 'function') {
    displayFn = opts;
    opts = {};
  }

  this.viewOpts = opts;
  this.displayFn = displayFn;

  this.remote = new Remote({
      // trace: true,
      servers: [{
          host: 's_west.ripple.com',
          port: 443
      }]
  });

  this.remote.connect();

  this.txProcessor = createTransactionProcessor(this.viewOpts, displayFn);

  this.remote.on('transaction_all', this.txProcessor);
}

OffersExercisedListener.prototype.changeViewOpts = function(newOpts) {
  console.log('changing view opts');

  this.viewOpts = newOpts;
  this.remote.removeListener('transaction_all', this.txProcessor);

  this.txProcessor = createTransactionProcessor(this.viewOpts);
  this.remote.on('transaction_all', this.txProcessor);
}



function createTransactionProcessor(viewOpts, displayFn) {

  var storedResults;
  
  function txProcessor (txData){

    var txContainer = {
      close_time_timestamp: (new Date()).getTime(),
      transactions: [txData.transaction]
    };
    txContainer.transactions[0].metaData = txData.meta;

    // use the map function to parse txContainer data
    offersExercisedMap(txContainer, function(key, value){
      if (viewOpts.base.currency === key[0][0] && (viewOpts.base.currency === 'XRP' || viewOpts.base.issuer === key[0][1])) {
        
        // use reduce function in 'reduce' mode to get initial values
      
        if (!viewOpts.reduce) {

          displayFn({key: key, value: value});
          return;

        } else {

          var reduceRes = offersExercisedReduce([[key]], [value], false);

          // use reduce function in 'rereduce' mode to compact values
          if (storedResults) {
            storedResults = offersExercisedReduce(null, [storedResults, reduceRes], true)
          } else {
            storedResults = reduceRes;
          }

          // TODO check if it's time to call the displayFn based on the timeInterval

          // if (!viewOpts.timeIncrement 
          //   || viewOpts.timeIncrement.toLowerCase().slice(0, 2) === 'al' 
          //   || viewOpts.timeIncrement.toLowerCase().slice(0, 2) === 'no') {

          //   displayFn(storedResults);
          //   storedResults = null;
          // }

          console.log('storedResults now: ' + JSON.stringify(storedResults));

        }  
      }
    });
  }

  return txProcessor;
}




/**
 *  offersExercisedMap is, with two exceptions, the same as the
 *  map function used in the CouchDB view offersExercised
 *
 *  the only two exceptions are 'emit' as a parameter and
 *  the line that parses the exchange_rate
 */
function offersExercisedMap(doc, emit) {

    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(),
            time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()
        ];

    doc.transactions.forEach(function(tx) {

        if (tx.metaData.TransactionResult !== 'tesSUCCESS') {
            return;
        }

        if (tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate') {
            return;
        }

        tx.metaData.AffectedNodes.forEach(function(affNode) {

            var node = affNode.ModifiedNode || affNode.DeletedNode;

            if (!node || node.LedgerEntryType !== 'Offer') {
                return;
            }

            if (!node.PreviousFields || !node.PreviousFields.TakerPays || !node.PreviousFields.TakerGets) {
                return;
            }

            // parse exchange_rate
            // note: this block was inserted in addition to what is used in CouchDB
            if ((node.FinalFields || node.NewFields) && typeof(node.FinalFields || node.NewFields).BookDirectory === "string") {
                node.exchange_rate = Amount.from_quality((node.FinalFields || node.NewFields).BookDirectory).to_json().value;
            }

            var exchangeRate = node.exchange_rate,
                payCurr,
                payAmnt,
                getCurr,
                getAmnt;

            if (typeof node.PreviousFields.TakerPays === "object") {
                payCurr = [node.PreviousFields.TakerPays.currency, node.PreviousFields.TakerPays.issuer];
                payAmnt = node.PreviousFields.TakerPays.value - node.FinalFields.TakerPays.value;
            } else {
                payCurr = ["XRP"];
                payAmnt = (node.PreviousFields.TakerPays - node.FinalFields.TakerPays) / 1000000.0; // convert from drops
                exchangeRate = exchangeRate / 1000000.0;
            }

            if (typeof node.PreviousFields.TakerGets === "object") {
                getCurr = [node.PreviousFields.TakerGets.currency, node.PreviousFields.TakerGets.issuer];
                getAmnt = node.PreviousFields.TakerGets.value - node.FinalFields.TakerGets.value;
            } else {
                getCurr = ["XRP"];
                getAmnt = (node.PreviousFields.TakerGets - node.FinalFields.TakerGets) / 1000000.0;
                exchangeRate = exchangeRate * 1000000.0;
            }

            emit([payCurr, getCurr].concat(timestamp), [payAmnt, getAmnt, exchangeRate]);
            emit([getCurr, payCurr].concat(timestamp), [getAmnt, payAmnt, 1 / exchangeRate]);
        });
    });
}

/**
 *  offersExercisedReduce is the same reduce function used by the 
 *  offersExercised view in CouchDB
 */
function offersExercisedReduce(keys, values, rereduce) {

    var stats;

    if (!rereduce) {

        var firstTime = keys[0][0].slice(2),
            firstPrice;

        if (values[0][2]) { // exchangeRate
            firstPrice = parseFloat(values[0][2]);
        } else {
            firstPrice = values[0][0] / values[0][1];
        }

        // initial values
        stats = {
            openTime: firstTime,
            closeTime: firstTime,

            open: firstPrice,
            close: firstPrice,
            high: firstPrice,
            low: firstPrice,

            curr1VwavNumerator: 0,
            curr1Volume: 0,
            curr2Volume: 0,
            numTrades: 0
        };

        values.forEach(function(trade, index) {

            var tradeTime = keys[index][0].slice(2),
                tradeRate = trade[2] || (trade[0] / trade[1]);

            if (lessThan(tradeTime, stats.openTime)) {
                stats.openTime = tradeTime;
                stats.open = tradeRate;
            }

            if (lessThan(stats.closeTime, tradeTime)) {
                stats.closeTime = tradeTime;
                stats.close = tradeRate;
            }

            stats.high = Math.max(stats.high, tradeRate);
            stats.low = Math.min(stats.low, tradeRate);
            stats.curr1VwavNumerator += tradeRate * trade[0];
            stats.curr1Volume += trade[0];
            stats.curr2Volume += trade[1];
            stats.numTrades++;

        });

        stats.volumeWeightedAvg = stats.curr1VwavNumerator / stats.curr1Volume;

        return stats;

    } else {

        stats = values[0];

        values.forEach(function(segment, index) {

            // skip values[0]
            if (index === 0) {
                return;
            }

            if (lessThan(segment.openTime, stats.openTime)) {
                stats.openTime = segment.openTime;
                stats.open = segment.open;
            }
            if (lessThan(stats.closeTime, segment.closeTime)) {
                stats.closeTime = segment.closeTime;
                stats.close = segment.close;
            }

            stats.high = Math.max(stats.high, segment.high);
            stats.low = Math.min(stats.low, segment.low);

            stats.curr1VwavNumerator += segment.curr1VwavNumerator;
            stats.curr1Volume += segment.curr1Volume;
            stats.curr2Volume += segment.curr2Volume;
            stats.numTrades += segment.numTrades;

        });

        stats.volumeWeightedAvg = stats.curr1VwavNumerator / stats.curr1Volume;

        return stats;
    }


    function lessThan(arr1, arr2) {
        if (arr1.length !== arr2.length)
            return false;

        for (var i = 0; i < arr1.length; i++) {
            if (arr1[i] < arr2[i]) {
                return true;
            } else if (arr1[i] > arr2[i]) {
                return false;
            } else {
                continue;
            }
        }

        return false;
    }
}


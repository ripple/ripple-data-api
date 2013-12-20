var request = require('request'),
  moment = require('moment'),
  ripple = require('ripple-lib'),
  Ledger = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger;

var rippleds = [
  'http://0.0.0.0:51234',
  'http://ct.ripple.com:51234',
  'http://s_west.ripple.com:51234',
  'http://s_east.ripple.com:51234'
  ];


var start = moment();

getLedgerBatch({batchSize: 1000, minLedgerIndex: 3983700}, function(err, res){
  if (err) {
    console.log(err);
    return;
  }
  console.log('Got ' + res.length + ' ledgers.');
  console.log('Process took: ' + moment().diff(start, 'seconds') + ' seconds.');
});

/**
 *  getLedgerBatch starts from a specified ledger or the most recently
 *  closed one and uses the rippled API to get the batch of ledgers
 *  one by one, walking the ledger hash chain backwards until it reaches the minLedger
 *
 *  available options:
 *  {
 *    lastLedger: ledger_hash or ledger_index, defaults to last closed ledger
 *    batchSize: number, defaults to 1000
 *    minLedgerIndex: number, if none given it will stop after a single batch
 *  }
 */
function getLedgerBatch (opts, callback) {

  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  if (!opts.lastLedger) {
    opts.lastLedger = null;
  }

  if (!opts.batchSize) {
    opts.batchSize = 1000;
  }

  if (!opts.results) {
    opts.results = [];
  }

  // get ledger from rippled API
  getLedger(opts.lastLedger, function(err, ledger){
    if (err) {
      callback(err);
      return;
    }

    if (!opts.minLedgerIndex) {
      opts.minLedgerIndex = ledger.ledger_index - opts.batchSize + 1;
    }

    if (opts.minLedgerIndex < 32570) {
      opts.minLedgerIndex = 32570;
    }

    opts.results.push(ledger);
    opts.lastLedger = ledger.parent_hash;


    // if the number of results exceeds the batch size or
    // if the process has reached the minLedgerIndex,
    // call the callback with the results
    if (opts.batchSize <= opts.results.length || opts.minLedgerIndex >= ledger.ledger_index) {
      callback(null, opts.results.slice());
      opts.results = [];
    }

    // if the process has not yet reached the minLedgerIndex
    // continue with the next ledger
    if (opts.minLedgerIndex < ledger.ledger_index) {
      setImmediate(function(){
        getLedgerBatch(opts, callback);
      });
    }

  });

}

function getLedger (identifier, callback, serverNum) {

  if (typeof identifier === 'function' && !callback) {
    callback = identifier;
    identifier = null;
  }

  if (serverNum && serverNum >= rippleds.length) {
    callback(new Error('could not get ledger: ' + identifier + ' from any of the rippleds'));
    return;
  }

  var reqData = { 
    'method' : 'ledger', 
    'params' : [ { 
      'transactions': true, 
      'expand': true
      } ] };

  // set reqData params based on identifier, default to 'closed' if none is specified
  if (typeof identifier === 'number') {
    reqData.params[0].ledger_index = identifier;
  } else if (typeof identifier === 'string') {
    reqData.params[0].ledger_hash = identifier;
  } else {
    reqData.params[0].ledger_index = 'closed';
  }

  var server = rippleds[(serverNum ? serverNum : 0)];

  // get ledger using JSON API
  request({
    url: server,
    method: 'POST',
    json: reqData
  }, function(err, res){
    if (err) {
      console.log('Error getting ledger: ' + (reqData.params[0].ledger_index || reqData.params[0].ledger_hash) + 
        ' from server: ' + server + ' err: ' + JSON.stringify(err) + '\nTrying next server...');
      setImmediate(function(){
        getLedger (identifier, callback, serverNum + 1);
      });
      return;
    }

    if (typeof res.body === 'string') {
      // TODO consider changing this to try the next server
      console.log('rippled returned a buffer instead of a JSON object. Trying again...');
      setImmediate(function(){
        getLedger (identifier, callback, serverNum);
      });
      return;
    }

    if (!res || !res.body || !res.body.result || (!res.body.result.ledger && !res.body.result.closed)) {
      console.log('error getting ledger ' + (identifier || 'closed') + ', server responded with: ' + JSON.stringify(res));
      setImmediate(function(){
        getLedger (identifier, callback, serverNum + 1);
      });
      return;
    }

    var remoteLedger = (res.body.result.closed ? res.body.result.closed.ledger : res.body.result.ledger),
      ledger = formatRemoteLedger(remoteLedger);

    // check that transactions hash to the expected value
    var ledgerJsonTxHash = Ledger.from_json(ledger).calc_tx_hash().to_hex();
    if (ledgerJsonTxHash !== ledger.transaction_hash) {

      cconsole.log('transactions do not hash to the expected value for ' + 
        'ledger_index: ' + ledger.ledger_index + '\n' +
        'ledger_hash: ' + ledger.ledger_hash + '\n' +
        'actual transaction_hash:   ' + ledgerJsonTxHash + '\n' +
        'expected transaction_hash: ' + ledger.transaction_hash);
      setImmediate(function(){
        getLedger (identifier, callback, serverNum + 1);
      });
      return;
    }

    console.log('Got ledger: ' + ledger.ledger_index);

    callback(null, ledger);

  });

}


function formatRemoteLedger( ledger ) {

  ledger.close_time_rpepoch = ledger.close_time;
  ledger.close_time_timestamp = ripple.utils.toTimestamp( ledger.close_time );
  ledger.close_time_human = moment( ripple.utils.toTimestamp( ledger.close_time ) )
    .utc( ).format( "YYYY-MM-DD HH:mm:ss Z" );
  ledger.from_rippled_api = true;

  delete ledger.close_time;
  delete ledger.hash;
  delete ledger.accepted;
  delete ledger.totalCoins;
  delete ledger.closed;
  delete ledger.seqNum;

  // parse ints from strings
  ledger.ledger_index = parseInt( ledger.ledger_index, 10 );
  ledger.total_coins = parseInt( ledger.total_coins, 10 );

  // add exchange rate field to metadata entries
  ledger.transactions.forEach( function( transaction ) {
    transaction.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;

      if ( node.LedgerEntryType !== "Offer" ) {
        return;
      }

      var fields = node.FinalFields || node.NewFields;

      if ( typeof fields.BookDirectory === "string" ) {
        node.exchange_rate = ripple.Amount.from_quality( fields.BookDirectory )
          .to_json( ).value;
      }

    } );
  } );

  return ledger;
}
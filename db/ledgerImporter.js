var request = require('request'),
  moment = require('moment'),
  ripple = require('ripple-lib'),
  Ledger = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger;

var rippleds = [
  // 'http://0.0.0.0:51234',
  'http://ct.ripple.com:51234',
  'http://s_west.ripple.com:51234',
  'http://s_east.ripple.com:51234'
  ];


var start = moment();

getLedgerBatch({batchSize: 10}, function(err, res){
  if (err) {
    console.log(err);
    return;
  }

  console.log('Process took: ' + moment().diff(start, 'seconds') + ' seconds.');
  // res.forEach(function(ledger){
  //   console.log('index: ' + ledger.ledger_index + ' hash: ' + ledger.ledger_hash + ' prev: ' + ledger.parent_hash);
  // });
});

function getLedgerBatch (opts, callback) {

  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  if (opts.batchSize === 0) {
    callback(null, opts.results);
    return;
  }

  if (!opts.lastLedgerIdentifier) {
    opts.lastLedgerIdentifier = null;
  }

  if (!opts.batchSize) {
    opts.batchSize = 100;
  }

  if (!opts.results) {
    opts.results = [];
  }

  getLedger(opts.lastLedgerIdentifier, function(err, ledger){
    if (err) {
      callback(err);
      return;
    }

    opts.results.push(ledger);
    opts.lastLedgerIdentifier = ledger.parent_hash;
    opts.batchSize = opts.batchSize - 1;

    setImmediate(function(){
      getLedgerBatch(opts, callback);
    });

  });

}

function getLedger (identifier, callback, serverNum) {

  if (typeof identifier === 'function' && !callback) {
    callback = identifier;
    identifier = null;
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
      // XXX
      callback(err);
      return;
    }

    if (typeof res.body === 'string') {
      // XXX
      console.log('rippled returned a buffer instead of a JSON object. Trying again...');
      setImmediate(function(){
        getLedger (identifier, callback, serverNum);
      });
      return;
    }

    if (!res || !res.body || !res.body.result || (!res.body.result.ledger && !res.body.result.closed)) {
      // XXX
      callback(new Error('error getting ledger ' + (identifier || 'closed') + ', server responded with: ' + JSON.stringify(res)));
      return;
    }

    // TODO handle what happens if the server does not have that ledger

    var remoteLedger = (res.body.result.closed ? res.body.result.closed.ledger : res.body.result.ledger),
      ledger = formatRemoteLedger(remoteLedger);

    // check that transactions hash to the expected value
    var ledgerJsonTxHash = Ledger.from_json(ledger).calc_tx_hash().to_hex();
    if (ledgerJsonTxHash !== ledger.transaction_hash) {

      // TODO handle incorrect transaction hash better
      // XXX
      callback(new Error('transactions do not hash to the expected value for ' + 
        'ledger_index: ' + ledger.ledger_index + '\n' +
        'ledger_hash: ' + ledger.ledger_hash + '\n' +
        'actual transaction_hash:   ' + ledgerJsonTxHash + '\n' +
        'expected transaction_hash: ' + ledger.transaction_hash));
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
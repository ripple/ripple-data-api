var request = require('request'),
  moment = require('moment'),
  _ = require('lodash'),
  equal = require('deep-equal'),
  ripple = require('ripple-lib'),
  Ledger = require('../node_modules/ripple-lib/src/js/ripple/ledger').Ledger,
  config = require('./config'),
  nano = require('nano')('http://' + config.couchdb.username + 
    ':' + config.couchdb.password + 
    '@' + config.couchdb.host + 
    ':' + config.couchdb.port),
  db = nano.use(config.couchdb.database);


/**
 *  ledgerImporter.js uses the rippled API to import
 *  ledgers into a CouchDB instance
 *
 *  Available command line options:
 *
 *  - node ledgerImporter.js
 *  - node ledgerImporter.js <minLedger>
 *  - node ledgerImporter.js <minLedger> <lastLedger>
 *  - node ledgerImporter.js <minLedger> <lastLedger> <batchSize>
 *  - node ledgerImporter.js all
 */

var processOptions = {};
if (process.argv.length === 3) {

  if (process.argv[2].toLowerCase() === 'all') {
    processOptions.minLedger = 32570;
  } else {
    processOptions.minLedger = parseInt(process.argv[2], 10);
  }

} else if (process.argv.length === 4) {
  processOptions.lastLedger = Math.max(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
  processOptions.minLedger = Math.min(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
} else if (process.argv.length === 5) {
  processOptions.lastLedger = Math.max(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
  processOptions.minLedger = Math.min(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
  processOptions.batchSize = parseInt(process.argv[4], 10);
}


// if the min ledger is not set, set it to the last ledger saved into CouchDB
// and start the importIntoCouchDb process
if (!processOptions.minLedger) {
  getLastLedgerSavedToCouchDb(function(err, lastLedgerIndex){
    if (err) {
      console.log('problem getting last ledger saved to CouchDB: ' + err);
      return;
    }

    processOptions.minLedger = lastLedgerIndex;
    importIntoCouchDb(processOptions);
  });
} else {
  importIntoCouchDb(processOptions);
}

/**
 *  importIntoCouchDb gets batches of ledgers using the rippled API
 *  and saves them into CouchDB
 *
 *  Available options:
 *  {
 *    lastLedger: ledger_hash or ledger_index, defaults to last closed ledger
 *    batchSize: number, defaults to 1000
 *    minLedger: ledger_hash or ledger_index, if none given it will stop after a single batch
 *  }
 */
function importIntoCouchDb(opts) {

  console.log('Starting importIntoCouchDb at ' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ' with options: ' + JSON.stringify(opts));

  getLedgerBatch(opts, function(err, res){
    if (err) {
      console.log(err);
      return;
    }

    saveBatchToCouchDb(res);
  });
}


/*** LEDGER GETTER FUNCTIONS ***/



/**
 *  getLedgerBatch starts from a specified ledger or the most recently
 *  closed one and uses the rippled API to get the batch of ledgers
 *  one by one, walking the ledger hash chain backwards until it reaches the minLedger
 *
 *  Available options:
 *  {
 *    lastLedger: ledger_hash or ledger_index, defaults to last closed ledger
 *    batchSize: number, defaults to 1000
 *    minLedger: ledger_hash or ledger_index, if none given it will stop after a single batch
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
    opts.batchSize = config.batchSize || 1000;
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

    if (!opts.minLedger) {
      opts.minLedger = ledger.ledger_index - opts.batchSize + 1;
    }

    if (opts.minLedgerIndex < 32570) {
      opts.minLedgerIndex = 32570;
    }

    opts.results.push(ledger);
    opts.lastLedger = ledger.parent_hash;

    // if the number of results exceeds the batch size or
    // if the process has reached the minLedgerIndex,
    // call the callback with the results
    if (opts.batchSize <= opts.results.length || 
      (typeof opts.minLedger === 'string' && opts.minLedger === ledger.ledger_hash) || 
      (typeof opts.minLedger === 'number' && opts.minLedger >= ledger.ledger_index)) {
      callback(null, opts.results.slice());
      opts.results = [];
    }

    // if the process has not yet reached the minLedgerIndex
    // continue with the next ledger
    if (typeof opts.minLedger === 'number' ? opts.minLedger < ledger.ledger_index : opts.minLedger !== ledger.ledger_hash) {
      setImmediate(function(){
        getLedgerBatch(opts, callback);
      });
    }

  });

}


/**
 *  getLedger uses the rippled API to get the ledger
 *  corresponding to the given identifier, or the last 
 *  closed ledger if identifier is null
 *
 *  identifier: ledger_index or ledger_hash
 */
function getLedger (identifier, callback, serverNum) {

  if (typeof identifier === 'function' && !callback) {
    callback = identifier;
    identifier = null;
  }

  if (!serverNum) {
    serverNum = 0;
  } else if (serverNum >= config.rippleds.length) {
    callback(new Error('could not get ledger: ' + identifier + 
      ' from any of the rippleds'));
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

  var server = config.rippleds[(serverNum ? serverNum : 0)];

  if (serverNum > 0) {
    console.log('getting ledger from: ' + server);
  }

  // get ledger using JSON API
  request({
    url: server,
    method: 'POST',
    json: reqData,
    timeout: 20000
  }, requestHandler);

  function requestHandler (err, res) {

    if (err) {
      console.log('Error getting ledger: ' + 
        (reqData.params[0].ledger_index || reqData.params[0].ledger_hash) + 
        ' from server: ' + server + ' err: ' + JSON.stringify(err) + 
        '\nTrying next server...');
      setImmediate(function(){
        getLedger (identifier, callback, serverNum + 1);
      });
      return;
    }

    if (typeof res.body === 'string') {
      // TODO consider changing this to try the next server
      console.log('rippled returned a buffer instead of a JSON object for request: ' + 
        JSON.stringify(reqData.params[0]) + '. Trying again...');
      setImmediate(function(){
        getLedger (identifier, callback, serverNum);
      });
      return;
    }

    if (!res || !res.body || !res.body.result || (!res.body.result.ledger && !res.body.result.closed)) {
      console.log('error getting ledger ' + (identifier || 'closed') + 
        ', server responded with: ' + JSON.stringify(res.error));
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

      console.log('transactions do not hash to the expected value for ' + 
        'ledger_index: ' + ledger.ledger_index + '\n' +
        'ledger_hash: ' + ledger.ledger_hash + '\n' +
        'actual transaction_hash:   ' + ledgerJsonTxHash + '\n' +
        'expected transaction_hash: ' + ledger.transaction_hash);
      setImmediate(function(){
        getLedger (identifier, callback, serverNum + 1);
      });
      return;
    }

    // console.log('Got ledger: ' + ledger.ledger_index);

    callback(null, ledger);

  }

}

/**
 *  formatRemoteLedger makes slight modifications to the
 *  ledger json format, according to the format used in the CouchDB database
 */
function formatRemoteLedger(ledger) {

  ledger.close_time_rpepoch = ledger.close_time;
  ledger.close_time_timestamp = ripple.utils.toTimestamp(ledger.close_time);
  ledger.close_time_human = moment(ripple.utils.toTimestamp(ledger.close_time))
    .utc().format("YYYY-MM-DD HH:mm:ss Z");
  ledger.from_rippled_api = true;

  delete ledger.close_time;
  delete ledger.hash;
  delete ledger.accepted;
  delete ledger.totalCoins;
  delete ledger.closed;
  delete ledger.seqNum;

  // parse ints from strings
  ledger.ledger_index = parseInt(ledger.ledger_index, 10);
  ledger.total_coins = parseInt(ledger.total_coins, 10);

  // add exchange rate field to metadata entries
  ledger.transactions.forEach(function(transaction) {
    transaction.metaData.AffectedNodes.forEach(function(affNode) {

      var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;

      if (node.LedgerEntryType !== "Offer") {
        return;
      }

      var fields = node.FinalFields || node.NewFields;

      if (typeof fields.BookDirectory === "string") {
        node.exchange_rate = ripple.Amount.from_quality(fields.BookDirectory).to_json().value;
      }

    });
  });

  return ledger;
}



/*** COUCHDB FUNCTIONS ***/


/**
 *  getLastLedgerSavedToCouchDb uses the CouchDB changes stream
 *  to identify the last ledger modified in the database
 */
function getLastLedgerSavedToCouchDb(callback) {
  
  // get the most recently changed document ids
  db.changes({
      limit: 20,
      descending: true
    }, function(err, res) {
      if (err) {
        callback(new Error('problem connecting to CouchDB: ' + err));
        return;
      }

      // filter out any design documents that might have been changed
      var changedLedgers = _.filter(res.results, function(doc){
        return (doc.id.indexOf('_design/') === -1 && parseInt(doc.id, 10) > 0);
      });

      // if the database is empty, start from ledger 32570
      if (changedLedgers.length === 0) {
        callback(null, '4109C6F2045FC7EFF4CDE8F9905D19C28820D86304080FF886B299F0206E42B5');
        return;
      }

      // get the ledger hash associated with this ledger
      db.get(changedLedgers[0].id, function(err, res){
        if (err) {
          callback(new Error('problem connecting to CouchDB: ' + err));
          return;
        }

        callback(null, res.ledger_hash);

      });

  });
}


/**
 * addLeadingZeros converts numbers to strings and pads them with
 * leading zeros up to the given number of digits
 */
function addLeadingZeros (number, digits) {

  if (!digits)
    digits = 10;

  var numStr = String(number);

  while(numStr.length < digits) {
    numStr = "0" + numStr;
  }

  return numStr;

}


/**
 *  saveBatchToCouchDb saves all of the new or updated ledgers
 *  in the given batch to the CouchDB instance
 */
function saveBatchToCouchDb (ledgerBatch) {

  // add doc ids to the ledgers
  _.each(ledgerBatch, function(ledger){
    ledger._id = addLeadingZeros(ledger.ledger_index);
  });

  var firstLedger = Math.min(ledgerBatch[0].ledger_index, ledgerBatch[ledgerBatch.length-1].ledger_index),
    lastLedger = Math.max(ledgerBatch[0].ledger_index, ledgerBatch[ledgerBatch.length-1].ledger_index);

  // console.log('Saving batch from ' + firstLedger + ' to ' + lastLedger + ' to CouchDB');

  db.fetch({
    keys: _.map(_.range(firstLedger, lastLedger + 1), function(num){ return addLeadingZeros(num, 10); })
  }, function(err, res){
    if (err) {
      console.log('problem listing docs from couchdb from ledger ' + 
        firstLedger + ' to ' + lastLedger + ' err: ' + err);
      return;
    }

    // console.log(JSON.stringify(res));

    // add _rev values to the docs that will be updated
    _.each(res.rows, function(row){
      var index = _.findIndex(ledgerBatch, function(ledger){
        return (row.id === ledger._id);
      });

      // console.log(JSON.stringify(row));

      if (row.error) {
        return;
      }

      ledgerBatch[index]._rev = row.value.rev;

      // console.log('\n\n\n' + JSON.stringify(ledgerBatch[index]) + '\n\n\n' + JSON.stringify(row.doc) + '\n\n\n');

      // don't update docs that haven't been modified
      if (equal(ledgerBatch[index], row.doc, {strict: true})) {
        ledgerBatch[index].noUpdate = true;
      }

    });

    var docs = _.filter(ledgerBatch, function(ledger){
      return !ledger.noUpdate;
    });

    // console.log(JSON.stringify(docs));


    db.bulk({docs: docs}, function(err){
      if (err) {
        console.log('problem saving batch to couchdb: ' + err);
        return;
      }

      console.log('Saved ' + docs.length + ' ledgers from ' + firstLedger + 
        ' to ' + lastLedger + 
        ' to CouchDB (' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ')');
    });

  });

}


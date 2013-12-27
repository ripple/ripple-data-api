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

// TODO think about how to handle errors such that the script restarts
// and doesn't continue with more recent ledgers while leaving an earlier
// range of ledgers out of the database
// maybe start two processes...


/**
 *  ledgerImporter.js uses the rippled API to import
 *  ledgers into a CouchDB instance
 *
 *  Available command line options:
 *
 *  - node ledgerImporter.js
 *  - node ledgerImporter.js <minLedger>
 *  - node ledgerImporter.js <minLedger> <lastLedger>
 *  - node ledgerImporter.js <minLedger> <lastLedger> stopafter
 *    (note that including the command 'stopafter' will make it stop after
 *    finishing the given range of ledgers, as opposed to continuing with
 *    the most recently closed ledgers after it is finished with the given range)
 *  - node ledgerImporter.js all
 */

var processOptions = {};
if (process.argv.length === 3) {

  if (process.argv[2].toLowerCase() === 'all') {
    processOptions.minLedgerIndex = 32570;
  } else {
    processOptions.minLedgerIndex = parseInt(process.argv[2], 10);
  }

} else if (process.argv.length === 4) {

  processOptions.lastLedger = Math.max(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
  processOptions.minLedgerIndex = Math.min(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));

} else if (process.argv.length === 5) {
 
  processOptions.lastLedger = Math.max(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
  processOptions.minLedgerIndex = Math.min(parseInt(process.argv[2], 10), parseInt(process.argv[3], 10));
  processOptions.stopAfterRange = (process.argv[4].toLowerCase() === 'stopafter');

}

console.log('ledgerImporter.js script started again');
importIntoCouchDb(processOptions);



/**
 *  importIntoCouchDb gets batches of ledgers using the rippled API
 *  and saves them into CouchDB
 *
 *  Available options:
 *  {
 *    lastLedger: ledger_hash or ledger_index, defaults to last closed ledger
 *    batchSize: number, defaults to 1000
 *    minLedger: ledger_hash or ledger_index, if none given it will use the latest ledger in CouchDB
 *  }
 */
function importIntoCouchDb(opts) {

  // if minLedger is not set, set minLedger to be the latest ledger saved to couchdb
  if (opts.minLedgerIndex || opts.minLedgerHash) {
    startImporting(opts);
  } else {
    getLatestLedgerInCouchDb(function(err, latestLedger){
      if (err) {
        console.log('problem getting last ledger saved to CouchDB: ' + err);
        return;
      }

      opts.minLedgerHash = latestLedger.hash;
      opts.minLedgerIndex = latestLedger.index;
      startImporting(opts);
    });
  }

  function startImporting (opts) {

    console.log('Starting importIntoCouchDb at ' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ' with options: ' + JSON.stringify(opts));

    getLedgerBatch(opts, function(err, res){
      if (err) {
        // TODO handle errors better
        console.log('problem getting ledger batch: ' + err);
        return;
      }

      // skip empty batches
      if (res.results.length === 0) {
        return;
      }

      // check if the process was finished before starting another importIntoCouchDb process
      if (!res.reachedMinLedger) {

        saveBatchToCouchDb(res.results, function(err, saveRes){
          if (err) {
            console.log('problem saving ledger batch to CouchDB: ' + err);
            return;
          }
        });

      } else {
        // save the batch to CouchDB, then start the next batch
        // immediately if this batch actually updated some ledgers
        // or wait a couple of seconds before starting again if not
        saveBatchToCouchDb(res.results, function(err, saveRes){
          if (err) {
            console.log('problem saving ledger batch to CouchDB: ' + err);
            return;
          }

          // check that this set of ledgers doesn't break the hash chain
          // of the ledgers already in the database,
          // if it does rerun the script over the entire problem section
          // (either the ledgers before this set or after it)
          db.fetch({keys: [
            addLeadingZeros(saveRes.earliestLedgerIndex - 1),
            addLeadingZeros(saveRes.earliestLedgerIndex),
            addLeadingZeros(saveRes.earliestLedgerIndex + saveRes.numLedgersSaved),
            addLeadingZeros(saveRes.earliestLedgerIndex + saveRes.numLedgersSaved + 1)
            ]}, function(err, res) {

            if (err) {
              console.log('problem determining whether hash chain is complete, trying this batch again...');
              setImmediate(function(){
                importIntoCouchDb(opts);
              });
              return;
            } 

            // newly saved ledgers don't continue hash chain of the ledgers
            // preceding them that are already in the database
            if (res.rows[0].doc.ledger_hash !== res.rows[1].doc.parent_hash) {
              console.log('The parent_hash of the earliest ledger saved in this batch ' +
                '(ledger_index: ' + saveRes.earliestLedgerIndex + ') ' +
                'did not match the ledger_hash of the ledger before it in the database, ' + 
                'starting the process again with minLedgerIndex set earlier...');
              
              setImmediate(function(){
                importIntoCouchDb({
                  minLedgerIndex: saveRes.earliestLedgerIndex - 100,
                  lastLedger: saveRes.earliestLedgerIndex + saveRes.numLedgersSaved,
                  batchSize: opts.batchSize,
                  stopAfterRange: opts.stopAfterRange
                });
              });

              return;
            }

            // newly updated ledgers break hash chain with the ledgers that come
            // immediately after this set that are already in the database
            if (!res.rows[2].error && !res.rows[3].error && res.rows[2].doc.ledger_hash !== res.rows[3].doc.parent_hash) {
              console.log('The ledger_hash of the last ledger saved in this batch ' + 
                '(ledger_index: ' + (saveRes.earliestLedgerIndex + saveRes.numLedgersSaved) + ') ' +
                'did not match the parent_hash of the ledger after them in the database, ' +
                'starting the process again with lastLedger set later...');

              getLatestLedgerInCouchDb(function(err, latestLedger){
                if (err) {
                  console.log('problem gettting latest ledger in CouchDB: ' + err);
                  return;
                }

                setImmediate(function(){
                  importIntoCouchDb({
                    minLedgerIndex: saveRes.earliestLedgerIndex,
                    lastLedger: Math.min(parseInt(latestLedger.ledger_index, 10), saveRes.earliestLedgerIndex + saveRes.numLedgersSaved + 100),
                    batchSize: opts.batchSize,
                    stopAfterRange: opts.stopAfterRange
                  });
                });
              });

              return;
            }

            // ledger hash chain is ok, continue the process with the most
            // recently closed ledgers unless opts.stopAfterRange is set to true
            if (!opts.stopAfterRange) {

              // start next batch
              // disregard previous options so that it continues with the most recent data
              // TODO is this the right way to handle continous importing?
              if (saveRes.numLedgersSaved > 0) {
                setImmediate(function(){
                  importIntoCouchDb({batchSize: opts.batchSize});
                });

              } else {
                // wait a couple of seconds for new ledgers to close before trying again
                setTimeout(function(){
                  importIntoCouchDb({batchSize: opts.batchSize});
                }, 5000);
              }  
            }
          });
        });
      }
    });
  }
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
 *    minLedgerIndex: ledger_index,
 *    minLedgerHash: ledger_hash
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

    if (opts.minLedgerIndex < 32570) {
      opts.minLedgerIndex = 32570;
    }

    opts.results.push(ledger);
    opts.lastLedger = ledger.parent_hash;

    // determine whether the process has reached the minLedgerHash or minLedgerIndex
    var reachedMinLedger = ((opts.minLedgerIndex && opts.minLedgerIndex >= ledger.ledger_index) || opts.minLedgerHash === ledger.ledger_hash);

    if (opts.results.length >= opts.batchSize || reachedMinLedger) {
      callback(null, {
        results: opts.results.slice(),
        reachedMinLedger: reachedMinLedger
      });
      opts.results = [];
    }

    // if the process has not yet reached the minLedgerIndex
    // continue with the next ledger
    if (!reachedMinLedger) {
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
function getLedger (identifier, callback, servers) {

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

  // store server statuses (reset for each ledger identifier)
  if (!servers) {
    servers = {};
    _.each(config.rippleds, function(serv){
      servers[serv] = 'notYetTried';
    });
  }

  // get untried server
  var server = _.findKey(servers, function(status){
    return status === 'notYetTried';
  });

  // if all servers have been tried once look for a 'tryAgain' status
  if (!server) {
    server = _.findKey(servers, function(status){
      return status === 'tryAgain';
    });
  }

  if (!server) {
    callback(new Error('ledger ' + 
      (reqData.params[0].ledger_index || reqData.params[0].ledger_hash) + 
      ' not available from any of the rippleds'));
    return;
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
        (reqData.params[0].ledger_index || reqData.params[0].ledger_hash || 'closed') + 
        ' from server: ' + server + ' err: ' + JSON.stringify(err) + 
        '\nTrying next server...');

      if (servers[server] === 'untried') {
        servers[server] = 'tryAgain';
      }

      setImmediate(function(){
        getLedger (identifier, callback, servers);
      });
      return;
    }

    // check if the server returned a buffer/string instead of json
    if (typeof res.body === 'string') {
      // console.log('rippled returned a buffer instead of a JSON object for request: ' + 
      //   JSON.stringify(reqData.params[0]) + '. Trying again...');
      servers[server] = 'tryAgain';
      setTimeout(function(){
        getLedger (identifier, callback, servers);
      }, 500);
      return;
    }

    // handle ledgerNotFound
    if (res.body.result.error === 'ledgerNotFound') {
      servers[server] = 'ledgerNotFound';

      setImmediate(function(){
        getLedger (identifier, callback, servers);
      });
      return;
    }

    // handle malformed response
    if (!res || !res.body || !res.body.result || (!res.body.result.ledger && !res.body.result.closed)) {
      console.log('error getting ledger ' + 
        (identifier || 'closed') + 
        ', server responded with: ' + 
        JSON.stringify(res.error || res.body || res));
      
      servers[server] = 'tryAgain';
      
      setImmediate(function(){
        getLedger (identifier, callback, servers);
      });
      return;
    }

    // format remote ledger
    var remoteLedger = (res.body.result.closed ? res.body.result.closed.ledger : res.body.result.ledger),
      ledger = formatRemoteLedger(remoteLedger);

    // keep track of which server ledgers came from
    ledger.server = (server === 'http://0.0.0.0:51234' ? 'http://ct.ripple.com:51234' : server);

    // check that transactions hash to the expected value
    var ledgerJsonTxHash = Ledger.from_json(ledger).calc_tx_hash().to_hex();
    if (ledgerJsonTxHash !== ledger.transaction_hash) {

      console.log('transactions do not hash to the expected value for ' + 
        'ledger_index: ' + ledger.ledger_index + '\n' +
        'ledger_hash: ' + ledger.ledger_hash + '\n' +
        'actual transaction_hash:   ' + ledgerJsonTxHash + '\n' +
        'expected transaction_hash: ' + ledger.transaction_hash);

      servers[server] = 'corruptedLedger';

      setImmediate(function(){
        getLedger (identifier, callback, servers);
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
    if(!transaction.metaData) {
      console.log('transaction in ledger: ' + ledger.ledger_index + ' does not have metaData');
      return;
    }

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
 *  getLatestLedgerInCouchDb gets the ledger with the highest
 *  index saved in CouchDB
 */
function getLatestLedgerInCouchDb(callback) {
  db.list({descending:true, startkey:'_c', limit: 20}, function(err, res){
    if (err) {
      callback(err);
      return;
    }

    var latestIndex = _.find(res.rows, function(row){      
      try {
        return (row.id.length === 10 && parseInt(row.id, 10) > 32570);
      } catch (e) {
        return false;
      }
    }).id;

    db.get(latestIndex, function(err, res){
      if (err) {
        callback(err);
        return;
      }

      // console.log('Latest ledger in CouchDB: ledger_index ' + res.ledger_index + 
      //   ' ledger_hash ' + res.ledger_hash + 
      //   ' closed at ' + res.close_time_human);

      callback(null, {
        hash: res.ledger_hash,
        index: res.ledger_index
      });

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
function saveBatchToCouchDb (ledgerBatch, callback) {

  // console.log('Saving ' + ledgerBatch.length + ' ledgers');

  ledgerBatch.sort(function(a, b){
    return a.ledger_index - b.ledger_index;
  });

  // add doc ids to the ledgers
  _.each(ledgerBatch, function(ledger){
    ledger._id = addLeadingZeros(ledger.ledger_index);
  });

  var firstLedger = Math.min(ledgerBatch[0].ledger_index, ledgerBatch[ledgerBatch.length-1].ledger_index),
    lastLedger = Math.max(ledgerBatch[0].ledger_index, ledgerBatch[ledgerBatch.length-1].ledger_index);

  db.fetch({
    keys: _.map(_.range(firstLedger, lastLedger + 1), function(num){ return addLeadingZeros(num, 10); })
  }, function(err, res){
    if (err) {
      callback(err);
      return;
    }

    // add _rev values to the docs that will be updated
    _.each(res.rows, function(row){
      var index = _.findIndex(ledgerBatch, function(ledger){
        return (row.id === ledger._id);
      });

      // skip this one if that ledger is not already in the db (error 'not found')
      if (row.error) {
        return;
      }

      ledgerBatch[index]._rev = row.value.rev;

      // don't update docs that haven't been modified
      if (equal(ledgerBatch[index], row.doc, {strict: true})) {
        ledgerBatch[index].noUpdate = true;
      } else {
        console.log('Replacing ledger ' + row.doc.ledger_index + 
          '\n   Previous: ' + JSON.stringify(row.doc) +
          '\n   Replacement: ' + JSON.stringify(ledgerBatch[index]));
      }

    });

    var docs = _.filter(ledgerBatch, function(ledger){
      return !ledger.noUpdate;
    });

    if (docs.length === 0) {
      callback(null, {
        numLedgersSaved: 0, 
        earliestLedgerIndex: ledgerBatch[0].ledger_index
      });
      return;
    }

    db.bulk({docs: docs}, function(err){
      if (err) {
        callback(err);
        return;
      }

      console.log('Saved ' + docs.length + ' ledgers from ' + firstLedger + 
        ' to ' + lastLedger + 
        ' to CouchDB (' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ')');

      callback(null, {
        numLedgersSaved: docs.length,
        earliestLedgerIndex: ledgerBatch[0].ledger_index
      });
    });

  });

}


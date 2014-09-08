var ripple   = require('ripple-lib');
var env      = process.env.NODE_ENV || "development";
var config   = require('../deployment.environments.json')[env];
var DBconfig = require('../db.config.json')[env];
var db       = require('nano')(DBconfig.protocol+
    '://'  + DBconfig.username + 
    ':'    + DBconfig.password + 
    '@'    + DBconfig.host + 
    ':'    + DBconfig.port + 
    '/'    + DBconfig.database);
var indexer = require('./indexer.js');
var moment  = require('moment');
var diff    = require('deep-diff');
var async   = require('async');
var store   = require('node-persist');
var Ledger  = require('../node_modules/ripple-lib/src/js/ripple/ledger').Ledger;
var winston = require('winston');
var options = {
    
    trace   : false,
    trusted : false,
    
    servers: [
      { host: 's-west.ripple.com', port: 443, secure: true },
      { host: 's-east.ripple.com', port: 443, secure: true }
    ],

    connection_offset: 0,
    allow_partial_history : false,
    //last close reconnect
  };

var reset = process.argv.indexOf('--reset') !== -1 ? true : false;

store.initSync();
var importer = { };

importer.first = reset ? null : store.getItem('first');
if (importer.first) {
  importer.validated = store.getItem('validated');
} else {
  importer.first = {index : config.startIndex || 32570};
}
importer.last   = store.getItem('last');
importer.remote = new ripple.Remote(options);

console.log(importer.first);

importer.start = function () {
  importer.remote.connect();
  importer.remote.on('ledger_closed', function(resp){
    winston.info("ledger closed:", resp.ledger_index); 
    importer.getLedger(resp.ledger_index);
  });  
};

 
importer.getLedger = function (ledgerIndex, callback) {
  var options = {
    transactions:true, 
    expand:true,
  }
  
  if (isNaN(ledgerIndex)) {
    if (typeof callback === 'function') callback("invalid ledger index");
    return;  
  }
  
  importer.remote.request_ledger(ledgerIndex, options, function(err, resp) {
    var ledgerIndex = this.message.ledger;
    if (err || !resp || !resp.ledger) {
      console.log("error:", err);  
      setTimeout(function(){
        importer.getLedger(ledgerIndex, callback);            
      }, 500);
      return;
    }    
    
    importer.handleLedger(resp.ledger, ledgerIndex, callback);    
  });    
};

importer.handleLedger = function(remoteLedger, ledgerIndex, callback) {

  var ledger;
  try {
    ledger = formatRemoteLedger(remoteLedger);
  } catch (e) {
    console.log(e);
    if (typeof callback === 'function') callback(e);
    return;  
  }
  
  if (!ledger || !ledger.ledger_index || !ledger.ledger_hash) {
    console.log("malformed ledger");
    setTimeout(function(){
      importer.getLedger(ledgerIndex, callback);            
    },500);
    return;
  } 
  
  // keep track of which server ledgers came from
  //ledger.server = (server === 'http://0.0.0.0:51234' ? 'http://ct.ripple.com:51234' : server);

  // check that transactions hash to the expected value
  var txHash;
  try {
   txHash = Ledger.from_json(ledger).calc_tx_hash().to_hex();
  } catch(err) {
    winston.error("Error calculating transaction hash: "+ledger.ledger_index +" "+ err);
    txHash = '';
  } 
  
  if (txHash && txHash !== ledger.transaction_hash) {

    winston.info('transactions do not hash to the expected value for ' + 
      'ledger_index: ' + ledger.ledger_index + '\n' +
      'ledger_hash: ' + ledger.ledger_hash + '\n' +
      'actual transaction_hash:   ' + txHash + '\n' +
      'expected transaction_hash: ' + ledger.transaction_hash);
    setTimeout(function(){
      importer.getLedger(ledgerIndex, callback);            
    },500);
    return;
  } 
  
  winston.info('Got ledger: ' + ledger.ledger_index);  
  importer.saveLedger(ledger, callback);
}


/**
*  formatRemoteLedger makes slight modifications to the
*  ledger json format, according to the format used in the CouchDB database
*/
function formatRemoteLedger(ledger) {

  ledger.close_time_rpepoch   = ledger.close_time;
  ledger.close_time_timestamp = ripple.utils.toTimestamp(ledger.close_time);
  ledger.close_time_human     = moment(ripple.utils.toTimestamp(ledger.close_time))
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
      winston.info('transaction in ledger: ' + ledger.ledger_index + ' does not have metaData');
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

  ledger._id = importer.addLeadingZeros(ledger.ledger_index);
  return ledger;
}

/**
* addLeadingZeros converts numbers to strings and pads them with
* leading zeros up to the given number of digits
*/
importer.addLeadingZeros = function (number, digits) {
  var numStr = String(number);
  if (!digits) digits = 10;
  while(numStr.length < digits) {
    numStr = "0" + numStr;
  }

  return numStr;
};
  
importer.saveLedger = function(ledger, callback) {
  
  db.get(ledger._id, function (err, doc) {
    if (doc) {
      ledger._rev = doc._rev;
      
      // don't update docs that haven't been modified
      var diffRes = diff(ledger, doc);
      if (!diffRes || (diffRes.length === 1 && diffRes[0].path[0] === 'server')) {
        winston.info("no change to ledger:" + ledger.ledger_index);
        if (typeof callback === 'function') callback(null, ledger);
        return;
      }

      winston.info('Replacing ledger ' + doc.ledger_index + 
        '\n   Previous: ' + doc.ledger_hash +
        '\n   Replacement: ' + ledger.ledger_hash);
    }
    
    db.insert(ledger, function(err) {
      if (err) {
        //TODO: handle 409 error
        winston.info("error saving ledger:", ledger.ledger_index, err);
        if (typeof callback === 'function') callback(err);
        return;  
      } 
      
      winston.info("saved ledger:", ledger.ledger_index, ledger.close_time_human, moment.utc().format());
      indexer.pingCouchDB();

      if (importer.last && importer.last.index < ledger.ledger_index) {
        importer.setMarker('last', ledger); 
      }
      
      //if the last validated ledger is the one 
      //previous to this, we can safely advance the
      //last validated ledger    
      if (importer.validated && 
        importer.validated.index + 1 === ledger.ledger_index &&
        importer.validated.hash      === ledger.parent_hash) {
        
        importer.setMarker('validated', ledger);
      
      //if we dont have a starting ledger, save this as the 
      //start and last validated ledger.  
      } else if (!importer.first) {
        importer.setMarker('first', ledger);     
        importer.setMarker('validated', ledger);
      
      //if we are here, there must be a gap between the
      //last validated ledger and the latest one saved to 
      //the db.  We must fill the gap with historical ledgers
      } else {
        importer.fetchHistorical();
      }

     if (typeof callback === 'function') callback(null, ledger);
    });
  });
};

importer.setMarker = function (name, ledger) {
  var data = {
    id    : ledger._id,
    index : ledger.ledger_index,
    hash  : ledger.ledger_hash
  }; 
  
  importer[name] = data;
  store.setItem(name, data);
};

importer.fetchHistorical = function () {
  if (importer.fetching) return;
  importer.fetching = true;

  if (!importer.validated) {
    importer.validated = {
      index : importer.first.index - 1
    };
  }
  
  var start = importer.validated.index + 1;
  var end   = importer.validated.index + 100;
  if (end > importer.last.index) end = importer.last.index;
  winston.info("fetching historical:", start, end);
  
  var ids = [];
  for (i = start; i <= end; i++) {
    ids.push(importer.addLeadingZeros(i));
  }
  
  db.fetch({keys:ids}, function(err, resp){
    if (err || !resp.rows) {
      winston.info("historical: couchdb error:", err);
      importer.fetching = false; 
      return;
    }
    
    var parentHash = importer.validated.hash; 
    resp.rows.forEach(function(row, i) {
 
      if (row.doc && parentHash &&
        row.doc.parent_hash !== parentHash) {
        resp.rows[i].doc = row.doc = undefined;    
      }  
      
      parentHash = row.doc ? row.doc.ledger_hash : null;
    });
    
    var count = 0;
    async.map(resp.rows, function(row, asyncCallback) {
    
      if (row.doc) {
        asyncCallback(null, row);
      } else {
        var ledgerIndex = parseInt(row.key, 10);

        getLedger(++count, ledgerIndex, function (err, resp) {
          if (err) {
            winston.error("fetch historical:", err);
            asyncCallback (null, null);
          } else {
            row.doc = resp;
            asyncCallback (null, row);
          }
        });
      }
      
    }, 
    function (err, rows) {
  
      var validated = importer.validated;

      for(var i=0; i<rows.length; i++) {
        var row = rows[i];
        if ((validated.index + 1 === row.doc.ledger_index &&
            validated.hash === row.doc.parent_hash) ||
            (importer.validated.index + 1 === importer.first.index)) {
          validated.index  = row.doc.ledger_index;
          validated.id     = row.doc._id;
          validated.hash   = row.doc.ledger_hash;
          validated.ledger = row.doc;
          
        } else if (validated.index >= row.doc.ledger_index) {
          continue;
        } else {
          console.log("how did we get here?", validated.index, row.key);
          importer.getLedger(validated.index, function(err, ledger) {
            if (err) {
              console.log(err);
              return;
            }
            
            importer.setMarker('validated', ledger);  
            importer.fetching = false;
          }); 
          
          return;
        }
      }
      
      if (validated.ledger) {
        importer.setMarker('validated', validated.ledger);
      }
      
      importer.fetching = false;
      winston.info("validated to:", importer.validated.index);
      if (importer.last && importer.validated &&
        importer.last.index > importer.validated.index) {
        setTimeout(function(){
          importer.fetchHistorical();   
           
        }, 1000);  
      }
    });
  });
  
  //put a little padding on the ledger requests
  function getLedger(count, index, callback) {
    setTimeout(function() { 
      importer.getLedger(index, callback)
    }, count * 100);
  }
}
  

importer.start();
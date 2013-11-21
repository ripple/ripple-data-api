var winston = require('winston'),
  async = require('async'),
  _ = require('lodash'),
  config = require('../config'),
  db = require('nano')('http://' + config.couchdb.username + 
            ':' + config.couchdb.password + 
            '@' + config.couchdb.host + 
            ':' + config.couchdb.port + 
            '/' + config.couchdb.database),
  RippledQuerier = require('./rippledquerier'),
  rq = new RippledQuerier();



/**
 * rippledtocouchdb pulls ledger snapshots from a local rippled
 * and inserts them into a CouchDB instance
 *
 * run with no command line arguments to start from last saved ledger
 * run with 1 command line argument to give starting ledger index value
 */
if (process.argv.length < 3) {

  db.changes({

    limit: 20,
    descending: true

  }, function(err, res) {

    if (err) {
      winston.error('Error getting last ledger saved:', err);
      return;
    }

    // find last saved ledger amongst couchdb changes stream
    var lastSavedIndex;
    if (res && res.results && res.results.length > 0) {

      for (var r = 0; r < res.results.length; r++) {
        if (parseInt(res.results[r].id, 10) > 0) {

          // go back beyond the last apparent saved index
          // in case there were ledgers that weren't saved
          lastSavedIndex = parseInt(res.results[r].id, 10) - config.batchSize;  
          
          if (lastSavedIndex < 32570) {
            lastSavedIndex = 32569;
          }

          break;
        }
      }  

    } else {

      lastSavedIndex = 32569;

    }

    winston.info("Starting from last saved index:", lastSavedIndex + 1);

    saveNextBatch(lastSavedIndex + 1);

    return;

  });

} else if (process.argv.length === 3) {

  var lastSavedIndex = parseInt(process.argv[2]);
  winston.info("Starting from index:", lastSavedIndex);
  saveNextBatch(lastSavedIndex);

  return;

}


/**
 * addLeadingZeros converts numbers to strings and pads them with
 * leading zeros up to the given number of digits
 */

function addLeadingZeros (number, digits) {

  if (typeof digits === "undefined")
    digits = 10;

  var numStr = String(number);

  while(numStr.length < digits) {
    numStr = "0" + numStr;
  }

  return numStr;

}


/**
 * saveNextBatch gets a batch of config.batchSize number of ledgers,
 * parses them, and adds them into CouchDB
 *
 * note that prevLedgerHash is optional
 */

function saveNextBatch(batchStart, prevLedgerHash) {

  rq.getLatestLedgerIndex(function(err, latestLedgerIndex) {
    if (err) {
      winston.error("Error getting last ledger index:", err);
      return;
    }

    var batchEnd = Math.min(latestLedgerIndex, (batchStart + config.batchSize));
    if (batchStart >= batchEnd) {
      setTimeout(function() {
        saveNextBatch(batchEnd);
      }, 10000);
      return;
    }

    // get ledgers
    rq.getLedgerRange(batchStart, batchEnd, function(err, ledgers) {
      if (err) {
        winston.error("Error getting batch from", batchStart, "to", batchEnd, ":", err);
        return;
      }


      // verify the chain of ledger headers is unbroken
      ledgers.sort(function(a, b){
        return a.ledger_index - b.ledger_index;
      });

      var previousHash, start_index;
      if (prevLedgerHash) {
        previousHash = prevLedgerHash;
        start_index = 0;
      } else {
        previousHash = ledgers[0].ledger_hash;
        start_index = 1;
      }
      
      for (var led = start_index, len = ledgers.length; led < len; led++) {

        if (ledgers[led].parent_hash !== previousHash) {

          throw(new Error("Error in chain of ledger hashes:" + 
                  "\n  Previous Ledger Hash: " + previousHash + 
                  "\n  This Ledger's Parent Hash: " + ledgers[led].parent_hash + 
                  "\n\n  Ledger: " + JSON.stringify(ledgers[led]) + 
                  (led !== 0 ? "\n\n  Previous Ledger: " + JSON.stringify(ledgers[led-1]) : "")));
        
        } else {

          previousHash = ledgers[led].ledger_hash;

        }
      }

      var lastLedgerHash = ledgers[ledgers.length - 1].ledger_hash;


      // list docs to get couchdb _rev to update docs already in db (CouchDB requirement)
      db.list({

        startkey: addLeadingZeros(batchStart),
        endkey: addLeadingZeros(batchEnd)

      }, function(err, res){

        var docs = _.map(ledgers, function(ledger) {

          ledger._id = addLeadingZeros(ledger.ledger_index, 10);

          return ledger;

        });


        if (res && res.rows && res.rows.length > 0) {

          _.each(res.rows, function(row){

            var id = row.id,
              rev = row.value.rev;

            if (parseInt(id, 10) - batchStart > 0 
              && parseInt(id, 10) - batchStart < docs.length
              && docs[parseInt(id, 10) - batchStart]._id === id) {

              docs[parseInt(id, 10) - batchStart]._rev = rev;

            } else {

              var docIndex = _.findIndex(docs, function(doc){
                return doc._id === id;
              });

              if (docIndex >= 0) {
                docs[docIndex]._rev = rev;
              }
            }

          });
        }

        // bulk update/add docs
        db.bulk({
          docs: docs
        }, function(err) {
          if (err) {
            winston.error("Error saving batch from", batchStart, "to", batchEnd, ":", JSON.stringify(err));
            return;
          }

          if (batchEnd - batchStart === 1) {

            winston.info("Saved ledger", batchStart, "to CouchDB");

          } else {

            winston.info("Saved ledgers", batchStart, "to", (batchEnd - 1), "to CouchDB");
          
          }

          // if the batch had only 1 ledger, start next batch immediately, otherwise pause for 10 sec
          if (batchEnd - batchStart > 1)

            setImmediate(function() {
              saveNextBatch(batchEnd, lastLedgerHash);
            });

          else {

            setTimeout(function() {
              saveNextBatch(batchEnd, lastLedgerHash);
            }, 10000);

          }
        });
      });
    });
  });
}

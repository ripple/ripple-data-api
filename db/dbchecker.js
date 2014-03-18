function checker (config) {
  
  var     _ = require('lodash'),
    winston = require('winston'),
    async   = require('async'),
    ripple  = require( 'ripple-lib' ),
    Remote  = ripple.Remote,
    Amount  = ripple.Amount,
    Ledger  = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger,
    db;
    
/*  
  if (process.argv.length < 3) {
  
      // get earliest ledger number
      db.list({
        limit: 1
      }, function(err, res){
        if (err) {
          winston.error('Error getting earliest ledger number: ', err);
          return;
        }
  
        var startIndex = parseInt(res.rows[0].id, 10);
        winston.info("Starting from index:", startIndex + " (" + (new Date().toString()) + ")");
        verifyFromLedgerIndex(startIndex);
      });
  
  } else if (process.argv.length === 3) {
  
    var startIndex = parseInt(process.argv[2]);
    winston.info("Starting from index:", startIndex + " (" + (new Date().toString()) + ")");
    verifyFromLedgerIndex(startIndex);
    return;
  
  } else if (process.argv.length === 4) {
  
    // TODO implement endIndex
  
  }
*/  
  this.checkDB = function (database, index, callback) {
    db = database;
    
    if (index) {
      if (config.debug) winston.info("last index: " + index);  
      verifyFromLedgerIndex(index, null, callback);
    
    } else { 
      //get last saved index
      db.list({descending:true, startkey:'_c', limit: 1}, function(err, res){
        if (err) return callback(err);
        if (!res.rows.length) return callback({
          message     : 'no ledgers saved to couchDB',
          ledgerIndex : 1
        });
        
        var index = parseInt(res.rows[0].id, 10);
        if (config.debug) winston.info("Last saved ledger: " + index);
        
        verifyFromLedgerIndex(index, null, callback);
      });
    }
  }
  
  
  function verifyFromLedgerIndex (ledgerIndex, parentHash, callback) {
    var batchSize = config.batchSize*5;
    var minIndex  = ledgerIndex>batchSize ? ledgerIndex-batchSize : 1;
    var indexes   = _.range(minIndex, ledgerIndex),
      docsNames   = _.map(indexes, function(index){
        return addLeadingZeros(index, 10);
      });
  
      
    db.fetch({keys: docsNames}, function(err, body){

      if (err) return callback({message:err, restartIndex:ledgerIndex});

      // winston.info(JSON.stringify(body));

      //this can occur when the connection to the dB is cut.
      if (!body || !body.rows) {
        winston.error("ledger: "+ledgerIndex+" - invalid response from couchDB");
        return callback({message:"db check error at ledger: " + ledgerIndex, restartIndex:ledgerIndex});
        
      } else if (!body.rows.length) {
        if (ledgerIndex<config.startIndex) return callback({
            message     : "Reached start index",
            ledgerIndex : config.startIndex //this will inform our caller that we are done
          });  
              
        else return callback ({
            message     : "Ledger " + (ledgerIndex) + " not found",
            ledgerIndex : ledgerIndex //start importing from here
          });  
      }
      
      //for (var r = 0, len = body.rows.length; r < len; r++) {
      for (var r=body.rows.length-1; r>=0; r--) {

        var row  = body.rows[r],
          ledger = row.doc;
        
        
        if (!ledger) {
          if ((minIndex + r)<config.startIndex)
            return callback({
              message     : "Reached start index",
              ledgerIndex : config.startIndex
            });  
            
          else return callback ({
              message     : "Ledger " + (minIndex + r) + " not found",
              ledgerIndex : minIndex + r
            });
          
          //winston.info('ledger ' + (ledgerIndex + r) + ' not in database, trying again in a few seconds');
          //timedVerify(ledgerIndex + r, prevLedgerHash);  //recursive call
          //return;
        }

        // check index number is correct
        if (parseInt(row.id, 10) !== parseInt(ledger.ledger_index, 10)) {
          return callback({
            message : 'db has wrong ledger at ledgerIndex: ' + parseInt(row.id, 10) + 
            ' ledger.ledger_index is: ' + ledger.ledger_index,
            ledgerIndex : ledger.ledger_index
          });
        }

        // check ledger chain is intact
        if (parentHash) {

          if (parentHash !== ledger.ledger_hash) {
            return callback({
              message: 'problem in ledger chain. ledger ' + ledger.ledger_index +
              ' has ledger_hash: ' + ledger.ledger_hash + ' but the next ledger\'s parent hash is: ' + parentHash,
              ledgerIndex : ledger.ledger_index+1 //restart importing here - offset must be less than batch size
            });
          }  
        } 

        // check transactions has correctly
        if (!verifyLedgerTransactions(ledger)) {
          return callback({
            message     :'transactions do not hash correctly for ledger ' + ledger.ledger_index,
            ledgerIndex : ledger.ledger_index
          });
        }

        parentHash = ledger.parent_hash;
      }

      if (config.debug>1) 
        winston.info('Verified ledgers: ' + minIndex + 
          " to " + ledgerIndex + 
          " (" + (new Date().toString()) + ")");

      setImmediate(function(){
        verifyFromLedgerIndex(minIndex, parentHash, callback);
      });
    });
  }  
  
  
  /**
   *  verifyLedgerTransactions checks that the hash of a ledger's
   *  transactions match its transaction_hash field
   *  returns true or false
   */
  
  function verifyLedgerTransactions( ledger ) {
  
    try {
      var ledgerJsonTxHash = Ledger.from_json( ledger )
        .calc_tx_hash( ).to_hex( );
        
    } catch (err) {
      winston.error("Error calculating transaction hash: "+ledger.ledger_index +" "+ err);
      ledgerJsonTxHash = '';
    }
  
    if (ledgerJsonTxHash === '') return true; //this could cause problems
    return ledgerJsonTxHash === ledger.transaction_hash;
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
  
  
  function timedVerify(fn, l, p){
      setTimeout(function(){
        verifyFromLedgerIndex(l, p);
      }, 5000);
  }
  
  return this;
}

module.exports = checker;
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
  this.checkDB = function (database, callback) {
     db = database;
     verifyFromLedgerIndex(config.startIndex, null, callback);
  }
  
  function verifyFromLedgerIndex (ledgerIndex, prevLedgerHash, callback) {
  
      var indexes = _.range(ledgerIndex, ledgerIndex + config.batchSize),
        docsNames = _.map(indexes, function(index){
          return addLeadingZeros(index, 10);
        });
  
      //winston.info('Getting docs: ' + JSON.stringify(docsNames));
  
      db.fetch({keys: docsNames}, function(err, body){
  
          if (err) return callback({message:err,ledgerIndex:ledgerIndex});
  
          // winston.info(JSON.stringify(body));
  
          for (var r = 0, len = body.rows.length; r < len; r++) {
  
            var row = body.rows[r],
              ledger = row.doc;
  
            if (!ledger) {
              return callback ({
                message     : "Ledger " + (ledgerIndex + r) + " not found",
                ledgerIndex : ledgerIndex + r
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
            if (prevLedgerHash) {
  
              if (prevLedgerHash !== ledger.parent_hash) {
                return callback({
                  message: 'problem in ledger chain. ledger ' + ledger.ledger_index +
                  ' has parent_hash: ' + ledger.parent_hash + ' but the prevLedgerHash is: ' + prevLedgerHash,
                  ledgerIndex : ledger.ledger_index-10, //set the minumum back a few ledgers
                });
              }
  
            } else if (ledgerIndex != config.startIndex){
  
              return callback({
                message     : 'prevLedgerHash: ' + prevLedgerHash + ' for ledgerIndex: ' + ledgerIndex,
                ledgerIndex : ledgerIndex
              });
            
            }
  
            // check transactions has correctly
            if (!verifyLedgerTransactions(ledger)) {
              return callback({
                message     :'transactions do not hash correctly for ledger ' + ledger.ledger_index,
                ledgerIndex : ledger.ledger_index
              });
            }
  
            prevLedgerHash = ledger.ledger_hash;
  
          }
  
          if (config.debug) 
            winston.info('Verified ledgers: ' + ledgerIndex + 
              " to " + (ledgerIndex + config.batchSize) + 
              " (" + (new Date().toString()) + ")");
  
          setImmediate(function(){
            verifyFromLedgerIndex(ledgerIndex + config.batchSize, body.rows[body.rows.length-1].doc.ledger_hash, callback);
          });
      });
  
  }
  
  
  /**
   *  verifyLedgerTransactions checks that the hash of a ledger's
   *  transactions match its transaction_hash field
   *  returns true or false
   */
  
  function verifyLedgerTransactions( ledger ) {
  
    var ledgerJsonTxHash = Ledger.from_json( ledger )
      .calc_tx_hash( ).to_hex( );
  
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
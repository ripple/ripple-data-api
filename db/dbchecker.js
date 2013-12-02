var winston = require('winston'),
  async = require('async'),
  _ = require('lodash'),
  config = require('../config');

var Remote = require( 'ripple-lib' ).Remote,
  Amount = require( 'ripple-lib' ).Amount,
    Ledger = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger;

var config = require( '../config' ),
  db = require( 'nano' )( 'http://' + config.couchdb.username +
    ':' + config.couchdb.password +
    '@' + config.couchdb.host +
    ':' + config.couchdb.port +
    '/' + config.couchdb.database );

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


function verifyFromLedgerIndex (ledgerIndex, prevLedgerHash) {

    // TODO use bulk api
    db.get(addLeadingZeros(ledgerIndex, 10), function(err, body){

        if (err) {
            winston.error("Error getting ledgerIndex: " + ledgerIndex + " err: " + err);
            return;
        }

        // check index number is correct
        if (ledgerIndex !== body.ledger_index) {
          winston.error('db has wrong ledger at ledgerIndex: ' + ledgerIndex + 
            ' body.ledger_index is: ' + body.ledger_index);
          return;
        }

        // check ledger chain is intact
        if (prevLedgerHash) {

          if (prevLedgerHash !== body.parent_hash) {
            winston.error('problem in ledger chain. ledger ' + body.ledger_index +
              ' has parent_hash: ' + body.parent_hash + ' but the prevLedgerHash is: ' + prevLedgerHash);
            return;
          }

        } else {

          winston.error('prevLedgerHash: ' + prevLedgerHash + ' for ledgerIndex: ' + ledgerIndex);
        
        }

        // check transactions has correctly
        if (!verifyLedgerTransactions(body)) {
          winston.error('transactions do not hash correctly for ledger ' + body.ledger_index);
          return;
        }

        // print to log every 1000 good ledgers
        if (ledgerIndex % 1000 === 0) {
          winston.info('Verified ledgers to ledger_index: ' + ledgerIndex + " (" + (new Date().toString()) + ")");
        }

        setImmediate(function(){
          verifyFromLedgerIndex(ledgerIndex + 1, body.ledger_hash);
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

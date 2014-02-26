var winston = require('winston'),
  async = require('async'),
  _ = require('lodash'),
  config = require('../config');

var Remote = require( 'ripple-lib' ).Remote,
  Amount = require( 'ripple-lib' ).Amount,
    Ledger = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger;

var config = require( './config' ),
  db = require( 'nano' )( 'http://' + config.couchdb.username +
    ':' + config.couchdb.password +
    '@' + config.couchdb.host +
    ':' + config.couchdb.port +
    '/' + config.couchdb.database );

var BATCHSIZE = 1000;

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

    var indexes = _.range(ledgerIndex, ledgerIndex + BATCHSIZE),
      docsNames = _.map(indexes, function(index){
        return addLeadingZeros(index, 10);
      });

    // winston.info('Getting docs: ' + JSON.stringify(docsNames));

    db.fetch({keys: docsNames}, function(err, body){

        if (err) {
            winston.error("Error getting ledgerIndex: " + ledgerIndex + " err: " + err);
            return;
        }

        // winston.info(JSON.stringify(body));

        for (var r = 0, len = body.rows.length; r < len; r++) {

          var row = body.rows[r],
            ledger = row.doc;

          if (!ledger) {
            winston.info('ledger ' + (ledgerIndex + r) + ' not in database, trying again in a few seconds');
            setTimeout(function(){
              verifyFromLedgerIndex(ledgerIndex + r, prevLedgerHash);
            }, 5000);
            return;
          }

          // check index number is correct
          if (parseInt(row.id, 10) !== parseInt(ledger.ledger_index, 10)) {
            winston.error('db has wrong ledger at ledgerIndex: ' + parseInt(row.id, 10) + 
              ' ledger.ledger_index is: ' + ledger.ledger_index);
            return;
          }

          // check ledger chain is intact
          if (prevLedgerHash) {

            if (prevLedgerHash !== ledger.parent_hash) {
              winston.error('problem in ledger chain. ledger ' + ledger.ledger_index +
                ' has parent_hash: ' + ledger.parent_hash + ' but the prevLedgerHash is: ' + prevLedgerHash);
              return;
            }

          } else {

            winston.error('prevLedgerHash: ' + prevLedgerHash + ' for ledgerIndex: ' + ledgerIndex);
          
          }

          // check transactions has correctly
          if (!verifyLedgerTransactions(ledger)) {
            winston.error('transactions do not hash correctly for ledger ' + ledger.ledger_index);
            return;
          }

          prevLedgerHash = ledger.ledger_hash;

        }

        winston.info('Verified ledgers: ' + ledgerIndex + " to " + (ledgerIndex + BATCHSIZE) + " (" + (new Date().toString()) + ")");

        setImmediate(function(){
          verifyFromLedgerIndex(ledgerIndex + BATCHSIZE, body.rows[body.rows.length-1].doc.ledger_hash);
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

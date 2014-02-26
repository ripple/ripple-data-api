var ripple = require('ripple-lib');

/**
 *  getTransaction gets a transaction corresponding to a particular account and invoice ID
 *  
 *  expects req.body to have:
 *  {
 *    account: 'rvY...',
 *    invoice: 'FFCB7F17E98F456193129D48DA39D54800000000000000000000000000000000'
 *  }
 */
 // TODO add more functionality
function getTransaction( req, res ) {

  if (req.body.account && ripple.UInt160.is_valid(req.body.account) && req.body.invoice) {

    db.view('account_tx', 'transactionsByAccountAndInvoice', {key: [req.body.account, req.body.invoice]}, function( err, couchRes ){

      if (couchRes.rows.length >= 1) {
        res.send({ txExists: true, inLedger: couchRes.rows[0].value[0], TxnSignature: couchRes.rows[0].value[1] });
        return;
      } else {
        res.send({ txExists: false });
        return;
      }

    });

  } else {
    // TODO add more functionality to this
    res.send(500, { error: 'please specify an account and invoice ID to get the transaction details'});
    return;
  }
}

module.exports = getTransaction;

function( doc ) {

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach(function(tx){

    if (tx.metaData.TransactionResult !== 'tesSUCCESS' || tx.TransactionType !== 'Payment') {
      return;
    }

    var srcAcct = tx.Account,
      dstAccount = tx.Destination,
      affNodes = tx.metaData.AffectedNodes,
      srcRippleStateFields = [],
      srcCurr,
      dstCurr;

    if (typeof tx.Amount === 'object') {
      dstCurr = [tx.Amount.currency, tx.Amount.issuer];
    } else {
      dstCurr = ['XRP'];
    }

    for (var a = 0; a < affNodes.length; a++) {

      var node = affNodes[a].CreatedNode || affNodes[a].ModifiedNode || affNodes[a].DeletedNode;

      // bridged through XRP if it modified an AccountRoot that
      // does not belong either to the srcAcct or dstAcct
      if (node.LedgerEntryType === 'AccountRoot' && node.FinalFields 
        && node.FinalFields.Account !== srcAcct && node.FinalFields.Account !== dstAcct) {

        emit(timestamp, {'crossCurrXrpBridge': 1});
        return;
      }

      // look for how many RippleState nodes involving the srcAcct were affected
      if (node.LedgerEntryType === 'RippleState') {

        var fields = node.FinalFields || node.NewFields;

        if (fields.HighLimit.issuer === srcAcct || fields.LowLimit.issuer === srcAcct) {
          srcRippleStateFields.push(fields);
        }
      }
    }

    if (srcRippleStateFields.length === 0) {

      // affected no RippleState nodes belonging to the srcAcct
      // so the srcCurr must be XRP
      srcCurr = ['XRP'];

    } else if (srcRippleStateFields.length === 1) {

      // only 1 RippleState node modified so the srcCurr is [currency, issuer]
      // of whichever of the (High/Low)Limit is not the srcAcct
      if (srcRippleStateFields[0].HighLimit.issuer === srcAcct) {

        srcCurr = [srcRippleStateFields[0].LowLimit.currency, srcRippleStateFields[0].LowLimit.issuer];

      } else if (srcRippleStateFields[0].LowLimit.issuer === srcAcct) {

        srcCurr = [srcRippleStateFields[0].HighLimit.currency, srcRippleStateFields[0].HighLimit.issuer];

      }

    } else if (srcRippleStateFields.length >= 2) {
      
      // check if any of the fields involve currencies other than the dst
      var crossCurrency = srcRippleStateFields.some(function(fields){

        if (fields.HighLimit.currency !== dstCurr[0] || fields.LowLimit.currency !== dstCurr[0]) {
          return true;
        } else {
          return false;
        }

      });

      if (crossCurrency) {

        emit(timestamp, {'crossCurrNoXrpBridge': 1});
        return;

      } else {

        emit(timestamp, {'sameCurrCrossGate': 1});
        return;

      }

    }

    if (srcCurr[0] !== dstCurr[0]) {

      emit(timestamp, {'crossCurrNoXrpBridge': 1});

    } else if (srcCurr[1] && dstCurr[1] && srcCurr[1] === dstCurr[1]) {

      emit(timestamp, {'sameCurrCrossGate': 1});

    } else if (srcCurr[0] === 'XRP' && dstCurr[0] === 'XRP') {

      emit(timestamp, {'xrpToXrp': 1});

    } else {

      emit(timestamp, {'sameCurrSameGate': 1});

    }

  });

}

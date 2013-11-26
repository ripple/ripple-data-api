function( doc ) {
  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== 'tesSUCCESS' ) {
      return;
    }

    tx.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.CreatedNode || affNode.ModifiedNode,
        currency,
        trustingParty,
        trustedParty,
        trustingPartyLimit,
        trustedPartyLimit,
        balanceChange; // represents amount trustingParty is owed

      if ( !node || node.LedgerEntryType !== 'RippleState' ) {
        return;
      }

      if ( node.NewFields ) {

        currency = node.NewFields.Balance.currency;

        // determine which of the HighLimit or LowLimit 
        // represent the trustedParty or trustingParty
        if ( parseFloat( node.NewFields.HighLimit.value ) > 0 ) {

          trustingParty = node.NewFields.HighLimit.issuer;
          trustedParty = node.NewFields.LowLimit.issuer;
          balanceChange = 0 - parseFloat( node.NewFields.Balance.value );

        } else if ( parseFloat( node.NewFields.LowLimit.value ) > 0 ) {

          trustingParty = node.NewFields.LowLimit.issuer;
          trustedParty = node.NewFields.HighLimit.issuer;
          balanceChange = parseFloat( node.NewFields.Balance.value );

        } else {

          return;

        }

        emit( [ trustingParty, currency ].concat( timestamp ), 
          { outgoing: 1 } );

        emit( [ trustedParty, currency ].concat( timestamp ), 
          { incoming: 1 } );

        if ( balanceChange !== 0 ) {

          emit( [ trustingParty, currency ].concat( timestamp ), 
            { balanceChange: balanceChange } );

          emit( [ trustedParty, currency ].concat( timestamp ), 
            { balanceChange: ( 0 - balanceChange ) } );

        }

      } else if ( node.PreviousFields && node.FinalFields ) {

        currency = node.FinalFields.LowLimit.currency;
        trustingParty = node.FinalFields.HighLimit.issuer;
        trustedParty = node.FinalFields.LowLimit.issuer;

      } else {

        return;

      }



    } );

  } );


  for ( var t = 0, txs = doc.transactions.length; t < txs; t++ ) {
    var tx = doc.transactions[ t ];



    for ( var n = 0, nodes = tx.metaData.AffectedNodes.length; n < nodes; n++ ) {

      if ( tx.metaData.AffectedNodes[ n ].hasOwnProperty( "CreatedNode" ) && tx.metaData.AffectedNodes[ n ].CreatedNode.LedgerEntryType === "RippleState" ) {
        var cnode = tx.metaData.AffectedNodes[ n ].CreatedNode;

        var currency = cnode.NewFields.Balance.currency,
          high_party = cnode.NewFields.HighLimit.issuer,
          low_party = cnode.NewFields.LowLimit.issuer;

        if ( parseFloat( cnode.NewFields.LowLimit.value ) > 0 ) {
          emit( [ high_party, currency ].concat( timestamp ), {
            incoming: 1
          } );
          emit( [ low_party, currency ].concat( timestamp ), {
            outgoing: 1
          } ); //, trusted_parties: [high_party]});
        }

        if ( parseFloat( cnode.NewFields.HighLimit.value ) > 0 ) {
          emit( [ low_party, currency ].concat( timestamp ), {
            incoming: 1
          } );
          emit( [ high_party, currency ].concat( timestamp ), {
            outgoing: 1
          } ); //, trusted_parties: [low_party]});
        }

        if ( parseFloat( cnode.NewFields.Balance.value ) !== 0 ) {
          emit( [ high_party, currency ].concat( timestamp ), {
            balance_change: 0 - parseFloat( cnode.NewFields.Balance.value )
          } );
          emit( [ low_party, currency ].concat( timestamp ), {
            balance_change: parseFloat( cnode.NewFields.Balance.value )
          } );
        }

      } else if ( tx.metaData.AffectedNodes[ n ].hasOwnProperty( "ModifiedNode" ) && tx.metaData.AffectedNodes[ n ].ModifiedNode.LedgerEntryType === "RippleState" ) {
        var mnode = tx.metaData.AffectedNodes[ n ].ModifiedNode;

        // high limit changed
        if ( mnode.PreviousFields.hasOwnProperty( "HighLimit" ) ) {

          // adding trust line
          if ( parseFloat( mnode.PreviousFields.HighLimit.value ) === 0 && parseFloat( mnode.FinalFields.HighLimit.value ) > 0 ) {

            var currency = mnode.FinalFields.LowLimit.currency,
              trusting_party = mnode.FinalFields.HighLimit.issuer,
              trusted_party = mnode.FinalFields.LowLimit.issuer;

            emit( [ trusted_party, currency ].concat( timestamp ), {
              incoming: 1
            } );
            emit( [ trusting_party, currency ].concat( timestamp ), {
              outgoing: 1
            } ); //, trusted_parties: [trusted_party]});
          }

          // removing trust line
          if ( parseFloat( mnode.PreviousFields.HighLimit.value ) > 0 && parseFloat( mnode.FinalFields.HighLimit.value ) === 0 ) {

            var currency = mnode.FinalFields.LowLimit.currency,
              trusting_party = mnode.FinalFields.HighLimit.issuer,
              trusted_party = mnode.FinalFields.LowLimit.issuer;

            emit( [ trusted_party, currency ].concat( timestamp ), {
              incoming: -1
            } );
            emit( [ trusting_party, currency ].concat( timestamp ), {
              outgoing: -1
            } );
          }

        }


        // low limit changed
        if ( mnode.PreviousFields.hasOwnProperty( "LowLimit" ) ) {

          // adding trust line
          if ( parseFloat( mnode.PreviousFields.LowLimit.value ) === 0 && parseFloat( mnode.FinalFields.LowLimit.value ) > 0 ) {

            var currency = mnode.FinalFields.HighLimit.currency,
              trusting_party = mnode.FinalFields.LowLimit.issuer,
              trusted_party = mnode.FinalFields.HighLimit.issuer;

            emit( [ trusted_party, currency ].concat( timestamp ), {
              incoming: 1
            } );
            emit( [ trusting_party, currency ].concat( timestamp ), {
              outgoing: 1
            } ); //, trusted_parties: [trusted_party]});
          }

          // removing trust line
          if ( parseFloat( mnode.PreviousFields.LowLimit.value ) > 0 && parseFloat( mnode.FinalFields.LowLimit.value ) === 0 ) {

            var currency = mnode.FinalFields.HighLimit.currency,
              trusting_party = mnode.FinalFields.LowLimit.issuer,
              trusted_party = mnode.FinalFields.HighLimit.issuer;

            emit( [ trusted_party, currency ].concat( timestamp ), {
              incoming: -1
            } );
            emit( [ trusting_party, currency ].concat( timestamp ), {
              outgoing: -1
            } );
          }

        }

        // balance changed
        if ( mnode.PreviousFields.hasOwnProperty( "Balance" ) ) {

          var currency = mnode.FinalFields.Balance.currency,
            low_party = mnode.FinalFields.LowLimit.issuer,
            high_party = mnode.FinalFields.HighLimit.issuer;

          emit( [ low_party, currency ].concat( timestamp ), {
            balance_change: ( mnode.FinalFields.Balance.value - mnode.PreviousFields.Balance.value )
          } );
          emit( [ high_party, currency ].concat( timestamp ), {
            balance_change: ( 0 - ( mnode.FinalFields.Balance.value - mnode.PreviousFields.Balance.value ) )
          } );

        }
      }
    }
  }
}
/* Loading ripple-lib with Node.js */
var Remote = require( 'ripple-lib' ).Remote;
var Amount = require( 'ripple-lib' ).Amount;

/* Loading ripple-lib in a webpage */
// var Remote = ripple.Remote;
// var Amount = ripple.Amount;

/* Connect to rippled through ripple-lib */
var remote = new Remote( {
  // trace: true,
  servers: [ {
    host: 's_west.ripple.com',
    port: 443
  } ]
} );
remote.connect( );

/* views maps the available txProcessor functions to their view names */
var views = {
  "account_tx": extractAccountTx,
  "offersExercised": extractOffersExercised

  // TODO add more views
};

/**
 *  createTransactions listener attaches the txProcessor
 *  specified by viewName and the displayFn, along with
 *  the given options object to the live ripple transaction feed
 */
function createTransactionListener( viewName, displayFn, opts ) {

  var txProcessor;

  if ( views[ viewName ] ) {
    txProcessor = views[ viewName ];
  } else {
    return;
  }

  remote.on( 'transaction_all', function( txData ) {
    if ( txData.engine_result !== 'tesSUCCESS' ) {
      return;
    }

    var time = new Date( );
    txData.utcTimeArray = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];


    txProcessor( txData, displayFn, opts );
  } );
}


/****** Examples ******/

/* Example for account_tx */
createTransactionListener(
  "account_tx",
  function(data){
    console.log( JSON.stringify( data ) );
  }, {
    account: 'rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1'
  });


/* Example for offersExercised */
// createTransactionListener(
//   "offersExercised",
//   function( data ) {
//     console.log( JSON.stringify( data ) );
//   }, {
//     // curr0: [ "USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" ],
//     // curr1: [ "XRP" ]
//   } );





/****** txProcessors ******/



/**
 *
 *
 *
 */
function extractAccountTx( txData, displayFn, opts ) {
  displayFn(txData);
} 


/**
 *  extractOffersExercised takes txData and if the txData contains
 *  an offer exercised it will call the given displayFn with an
 *  object of the following form:
 *
 *  {
 *    key: [["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"], ["XRP"], 2013, 11, 19, 14, 51, 10],
 *    value: [usd_volume, xrp_volume, exchange_rate]
 *  }
 *
 *  ** note that "exchange_rate" represents usd_volume/xrp_volume **
 *
 *  opts can include:
 *
 *  {
 *    curr0: [["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"],
 *    curr1: ["XRP"]
 *  }
 *  
 *  setting opts.curr0 and opts.curr1 will limit the offers displayed
 *  to the ones for that currency pair
 */
function extractOffersExercised( txData, displayFn, opts ) {

  var txType = txData.transaction.TransactionType;

  if ( txType !== 'Payment' && txType !== 'OfferCreate' ) {
    return;
  }

  txData.meta.AffectedNodes.forEach( function( affNode ) {

    var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;

    if ( node.LedgerEntryType !== 'Offer' || !node.PreviousFields || !node.PreviousFields.TakerPays || !node.PreviousFields.TakerGets ) {
      return;
    }

    var exchange_rate = Amount.from_quality( node.FinalFields.BookDirectory ).to_json( ).value,
      pay_curr,
      pay_amnt,
      get_curr,
      get_amnt,
      currPair,
      revCurrPair;

    // parse TakerPays and TakerGets and handle XRP case
    if ( typeof node.PreviousFields.TakerPays === "object" ) {
      pay_curr = [ node.PreviousFields.TakerPays.currency, node.PreviousFields.TakerPays.issuer ];
      pay_amnt = node.PreviousFields.TakerPays.value - node.FinalFields.TakerPays.value;
    } else {
      pay_curr = [ "XRP" ];
      pay_amnt = ( node.PreviousFields.TakerPays - node.FinalFields.TakerPays ) / 1000000.0; // convert from drops
      exchange_rate = exchange_rate / 1000000.0;
    }

    if ( typeof node.PreviousFields.TakerGets === "object" ) {
      get_curr = [ node.PreviousFields.TakerGets.currency, node.PreviousFields.TakerGets.issuer ];
      get_amnt = node.PreviousFields.TakerGets.value - node.FinalFields.TakerGets.value;
    } else {
      get_curr = [ "XRP" ];
      get_amnt = ( node.PreviousFields.TakerGets - node.FinalFields.TakerGets ) / 1000000.0;
      exchange_rate = exchange_rate * 1000000.0;
    }


    // setup returned values in the same format as CouchDB
    currPair = {
      key: [ pay_curr, get_curr ].concat( txData.utcTimeArray ),
      value: [ pay_amnt, get_amnt, exchange_rate ]
    };
    revCurrPair = {
      key: [ get_curr, pay_curr ].concat( txData.utcTimeArray ),
      value: [ get_amnt, pay_amnt, 1 / exchange_rate ]
    };


    // call displayFn if the curr options are not set
    if (!opts || (!opts.curr0 && !opts.curr1)) {
      displayFn( currPair, opts );
      displayFn( revCurrPair, opts );
      return;
    }


    // call displayFn if the curr options match this offer
    if (opts && opts.curr0 && opts.curr1) {

      if (arrayEquals( opts.curr0, currPair.key[ 0 ] ) && arrayEquals( opts.curr1, currPair.key[ 1 ] )) {
        displayFn( currPair, opts );
      }

      if (arrayEquals( opts.curr0, revCurrPair.key[ 0 ] ) && arrayEquals( opts.curr1, revCurrPair.key[ 1 ] )) {
        displayFn( revCurrPair, opts );
      }
    }

  } );
}

function arrayEquals( a, b ) {

  if ( a.length !== b.length ) {
    return false;
  }

  for ( var i = 0; i < a.length; i++ ) {
    if ( typeof a[ i ] === "object" && typeof b[ i ] === "object" ) {
      if ( !arrayEquals( a[ i ], b[ i ] ) ) {
        return false;
      }
    } else {
      if ( a[ i ] !== b[ i ] ) {
        return false;
      }
    }
  }

  return true;
}

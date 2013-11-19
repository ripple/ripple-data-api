/* Node.js imports */
var sqlite3 = require( 'sqlite3' ).verbose( ),
  winston = require( 'winston' ),
  path = require( 'path' ),
  moment = require( 'moment' ),
  _ = require( 'lodash' ),
  async = require( 'async' );

/* ripple-lib imports */
var ripple = require( 'ripple-lib' ),
  Ledger = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger,
  serverAddresses = [ 's_west.ripple.com', 's_east.ripple.com', 's1.ripple.com' ],
  remote = new ripple.Remote( {
    // trace: true,
    servers: _.map( serverAddresses, function( addr ) {
      return {
        host: addr,
        port: 443
      };
    } )
  } );
remote.connect( );

/* config options */
var config = require( '../config' );

/**
 *  RippledQuerier provides functionality to query a local rippled
 *  server for a specific ledger or a range of ledgers
 */

module.exports = RippledQuerier;

function RippledQuerier( maxIterators ) {

  if ( !maxIterators )
    maxIterators = 1000;

  var dbs = {
    ledb: new sqlite3.Database( path.resolve( config.dbPath || "/ripple/server/db", 'ledger.db' ) ),
    txdb: new sqlite3.Database( path.resolve( config.dbPath || "/ripple/server/db", 'transaction.db' ) )
  };

  var rq = {};

  rq.getLatestLedgerIndex = function( callback ) {
    getLatestLedgerIndex( dbs, callback );
  };

  rq.getLedger = function( ledgerIndex, callback ) {
    getLedger( dbs, ledgerIndex, callback );
  };

  rq.getLedgerRange = function( startIndex, endIndex, callback ) {
    getLedgerRange( dbs, startIndex, endIndex, maxIterators, callback );
  };

  return rq;

}


/**
 *  getLatestLedgerIndex gets the most recent ledger index in the
 *  local rippled ledger db
 */

function getLatestLedgerIndex( dbs, callback ) {

  dbs.ledb.all( "SELECT LedgerSeq FROM Ledgers ORDER BY LedgerSeq DESC LIMIT 1;",
    function( err, rows ) {
      if ( err ) {
        callback( err );
        return;
      }

      callback( null, rows[ 0 ].LedgerSeq );

    } );
}


/**
 *  getLedger gets, parses, and verifies the ledger entry
 *  corresponding to the given ledger sequence/index number
 *  or ledger hash
 */

function getLedger( dbs, ledgerIdentifier, callback ) {

  getLedgerFromLocalRippled( dbs, ledgerIdentifier, function( err, ledger ) {

    if ( err ) {
      winston.error( "Error getting ledger: " + ledgerIdentifier +
        "from local rippled, err: " + err );
      callback( err );
      return;
    }

    if ( ledger ) {

      callback( null, ledger );

    } else {

      getLedgerFromRemoteRippled( ledgerIdentifier, callback );

    }
  } );
}


/**
 * getLedgerFromLocalRippled queries the local sqlite3 ledgers.db
 * for the given ledgerIdentifier, parses, and verifies it
 *
 * if there is no error the callback will be called with null
 * and either the verified ledger or null if the local db
 * does not contain a valid entry for that ledgerIdentifier
 */

function getLedgerFromLocalRippled( dbs, ledgerIdentifier, callback ) {

  dbs.ledb.all( "SELECT * FROM Ledgers WHERE " +
    ( typeof ledgerIdentifier === "number" ? "LedgerSeq" : "LedgerHash" ) +
    " = ?;", [ ledgerIdentifier ],
    function( err, rows ) {

      if ( err ) {
        winston.error( "Error getting ledger from local rippled: " + err );
        callback( err );
        return;
      }

      if ( rows.length === 0 ) {
        callback( null, null );
        return;
      }

      // if there are 1 or more rows returned, verify that
      // the correct header is among them
      verifyAndSelectHeader( dbs, rows, function( err, correctHeader ) {

        if ( err ) {
          winston.error( "Error with verifyAndSelectHeader for rows:\n  " +
            JSON.stringify( rows ) + "\n  err:" + err );
          callback( err );
          return;
        }

        if ( !correctHeader ) {
          callback( null, null );
          return;
        }

        attachTransactionsToRawHeader( dbs, correctHeader, function( err, fullRawLedger ) {

          if ( err ) {
            winston.error( "Error with attachTransactionsToRawHeader for " + 
              "correctHeader:\n  " +
              JSON.stringify( correctHeader ) + "\n  err:" + err );
            callback( err );
            return;
          }

          parseAndVerifyRawLedger( fullRawLedger, callback );

        } );
      } );
    } );
}


/**
 *  verifyAndSelectHeader looks ahead in the ledger hash chain
 *  to verify the given header or select which of the given
 *  conflicting headers is the correct one
 *
 *  if the headers cannot be verified locally, then the
 *  callback will be called with (null, null)
 */

function verifyAndSelectHeader( dbs, rows, callback ) {

  dbs.ledb.all( "SELECT PrevHash FROM Ledgers WHERE LedgerSeq = ?", 
    [ rows[ 0 ].LedgerSeq + 1 ],
    function( err, nextRows ) {

      if ( err ) {
        winston.error( "Error in verifyAndSelectHeader, trying to get header for ledger: " +
          ( rows[ 0 ].LedgerSeq + 1 ) + ", err: " + err );
        callback( err );
        return;
      }

      if ( nextRows.length === 0 ) {

        // header cannot be verified locally
        callback( null, null );
        return;

      } else if ( nextRows.length === 1 ) {

        selectCorrectHeader( rows, nextRows[ 0 ], callback );

      } else if ( nextRows.length > 1 ) {

        // step forward in the ledger chain to try to identify
        // which of the headers in nextRows is the correct one
        verifyAndSelectHeader( dbs, nextRows, function( err, nextHeader ) {

          if ( err ) {
            callback( err );
            return;
          }

          if ( !nextHeader ) {
            callback( null, null );
            return;
          }

          selectCorrectHeader( rows, nextHeader, callback );

        } );
      }
    } );
}


/**
 *  selectCorrectHeader takes an array of possible headers
 *  and the correct next header and finds the correct
 *  header in the set of possible ones based on the PrevHash of the next header
 *
 *  if none of the possible headers are correct the callback
 *  will be called with (null, null)
 */

function selectCorrectHeader( possibleHeaders, nextHeader, callback ) {

  var correctHeader = _.find( possibleHeaders, function( header ) {
    return header.LedgerHash === nextHeader.PrevHash;
  } );

  if ( !correctHeader ) {
    callback( null, null );
    return;
  }

  if ( possibleHeaders.length > 1 ) {
    correctHeader.conflicting_ledger_headers = _.filter( possibleHeaders, function( header ) {
      return header.LedgerHash !== nextHeader.PrevHash;
    } );
  }

  callback( null, correctHeader );

}


/**
 *  attachTransactionsToRawHeader pulls the transactions associated
 *  with the given ledger header from the local rippled and verifies
 *  that they match the header's TransSetHash
 *
 *  if the hash of the transactions do not match the TransSetHash
 *  the callback will be called with (null, null)
 */

function attachTransactionsToRawHeader( dbs, header, callback ) {

  dbs.txdb.all( "SELECT * FROM Transactions WHERE LedgerSeq = ?;", [ header.LedgerSeq ],
    function( err, rows ) {

      if ( err ) {
        winston.error( "Error getting transactions for ledger: " + header.LedgerSeq +
          ", err: " + err );
        callback( err );
        return;
      }

      header.transactions = rows;
      callback( null, header );

    } );
}


/**
 *  parseAndVerifyRawLedger parses the fields and
 *  verifies that the parsed transactions match the transaction_hash
 *
 *  if the transactions do not hash to the transaction_hash
 *  the callback will be called with (null, null)
 */

function parseAndVerifyRawLedger( rawLedger, callback ) {

  var ledger = {
    account_hash: rawLedger.AccountSetHash,
    close_time_rpepoch: rawLedger.ClosingTime,
    close_time_timestamp: ripple.utils.toTimestamp( rawLedger.ClosingTime ),
    close_time_human: moment( ripple.utils.toTimestamp( rawLedger.ClosingTime ) )
      .utc( ).format( "YYYY-MM-DD HH:mm:ss Z" ),
    close_time_resolution: rawLedger.CloseTimeRes,
    ledger_hash: rawLedger.LedgerHash,
    ledger_index: rawLedger.LedgerSeq,
    parent_hash: rawLedger.PrevHash,
    total_coins: rawLedger.TotalCoins,
    transaction_hash: rawLedger.TransSetHash
  }

  ledger.transactions = _.map( rawLedger.transactions, function( rawTx ) {

    var parsedTx = blobToJSON( rawTx.RawTxn );
    parsedTx.metaData = blobToJSON( rawTx.TxnMeta );

    // add exchange_rate to Offer nodes in the metaData
    parsedTx.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;

      if ( node.LedgerEntryType !== "Offer" ) {
        return;
      }

      var fields = node.FinalFields || node.NewFields;

      if ( typeof fields.BookDirectory === "string" ) {
        node.exchange_rate = ripple.Amount.from_quality( fields.BookDirectory )
          .to_json( ).value;
      }

    } );

    return parsedTx;
  } );

  if ( verifyLedgerTransactions( ledger ) ) {
    callback( null, ledger );
  } else {
    callback( null, null );
  }

}


/**
 *  blobToJSON deserializes encoded blob objects and returns
 *  their JSON representation
 */

function blobToJSON( blob ) {

  var buff = new Buffer( blob ),
    buffArray = [ ];

  for ( var i = 0, len = buff.length; i < len; i++ ) {
    buffArray.push( buff[ i ] );
  }

  return ( new ripple.SerializedObject( buffArray ).to_json( ) );
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
 *  getLedgerFromRemoteRippled queries a remote for the ledger
 *  corresponding to the given ledgerIdentifier, verifies that
 *  the header matches the next ledger's PrevHash, and verifies
 *  that the transactions hash to the transaction_hash
 */

function getLedgerFromRemoteRippled( ledgerIdentifier, callback ) {

  ;( function tryServer( server_num ) {

    if (!ledgerIdentifier) {
      winston.error("ledgerIdentifier is undefined");
    }

    if (!callback) {
      winston.error("callback is undefined");
    }

    if ( server_num > serverAddresses.length - 1 ) {
      callback( new Error( "getLedgerFromRemoteRippled tried all servers " +
        "but could not find correct data for ledgerIdentifier: " + ledgerIdentifier ));
      return;
    }

    
    winston.info( "getLedgerFromRemoteRippled called with ledgerIdentifier: " +
      ledgerIdentifier + " server " + serverAddresses[server_num] );


    remote.requestLedger( ledgerIdentifier, {
      transactions: true,
      expand: true
    } )
      .setServer( serverAddresses[ server_num ] )
      .callback( function( err, res ) {

        // winston.info("res 1: " + JSON.stringify(res));

        if ( err ) {
          winston.error( "Error in getLedgerFromRemoteRippled: " + err );

          setTimeout(function(){
            tryServer( ++server_num );
          }, 1000);
          return;
        }

        var ledger = formatRemoteLedger( res.ledger );

        // compare ledger.ledger_hash to the next ledger's parent_hash
        remote.requestLedger( ledger.ledger_index + 1 )
          // .set_server( serverAddresses[ server_num ] )
          .callback( function( err, res ) {

            // winston.info("res 2: " + JSON.stringify(res));

            if ( err ) {
              winston.error( "Error in getLedgerFromRemoteRippled: " + err );

              // try another server
              setTimeout(function(){
                tryServer( ++server_num );
              }, 1000);
              return;
            }

            // check ledger hash chain
            if ( res.ledger.parent_hash !== ledger.ledger_hash ) {
              // TODO how do you handle if the remote has two incorrect ledgers in a row?

              winston.error( server_addresses[ server_num ] +
                " has a broken ledger chain:\n" +
                "ledger: " + res.ledger.ledger_index +
                ", ledger_hash: " + res.ledger.ledger_hash +
                ", parent_hash: " + res.ledger.parent_hash + "\n" +
                "ledger: " + ledger.ledger_index +
                " ledger_hash: " + ledger.ledger_hash );

              setTimeout(function(){
                tryServer( ++server_num );
              }, 1000);
              return;

            }

            // check hash of transactions
            if ( verifyLedgerTransactions( ledger ) ) {

              callback( null, ledger );
              return;

            } else {

              winston.error( server_addresses[ server_num ] +
                " is returning a ledger whose transactions " +
                "do not hash to the expected value\n" +
                JSON.stringify( ledger ) );

              setTimeout(function(){
                tryServer( ++server_num );
              }, 1000);
              return;

            }
          } );
      } );


  } )( 0 );
}


/**
 *  formatRemoteLedger edits fields in the JSON format of the ledger
 *  from the remote rippled to match the local format
 */

function formatRemoteLedger( ledger ) {

  ledger.close_time_rpepoch = ledger.close_time;
  ledger.close_time_timestamp = ripple.utils.toTimestamp( ledger.close_time );
  ledger.close_time_human = moment( ripple.utils.toTimestamp( ledger.close_time ) )
    .utc( ).format( "YYYY-MM-DD HH:mm:ss Z" );
  ledger.from_rippled_api = true;

  // remove fields that do not appear in format defined above in parseLedger
  delete ledger.close_time;
  delete ledger.hash;
  delete ledger.accepted;
  delete ledger.totalCoins;
  delete ledger.closed;
  delete ledger.seqNum;

  // parse ints from strings
  ledger.ledger_index = parseInt( ledger.ledger_index, 10 );
  ledger.total_coins = parseInt( ledger.total_coins, 10 );

  // add exchange rate field to metadata entries
  ledger.transactions.forEach( function( transaction ) {
    transaction.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;

      if ( node.LedgerEntryType !== "Offer" ) {
        return;
      }

      var fields = node.FinalFields || node.NewFields;

      if ( typeof fields.BookDirectory === "string" ) {
        node.exchange_rate = ripple.Amount.from_quality( fields.BookDirectory )
          .to_json( ).value;
      }

    } );
  } );

  return ledger;
}


/**
 * getLedgerRange queries the db (or remote) for the given ledger range
 */

function getLedgerRange( dbs, startIndex, endIndex, maxIterators, callback ) {

  async.mapLimit( _.range( startIndex, endIndex ),
    maxIterators,
    function( ledgerIndex, asyncCallback ) {
      getLedger( dbs, ledgerIndex, asyncCallback );
    },
    function( err, ledgers ) {

      if ( err ) {
        winston.error( "Error getting ledger range: " + err );
        callback( err );
        return;
      }

      if ( ledgers.length === 0 ) {
        winston.info( "getLedgerRange got 0 ledgers for range", startIndex, endIndex );
      }

      callback( null, ledgers );

    }
  );
}

/**
 *  rpEpochFromTimestamp converts a javascript timestamp
 *  to a ripple epoch time (Number of seconds since the
 *  Ripple epoch: January 1st, 2000 (00:00 UTC))
 */

function rpEpochFromTimestamp( timestamp ) {
  return timestamp / 1000 - 0x386D4380;
}
var sqlite3 = require( 'sqlite3' ).verbose( ),
  winston = require( 'winston' ),
  path = require( 'path' ),
  moment = require( 'moment' ),
  _ = require( 'lodash' ),
  async = require( 'async' ),
  ripple = require( 'ripple-lib' ),
  Ledger = require( '../node_modules/ripple-lib/src/js/ripple/ledger' ).Ledger,
  Remote = ripple.Remote;

var config = require( '../config' );

var FIRSTLEDGER = 32570;
var FIRSTCLOSETIME = 410325670;


/** RippledQuerier is a constructor for an object that provides
 *  functionality to query a local rippled for a specific ledger
 *  or ledger range
 */
function RippledQuerier( maxIterators ) {

  if ( !maxIterators )
    maxIterators = 1000;

  var dbs = {
    ledb: new sqlite3.Database( path.resolve( config.dbPath 
      || "/ripple/server/db", 'ledger.db' ) ),
    txdb: new sqlite3.Database( path.resolve( config.dbPath 
      || "/ripple/server/db", 'transaction.db' ) )
  };

  var rq = {};

  rq.FIRSTLEDGER = FIRSTLEDGER;
  rq.FIRSTCLOSETIME = FIRSTCLOSETIME;


  rq.getLatestLedgerIndex = function( callback ) {
    getLatestLedgerIndex( dbs, callback );
  };

  rq.getLedger = function( ledgerIndex, callback ) {
    getLedger( dbs, ledgerIndex, callback );
  };

  rq.searchLedgerByClosingTime = function( rpepoch, callback ) {
    searchLedgerByClosingTime( dbs, rpepoch, callback );
  };

  rq.getLedgerRange = function( start, end, callback ) {
    getLedgerRange( dbs, start, end, maxIterators, callback );
  };

  rq.getLedgersForRpEpochRange = function( rpStart, rpEnd, callback ) {
    getLedgersForRpEpochRange( dbs, rpStart, rpEnd, maxIterators, callback );
  };

  // rq.getLedgersForTimeRange gets the PARSED ledgers 
  // between the two given momentjs-readable times
  rq.getLedgersForTimeRange = function( start, end, callback ) {

    var startEpoch = rpEpochFromTimestamp( moment( start ).valueOf( ) );
    var endEpoch = rpEpochFromTimestamp( moment( end ).valueOf( ) );

    getLedgersForRpEpochRange( 
      dbs, 
      startEpoch, 
      endEpoch, 
      maxIterators, 
      callback 
      );
  };

  return rq;

}




// printCallback is used as the default callback function
function printCallback( err, result ) {
  if ( err ) {
    winston.error( err );
  } else {
    winston.info( result );
  }
}


// rpEpochFromTimestamp converts the ripple epochs to a javascript timestamp
function rpEpochFromTimestamp( timestamp ) {
  return timestamp / 1000 - 0x386D4380;
}


// getRawLedger gets the raw ledger header from ledb database 
function getRawLedger( dbs, ledgerIndex, callback ) {
  if ( !callback ) callback = printCallback;
  if ( !dbs ) winston.error( "dbs is not defined in getRawLedger" );


  dbs.ledb.all( "SELECT * FROM Ledgers WHERE LedgerSeq = ?;", 
    [ ledgerIndex ],
    function( err, rows ) {
      if ( err ) {
        winston.error( "Error getting raw ledger:" + 
          ledgerIndex + " err: " + err );
        callback( err );
        return;
      }

      if ( rows.length === 0 ) {

        callback( (new Error( "dbs.ledb has no ledger of index: " + 
          ledgerIndex )) );
        return;

      } 

      verifyAndSelectHeader( dbs, ledgerIndex, rows, callback );
    } );
}


// verifyAndSelectHeader handles the case where there are multiple
// entries in the ledger db for a given ledgerIndex
// it uses the ledger hashes to (recursively) determine the correct header
// for this ledgerIndex
function verifyAndSelectHeader( dbs, ledgerIndex, possibleHeaders, callback ) {

  // winston.info( "verifyAndSelectHeader called with ledgerIndex: " + 
  //   ledgerIndex + "\n possibleHeaders: " + JSON.stringify(possibleHeaders) );

  dbs.ledb.all( "SELECT * FROM Ledgers WHERE LedgerSeq = ?;", 
    [ ledgerIndex + 1 ],
    function( err, nextRows ) {
      if ( err ) {
        winston.error( "Error getting raw ledgers to resolve conflicting headers:", 
          ledgerIndex, nextRows );
        callback( err );
        return;
      }

      if ( nextRows.length === 1 ) {

        findCorrectHeader( possibleHeaders, nextRows[ 0 ], callback );

      } else {

        verifyAndSelectHeader(
          dbs, 
          ledgerIndex + 1, 
          nextRows, 
            function(err, nextHeader) {
            if (err) {
              winston.error("Error with verifyAndSelectHeader for ledgerIndex:" + 
                (ledgerIndex + 1) + err);
              callback(err);
              return;
            }

              findCorrectHeader( possibleHeaders, nextHeader, 
                function( err, correctHeader ) {
                if (err) {
                  winston.error("Error resolving the nextHeader:" + err);
                  callback(err);
                  return;
                }

                callback( null, correctHeader );
              });
        });
      }
    });
}


// findCorrectHeader searches through the given possibleHeaders
// for the one 
function findCorrectHeader( possibleHeaders, nextHeader, callback ) {

  // winston.info( "findCorrectHeader called with\n possibleHeaders:" + 
  //   JSON.stringify(possibleHeaders) + 
  //   "\n nextHeader:" + JSON.stringify(nextHeader) );

  var correctHeader = _.find( possibleHeaders, 
          function( header ) {
          return header.LedgerHash === nextHeader.PrevHash;
        });

  // query another rippled if the correct header is 
  // not in the set of possible headers
  if (!correctHeader) {
    getLedgerFromApi( nextHeader.PrevHash, callback );
    return;
  }

  // if there are multiple possibleHeaders,
  // save the others in conflicting_ledger_headers
  correctHeader.conflicting_ledger_headers = _.filter( possibleHeaders, 
    function( header ) {
    return header.LedgerHash !== nextHeader.PrevHash;
  });

  callback( null, correctHeader );

}


// getRawTxForLedger gets the raw tx blobs from the txdb database
function getRawTxForLedger( dbs, ledgerIndex, callback ) {
  if ( !callback ) callback = printCallback;

  dbs.txdb.all( "SELECT * FROM Transactions WHERE LedgerSeq = ?;", [ ledgerIndex ],
    function( err, rows ) {
      if ( err ) {
        winston.error( "Error getting raw txs for ledger:", ledgerIndex );
        callback( err );
        return;
      }

      callback( null, rows );
    } );
}


// parseRawLedgerHeader renames ledger header field names
function parseRawLedgerHeader( rawHeader ) {

  return {
    account_hash: rawHeader.AccountSetHash,
    close_time_rpepoch: rawHeader.ClosingTime,
    close_time_timestamp: ripple.utils.toTimestamp( rawHeader.ClosingTime ),
    close_time_human: moment( ripple.utils.toTimestamp( rawHeader.ClosingTime ) )
      .utc( ).format( "YYYY-MM-DD HH:mm:ss Z" ),
    close_time_resolution: rawHeader.CloseTimeRes,
    ledger_hash: rawHeader.LedgerHash,
    ledger_index: rawHeader.LedgerSeq,
    parent_hash: rawHeader.PrevHash,
    total_coins: rawHeader.TotalCoins,
    transaction_hash: rawHeader.TransSetHash
  };

}


// blobToJSON converts encoded blob objects to their deserialized json form
function blobToJSON( blob ) {

  var buff = new Buffer( blob );
  var buffArray = [ ];
  for ( var i = 0, len = buff.length; i < len; i++ ) {
    buffArray.push( buff[ i ] );
  }

  return (new ripple.SerializedObject( buffArray ).to_json( ));
}


// parseLedger parses the raw ledger and associated raw txs into a single json ledger
function parseLedger( rawLedger, rawTxs, callback ) {

  var ledger = parseRawLedgerHeader( rawLedger );

  // store conflicting headers if there are multiple headers for a given ledger_index
  if ( rawLedger.conflicting_ledger_headers 
    && rawLedger.conflicting_ledger_headers.length > 0 ) {
    ledger.conflicting_ledger_headers = _.map( rawLedger.conflicting_ledger_headers, 
      parseRawLedgerHeader );
  }

  ledger.transactions = _.map( rawTxs, function( rawTx ) {

    var parsedTx = blobToJSON( rawTx.RawTxn );
    parsedTx.metaData = blobToJSON( rawTx.TxnMeta );

    // add exchange_rate to Offer nodes in the metaData
    for ( var n = 0, nlen = parsedTx.metaData.AffectedNodes.length; n < nlen; n++ ) {
      var node = parsedTx.metaData.AffectedNodes[ n ].CreatedNode 
      || parsedTx.metaData.AffectedNodes[ n ].ModifiedNode 
      || parsedTx.metaData.AffectedNodes[ n ].DeletedNode;
      if ( node.LedgerEntryType === "Offer" ) {

        var fields = node.FinalFields || node.NewFields;

        if ( typeof fields.BookDirectory === "string" ) {
          node.exchange_rate = ripple.Amount.from_quality( fields.BookDirectory )
            .to_json( ).value;
        }
      }
    }
    return parsedTx;

  } );


  // check that transaction hash is correct
  var ledgerJsonTxHash = Ledger.from_json( ledger ).calc_tx_hash( ).to_hex( );
  if ( ledgerJsonTxHash === ledger.transaction_hash ) {

    callback( null, ledger );

  } else {

    // winston.info("Getting ledger from API because", "\n  ledgerJsonTxHash:", ledgerJsonTxHash, "\n  ledger.transaction_hash:", ledger.transaction_hash, "\n\n  Incorrect ledger:", JSON.stringify(ledger));
    getLedgerFromApi( ledger.ledger_hash, callback );

  }
}


// getLedgerFromApi gets a ledger by its hash from a remote rippled
// used in case the local sqlite db's do not have the correct data
function getLedgerFromApi( ledgerHash, callback ) {

  winston.info("Getting ledger " + ledgerHash +
    " from rippled api");

  var remote = new Remote( {
    servers: [ {
      host: 's1.ripple.com',
      port: 443,
      secure: true
    } ]
  } );

  remote.connect( function( ) {
    remote.request_ledger( ledgerHash, {
      transactions: true,
      expand: true
    }, function( err, res ) {

      if ( err ) {
        winston.error( "Error getting ledger from rippled:", err );
        callback( err );
        return;
      }

      // add/edit fields that aren't in rippled's json format
      var ledger = res.ledger;
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
      ledger.ledger_index = parseInt(ledger.ledger_index, 10);
      ledger.total_coins = parseInt(ledger.total_coins, 10);

      // add exchange rate field to metadata entries
      ledger.transactions.forEach( function( transaction ) {
        transaction.metaData.AffectedNodes.forEach( function( affNode ) {
          var node = affNode.CreatedNode 
          || affNode.ModifiedNode 
          || affNode.DeletedNode;

          if ( node.LedgerEntryType === "Offer" ) {

            var fields = node.FinalFields || node.NewFields;

            if ( typeof fields.BookDirectory === "string" ) {
              node.exchange_rate = ripple.Amount.from_quality( fields.BookDirectory )
                .to_json( ).value;
            }
          }
        } );
      } );

      // check the transaction hash of the ledger we got from the api call
      var ledgerJsonTxHash = Ledger.from_json( ledger ).calc_tx_hash( ).to_hex( );
      if ( ledgerJsonTxHash === ledger.transaction_hash ) {

        callback( null, ledger );

      } else {

        callback( (new Error( "Error with ledger from rippled api call, " +  
          "transactions do not hash to expected value" +
          "\n  Actual:   " + ledgerJsonTxHash +
          "\n  Expected: " + ledger.transaction_hash +
          "\n\n  Ledger: " + JSON.stringify( ledger ) + "\n\n" )) );

      }
    } );
  } );
}


// getLedger gets the PARSED ledger (and associated transactions) 
// corresponding to the ledger_index
function getLedger( dbs, ledgerIndex, callback ) {
  if ( !callback ) callback = printCallback;
  if ( !dbs ) winston.error( "dbs is not defined in getLedger" );

  getRawLedger( dbs, ledgerIndex, function( err, rawLedger ) {
    if ( err ) {
      winston.error( "Error getting raw ledger:", ledgerIndex, "err:", err );
      callback( err );
      return;
    }

    getRawTxForLedger( dbs, ledgerIndex, function( err, rawTxs ) {
      if ( err ) {
        winston.error( "Error getting raw tx for ledger", ledgerIndex );
        callback( err );
        return;
      }

      parseLedger( rawLedger, rawTxs, function( err, parsedLedger ) {
        if ( err ) {
          winston.error( "Error parsing ledger:", err );
          callback( err );
          return;
        }
        callback( null, parsedLedger );
      } );
    } );
  } );
}


// getLedgerRange gets the PARSED ledgers for the given range of indices
function getLedgerRange( dbs, start, end, maxIterators, callback ) {
  if ( !callback ) callback = printCallback;
  if ( !dbs ) {
    winston.error( "dbs is not defined in getLedgerRange" );
    return;
  }

  async.mapLimit( _.range( start, end ), 
    maxIterators, 
    function( ledgerIndex, asyncCallback ) {
    getLedger( dbs, ledgerIndex, asyncCallback );
  }, function( err, ledgers ) {
    if ( err ) {
      winston.error( "Error getting ledger range:", err );
      callback( err );
      return;
    }

    if ( ledgers.length === 0 )
      winston.info( "getLedgerRange got 0 ledgers for range", start, end );

    callback( null, ledgers );
  } );

}


// getLedgersForRpEpochRange gets the PARSED ledgers that closed between the given ripple epoch times
function getLedgersForRpEpochRange( dbs, startEpoch, endEpoch, maxIterators, callback ) {
  if ( !callback ) callback = printCallback;

  if ( endEpoch < startEpoch ) {
    var temp = endEpoch;
    endEpoch = startEpoch;
    startEpoch = temp;
  }

  if ( startEpoch < FIRSTCLOSETIME ) {
    startEpoch = FIRSTCLOSETIME;
  }

  searchLedgerByClosingTime( dbs, startEpoch, function( err, startIndex ) {
    if ( err ) {
      callback( err );
      return;
    }

    searchLedgerByClosingTime( dbs, endEpoch, function( err, endIndex ) {
      if ( err ) {
        callback( err );
        return;
      }

      getLedgerRange( dbs, startIndex, endIndex + 1, maxIterators, callback );

    } );
  } );
}


// getLatestLedgerIndex gets the most recent ledger index in the ledger db
function getLatestLedgerIndex( dbs, callback ) {
  if ( !callback ) callback = printCallback;

  dbs.ledb.all( "SELECT LedgerSeq FROM Ledgers ORDER BY LedgerSeq DESC LIMIT 1;", 
    function( err, rows ) {
    if ( err ) {
      callback( err );
      return;
    }

    callback( null, rows[ 0 ].LedgerSeq );

  } );
}


// searchLedgerByClosingTime finds the ledger index of the ledger that 
// closed nearest to the given rpepoch
function searchLedgerByClosingTime( dbs, rpepoch, callback ) {
  if ( !callback ) callback = printCallback;

  if ( rpepoch < FIRSTCLOSETIME ) {
    callback( null, FIRSTLEDGER );
    return;
  }

  getLatestLedgerIndex( dbs, function( err, latestIndex ) {
    if ( err ) {
      callback( err );
      return;
    }

    getRawLedger( dbs, latestIndex, function( err, latestLedger ) {
      if ( err ) {
        callback( err );
        return;
      }

      if ( rpepoch >= latestLedger.ClosingTime ) {
        callback( null, latestIndex );
        return;
      }

      dbRecursiveSearch( 
        dbs.ledb, 
        "Ledgers", 
        "LedgerSeq", 
        FIRSTLEDGER, 
        latestIndex, 
        "ClosingTime", 
        rpepoch, 
        callback 
        );

    } );
  } );
}


// dbRecursiveSearch searches through the sqlite db for the given key, val pair
// and returns the index of the row with the closest value for the given key
function dbRecursiveSearch( db, table, index, start, end, key, val, callback ) {
  if ( !callback ) callback = printCallback;

  var numQueries = 20;

  if ( end - start <= numQueries ) {

    var queryStrFinal = "SELECT " + index + " FROM " + table + " " +
      "WHERE (" + index + ">=" + start + " " +
      "and " + index + "<" + end + " " +
      "and " + key + "<=" + val + ") " +
      "ORDER BY ABS(" + key + "-" + val + ") ASC;";

    db.all( queryStrFinal, function( err, rows ) {
      // winston.info("search got:", rows[0]);
      callback( err, rows[ 0 ][ index ] );
    } );

    return;
  }

  var indices = _.map( _.range( numQueries ), function( segment ) {
    return start + segment * Math.floor( ( end - start ) / numQueries );
  } );
  indices.push( end );

  var indexStr = indices.join( ", " ),
    queryStrRecur = "SELECT * FROM " + table + " " +
      "WHERE " + index + " IN (" + indexStr + ") " +
      "ORDER BY " + index + " ASC;";

  db.all( queryStrRecur, function( err, rows ) {

    if ( err ) {
      callback( err );
      return;
    }

    for ( var i = 0; i < rows.length - 1; i++ ) {
      // winston.info("rows[i][index]",rows[i][index], "rows[i][key]", rows[i][key], "val", val, "rows[i][index]", rows[i][index], "rows[i + 1][key]", rows[i + 1][key]);
      if ( rows[ i ][ key ] <= val && val < rows[ i + 1 ][ key ] ) {
        setImmediate( function( ) {
          dbRecursiveSearch( 
            db, 
            table, 
            index, 
            rows[ i ][ index ], 
            rows[ i + 1 ][ index ], 
            key, 
            val, 
            callback 
            );
        } );
        return;
      }
    }
    callback( (new Error( "Error in recursive search" )) );
  } );
}


module.exports = RippledQuerier;

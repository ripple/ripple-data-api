/**
 *  ledgerImporter uses the rippled API to import
 *  ledgers into a CouchDB instance
 *
 *  Available command line options:
 *
 *  - node importer.js            //historical import from current last closed ledger
 *  - node importer.js live       //live update as well as historical import
 *  - node importer.js liveOnly   //live updating only
 *  - node ledgerImporter.js <minLedger>               //historical import from current last closed ledger to specified minumum
 *  - node ledgerImporter.js <minLedger> <lastLedger>  //historical import of specified range
 */

ledgerImporter();

function ledgerImporter () {

  var fs     = require('fs'),
    winston  = require('winston'),
    request  = require('request'),
    moment   = require('moment'),
    _        = require('lodash'),
    diff     = require('deep-diff'),
    ripple   = require('ripple-lib'),
    Ledger   = require('../node_modules/ripple-lib/src/js/ripple/ledger').Ledger,
    options  = {},
    last; //last saved ledger
  
  winston.add(winston.transports.File, { filename: 'importer.log' });
      
  var env    = process.env.NODE_ENV || "development",
    config   = require('../deployment.environments.json')[env],
    DBconfig = require('../db.config.json')[env],
    db       = require('nano')(DBconfig.protocol+
      '://'  + DBconfig.username + 
      ':'    + DBconfig.password + 
      '@'    + DBconfig.host + 
      ':'    + DBconfig.port + 
      '/'    + DBconfig.database),
   indexer   = require('./indexer.js');
  
  var dbChecker = require('./dbchecker.js')(config);
  
  var options = {},
    DEBUG;
  
//absolute minimum start index must be at least 1 ... currently,
//it must be at least the index of the "effective genesis ledger"
//if (!config.startIndex || config.startIndex<1)     config.startIndex = 1;
  if (!config.startIndex || config.startIndex<32570) config.startIndex = 32570;
  
  var numericOptions = _.filter(_.map(process.argv, function(opt){
    return parseInt(opt, 10);
  }), function(num){return num;});
  
  
  if (numericOptions.length === 1) {
    options.minLedgerIndex = numericOptions[0];
    options.stopAfter      = true;
    //set the minimum ledger index to this number
    
  } else if (numericOptions.length === 2) {
    options.minLedgerIndex = _.min(numericOptions);
    options.lastLedger     = _.max(numericOptions);
    options.stopAfter      = true;
    //doing only the specified range
    
  } else {
    options.checkDB = true;   
    //check the db if we are importing everything 
  }
  
  if (process.argv.indexOf('debug3') !== -1) DEBUG = 3;
  if (process.argv.indexOf('debug2') !== -1) DEBUG = 2;
  if (process.argv.indexOf('debug1') !== -1) DEBUG = 1;
  if (process.argv.indexOf('debug')  !== -1) DEBUG = 1;
  
  var live     = (process.argv.indexOf('live')  !== -1)     ? true : false;
  var liveOnly = (process.argv.indexOf('liveonly')  !== -1) ? true : false; 

  config.debug = DEBUG;
  if (!liveOnly) importHistorical(options);
  if (live || liveOnly) importLive();
  
  function importHistorical(opts) {
    //if we are starting this process, there is definitely at 
    //least some historical gap that needs to be filled. 
    //get the last saved ledger
    //set it as the min for for historical import
    //start importing from the most recent closed ledger
    //when we hit the min, run the db checker
    //if the db checker indicates the stored data is
    //not accurate or incomplete, restart the historical 
    //importer from the last point where its correct.
    
    
    //get the last closed ledger from rippled
    //work back from there
    
    if (!opts.minLedgerIndex) {
      //get last saved ledger in the database
      getLatestLedgerSaved(function(err,res){
        if (err) return winston.error("error getting ledger from DB: "+ err);
        
        opts.minLedgerIndex = last = res.index;
        
        //start importing
        winston.info("Starting historical import ("+opts.minLedgerIndex+" to LCL)");
        startImporting(opts, function(err,res){
          if (err) {
            if (err.type && 
                err.type=='parentHash' &&
                err.index) {
              console.log(err);
              importHistorical({
                minLedgerHash : err.index, 
                checkDB       : opts.checkDB
              });
              
            } else winston.error(err);
            
          } else {
            //done importing, run the DB checker to look for
            //problems in the data
            winston.info("finished historical import");
            if (opts.checkDB) checkDB(opts);
          }
        });   
      });
    
    } else {
      //start importing
      var range = opts.lastLedger ? opts.minLedgerIndex+" to "+opts.lastLedger : opts.minLedgerIndex+" to LCL";
      winston.info("Starting historical import ("+range+")");
      

      startImporting(opts, function(err,res) {
        if (err) {
          if (err.type && 
              err.type=='parentHash' &&
              err.index &&
              !opts.stopAfter) {
            console.log(err, opts);
            importHistorical({
              minLedgerHash : err.index, 
              checkDB       : opts.checkDB
            });
          
          } else winston.error(err);
          
        } else {
          if (opts.checkDB) checkDB(opts);
          winston.info("finished historical import");
        }
      });       
    }   
  }


 /*
  * checkDB
  * 
  * This function runs over the whole database to make sure
  * everything is there, and the hash chain is correct.
  * If it doesn't get all the way to the end, we will
  * run the importer again. 
  * 
  */
  function checkDB (opts) {
    winston.info("checking DB....");
    dbChecker.checkDB(db, function(res){
      
      if (DEBUG) winston.info(res);
      var index = res.ledgerIndex;
      //index is last correct ledger.  If this is less
      //than or equal to the minimum ledger, we are done.  
      //otherwise, we set this as the last ledger and start importing
      //console.log(index, last);
      if (index>config.startIndex) importHistorical({
          minLedgerIndex : config.startIndex,
          lastLedger     : index,
          checkDB        : opts.checkDB
        });
      else winston.info("DB check complete"); 
    });    
  }


 /*
  *  importLive: import live data from rippled
  * 
  *  first, get the latest ledger from rippled and save it to the database.   
  *  we do this so that we can check every subsequent batch of live ledgers
  *  against the ledger chain stored in the database.  
  * 
  *  then we start contiuously importing from the latest, restarting each
  *  time we get back to the last saved ledger.  We may need to monitor
  *  the rate of import some day, but as of now we are more than able to 
  *  keep up with new ledger closings
  * 
  */
  function importLive() {

    winston.info("Starting live import");
    
    //get latest ledger and save it.
    getLedger({identifier:null}, function(err,ledger){
      
      if (err) {
        //check error types, make decision
        //restartLive();
        
        winston.error('error getting ledger: ' + err);
        return;  
      }
      
      saveBatchToCouchDb([ledger], function(err, saveRes){
        if (err) {
          //check error types, make decision
          //restartLive();
          winston.error('problem saving ledger batch to CouchDB: ' + err);
          return;
        }

        last = ledger.ledger_index; //track last saved ledger;

        //start batch with the next ledger as the minimum       
        startImporting({ 
          live           : true, 
          minLedgerIndex : ledger.ledger_index+1 
        }, function(err,res){
          if (err) winston.error(err);
        });
      });
    });
  }


 /*
  * startImporting: primary function for live and historical import
  * 
  */
  function startImporting (opts, callback) {
    var info;

    getLedgerBatch(opts, function(err, res){

      if (err) {
        if (err.retry) {
          winston.info(err);
          winston.info('problem getting ledger batch - Trying again in a few seconds...');

          // clear results and start again with the same options
          opts.results = [];
          setTimeout(function(){ startImporting(opts, callback); }, 5000);

          
        } else callback(err);

        return;
      }

      
      // skip empty batches, nothing to save.
      // NOTE: why should results be 0?  not happening for live
      if (res.results.length === 0) return;

      
      // check if the process was finished before starting another importIntoCouchDb process
      // NOTE: if this is live and we are reaching the batch size, we might
      // not be importing fast enough.
      if (!res.reachedMinLedger) {
        saveBatchToCouchDb(res.results, function(err, saveRes) {
          if (err) {
            
            //should be restarting here, and tracking the number of
            //times we get here - because this probably means there
            //is a connection problem or some other issue with couchDB
            winston.error('problem saving ledger batch to CouchDB: ' + err);
            callback({error:err,type:"couchDB"});
            return;
          }
        });
        
      } else {

        
        // save the batch to CouchDB, then start the next batch
        // immediately if this batch actually updated some ledgers
        // or wait a couple of seconds before starting again if not
        saveBatchToCouchDb(res.results, function(err, saveRes) {
          
          if (err) {
            //again, this wold probably occur from a connection error.
            winston.error('problem saving ledger batch to CouchDB: ' + err);
            callback({error:err,type:"couchDB"});
            return;
          }
          
          if (opts.live && !saveRes.numLedgersSaved) {
            // wait a couple of seconds for new ledgers to close before trying again
            // set the minimum to the next ledger after the one just saved.
            setTimeout(function(){
              startImporting({
                minLedgerIndex : opts.startLedger+1,
                live           : true
              }, callback);
            }, 2000);  
            return;          
          }
          

          if (saveRes.earliestLedgerIndex==config.startIndex) {
            callback(null, {message:"Reached first ledger"});  
            return;
          }
          
          // check that this set of ledgers doesn't break the hash chain
          // of the ledgers already in the database,
          // if it does rerun the script over the entire problem section
          // (either the ledgers before this set or after it)
          db.fetch({keys: [
            addLeadingZeros(saveRes.earliestLedgerIndex - 1),
            addLeadingZeros(saveRes.earliestLedgerIndex),
            addLeadingZeros(saveRes.earliestLedgerIndex + saveRes.numLedgersSaved),
            addLeadingZeros(saveRes.earliestLedgerIndex + saveRes.numLedgersSaved + 1)
            ]}, function(err, res) {

            if (err) {
              winston.error(err);
              winston.info('problem determining whether hash chain is complete, trying this batch again...');
              return setImmediate(function(){startImporting(opts,callback);});
            }

            // newly saved ledgers don't continue hash chain of the ledgers
            // preceding them that are already in the database
            if (!res || !res.rows || res.rows.length === 0 || !res.rows[0].doc || 
              res.rows[0].doc.ledger_hash !== res.rows[1].doc.parent_hash) {
              info = 'The parent_hash of the earliest ledger saved in this batch ' +
                '(ledger_index: ' + saveRes.earliestLedgerIndex + ') ' +
                'did not match the ledger_hash of the ledger before it in the database. ';
              
              
              if (opts.live) {
                //start again, but set the minumum back a few ledgers
                if (DEBUG) winston.info(info);
                return setImmediate(function(){ startImporting({
                    minLedgerIndex : saveRes.earliestLedgerIndex-10,
                    live           : true
                  }, callback); 
                });
                
              } else {
                return callback({error:info,type:'parentHash',index:(saveRes.earliestLedgerIndex-10)});
                /*
                opts = {
                  startLedger    : opts.startLedger,
                  minLedgerIndex : Math.min(opts.minLedgerIndex, saveRes.earliestLedgerIndex - 100),
                  lastLedger     : saveRes.earliestLedgerIndex + saveRes.numLedgersSaved,
                  stopAfterRange : opts.stopAfterRange                
                };
                 
                 */ 
              }
            }

            // newly updated ledgers break hash chain with the ledgers that come
            // immediately after this set that are already in the database
            if (!res.rows[2].error && !res.rows[3].error && res.rows[2].doc.ledger_hash !== res.rows[3].doc.parent_hash) {
              info = 'The ledger_hash of the last ledger saved in this batch ' + 
                '(ledger_index: ' + (saveRes.earliestLedgerIndex + saveRes.numLedgersSaved) + ') ' +
                'did not match the parent_hash of the ledger after them in the database. ';
                

              //NOTE: maybe we should never be here with live?
              if (opts.live) {
                return setImmediate(function(){ startImporting({
                    minLedgerIndex : opts.minLedgerIndex,
                    live           : true
                  }, callback); 
                });             
              }
              
              return callback({error:info});
              /*
              getLatestLedgerSaved(function(err, latestLedger){
                if (err) return console.log('problem gettting latest ledger in CouchDB: ' + err);
                
                console.log('Restarting with lastLedger set later...');
                setTimeout(function(){
                  startImporting({
                    startLedger    : opts.startLedger,
                    minLedgerIndex : saveRes.earliestLedgerIndex,
                    lastLedger     : Math.min(parseInt(latestLedger.ledger_index, 10), saveRes.earliestLedgerIndex + saveRes.numLedgersSaved + 100),
                    stopAfterRange : opts.stopAfterRange
                  });
                }, 500);
              });
              */

            }
            
            //at this point we successfully saved all the ledgers intended
            var index = saveRes.earliestLedgerIndex + saveRes.numLedgersSaved;
            
            
            if (opts.live) { 
              last = index; //track last saved ledger
              
              //if we are live, we want to start the process again.
              setImmediate(function(){
                startImporting({
                  minLedgerIndex : opts.startLedger,
                  live           : true
                }, callback);
              }); 
                          
            } else {
              //this probably will only be true if the live importer isnt running
              if (index>last) last = index; 
              callback(null, {message:"Reached min ledger"});              
            } 
          });
        });
      }
    });
  }
  

  /*** LEDGER GETTER FUNCTIONS ***/
  
  
  
 /**
  *  getLedgerBatch starts from a specified ledger or the most recently
  *  closed one and uses the rippled API to get the batch of ledgers
  *  one by one, walking the ledger hash chain backwards until it reaches the minLedger
  *
  *  Available options:
  *  {
  *    lastLedger: ledger_hash or ledger_index, defaults to last closed ledger
  *    minLedgerIndex: ledger_index,
  *    minLedgerHash: ledger_hash
  *  }
  */
  function getLedgerBatch (opts, callback) {
  
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
  
    if (!opts.lastLedger) {
      opts.lastLedger = null;
    }
  
    var batchSize = config.batchSize || 1000;
    
    if (!opts.results) {
      opts.results = [];
    }
  
    // get ledger from rippled API
    getLedger({
      identifier: opts.lastLedger
    }, function(err, ledger){
      if (err) {
        callback({error:err,retry:true});
        return;
      }
  
      //console.log(ledger.ledger_index, ledger.close_time_human);
      
      if (!opts.startLedger) {
        opts.startLedger = ledger.ledger_index;
      }
  
      if (opts.minLedgerIndex < config.startIndex) {
        callback({message:"minLedger index is outside required range", retry:false});
        return;
        //opts.minLedgerIndex = config.startIndex;
      }
  
      opts.results.push(ledger);
      //console.log(opts.results.length, ledger.ledger_index);
  
      // Use parent_hash or ledger_index as lastLedger
      if (/[0-9A-F]{64}/.test(ledger.parent_hash)) {
        opts.lastLedger = ledger.parent_hash;      
      } else if (typeof ledger.ledger_index === 'number'){
        opts.lastLedger = ledger.ledger_index - 1;
      } else {
        callback({error:'Malformed ledger: ' + JSON.stringify(ledger), retry:true});
      }
  
      opts.prevLedgerIndex = ledger.ledger_index;
  
      // determine whether the process has reached the minLedgerHash or minLedgerIndex
      var reachedMinLedger = ((opts.minLedgerIndex && opts.minLedgerIndex >= ledger.ledger_index) || opts.minLedgerHash === ledger.ledger_hash);
      
      if (opts.results.length >= batchSize || reachedMinLedger) {
        callback(null, {
          results: opts.results.slice(),
          reachedMinLedger: reachedMinLedger
        });
        opts.results = [];
      }
  
      // if the process has not yet reached the minLedgerIndex
      // continue with the next ledger batch
      if (reachedMinLedger) { 
        if (DEBUG && !opts.live) winston.info ("Reached Min Ledger: " + ledger.ledger_index);
      } else {
        setImmediate(function(){
          getLedgerBatch(opts, callback);
        });
      }
    });
  }

  
  
 /**
  *  getLedger uses the rippled API to get the ledger
  *  corresponding to the given identifier, or the last 
  *  closed ledger if identifier is null
  *
  *  identifier: ledger_index or ledger_hash
  */
  function getLedger (opts, callback) {
  
    var identifier    = opts.identifier,
      prevLedgerIndex = opts.prevLedgerIndex,
      servers         = opts.servers
      
    if (typeof identifier === 'function' && !callback) {
      callback = identifier;
      identifier = null;
    }
  
    var reqData = { 
      'method' : 'ledger', 
      'params' : [ { 
        'transactions' : true, 
        'expand'       : true
      } ] };
         
  
    // set reqData params based on identifier, default to 'closed' if none is specified
    if (typeof identifier === 'number') {
      reqData.params[0].ledger_index = identifier;
    } else if (typeof identifier === 'string') {
      reqData.params[0].ledger_hash = identifier;
    } else {
      reqData.params[0].ledger_index = 'closed';
    }
  
    // TODO check that this servers object is being updated correctly
  
    // store server statuses (reset for each ledger identifier)
    if (!servers) {
      servers = _.map(config.rippleds, function(serv){
        return {
          server: serv,
          attempt: 0
        };
      });
    }
  
    var serverEntry = _.min(servers, function(serv){ return serv.attempt; }),
      server = serverEntry.server;
  
    if (serverEntry.attempt >= 2) {
      callback(new Error('ledger ' + 
        (reqData.params[0].ledger_index || reqData.params[0].ledger_hash) + 
        ' not available from any of the rippleds'));
      return;
    }
  
    if (DEBUG>2) {winston.info('Getting ledger ' + identifier + ' from server: ' + server)}
  
    // get ledger using JSON API
    request({
      url     : server,
      method  : 'POST',
      json    : reqData,
      timeout : 20000
    }, requestHandler);
  
  
    function requestHandler (err, res) {
      if (err) {
        var id = reqData.params[0].ledger_index || reqData.params[0].ledger_hash || "\'CLOSED\'"
        winston.error('error getting ledger: ' + id + 
          ' from server: ' + server + ' err: ' + JSON.stringify(err) + 
          '\nTrying next server...');
  
        _.find(servers, function(serv){ return serv.server === server; }).attempt++;
  
        setImmediate(function(){
          getLedger ({
            identifier : identifier,
            servers    : servers}
            , callback);
        });
        return;
      }
  
      // check if the server returned a buffer/string instead of json
      if (typeof res.body === 'string' || res.body.constructor.name === 'Buffer') {
        // console.log('rippled returned a buffer instead of a JSON object for request: ' + 
        //   JSON.stringify(reqData.params[0]) + '. Trying again...');
        // servers[server] = 'tryAgain';
  
        _.find(servers, function(serv){ return serv.server === server; }).attempt++;
  
        setTimeout(function(){
          getLedger ({
            identifier: identifier,
            servers: servers
            }, callback);
        }, 1000);
        return;
      }
  
      // handle ledgerNotFound
      if (res.body.result.error === 'ledgerNotFound') {
        if (DEBUG) winston.error("Ledger not found.");
  
        _.find(servers, function(serv){ return serv.server === server; }).attempt++;
  
        setImmediate(function(){
          getLedger ({
            identifier: identifier,
            prevLedgerIndex: prevLedgerIndex,
            servers: servers
          }, callback);
        });
        return;
      }
  
      // handle malformed response
      if (!res || !res.body || !res.body.result || (!res.body.result.ledger && !res.body.result.closed)) {
        // console.log('trouble getting ledger ' + 
        //   (identifier || 'closed') + 
        //   ', server responded with: ' + 
        //   JSON.stringify(res.error || res.body || res));
        
        if (DEBUG && res.body) winston.info('error getting ledger:', res.body);
        else if (DEBUG && res) winston.info('error getting ledger:', res);
      
        _.find(servers, function(serv){ return serv.server === server; }).attempt++;
        
        setImmediate(function(){
          getLedger ({
            identifier: identifier,
            prevLedgerIndex: prevLedgerIndex,
            servers: servers
          }, callback);
        });
        return;
      }
  
      // format remote ledger
      var remoteLedger = (res.body.result.closed ? res.body.result.closed.ledger : res.body.result.ledger),
        ledger = formatRemoteLedger(remoteLedger);
  
      // check for malformed ledger
      if (!ledger || !ledger.ledger_index || !ledger.ledger_hash) {
        winston.info('got malformed ledger from ' + 
          (server === 'http://0.0.0.0:51234' ? 'http://ct.ripple.com:51234' : server) + ': ' + 
          JSON.stringify(ledger));
  
        _.find(servers, function(serv){ return serv.server === server; }).attempt++;
  
        setImmediate(function(){
          getLedger ({
            identifier: identifier,
            prevLedgerIndex: prevLedgerIndex,
            servers: servers
          }, callback);
        });
  
        return;
      }
  
      // keep track of which server ledgers came from
      ledger.server = (server === 'http://0.0.0.0:51234' ? 'http://ct.ripple.com:51234' : server);
  
      // check that transactions hash to the expected value
      var ledgerJsonTxHash;
      try {
       ledgerJsonTxHash = Ledger.from_json(ledger).calc_tx_hash().to_hex();
      } catch(e) {
        winston.error('Error calculating transaction hash: ', e, e.stack);
        ledgerJsonTxHash = '';
      }
      if (ledgerJsonTxHash && ledgerJsonTxHash !== ledger.transaction_hash) {
  
        winston.info('transactions do not hash to the expected value for ' + 
          'ledger_index: ' + ledger.ledger_index + '\n' +
          'ledger_hash: ' + ledger.ledger_hash + '\n' +
          'actual transaction_hash:   ' + ledgerJsonTxHash + '\n' +
          'expected transaction_hash: ' + ledger.transaction_hash);
  
        _.find(servers, function(serv){ return serv.server === server; }).attempt++;
  
        setImmediate(function(){
          getLedger ({
            identifier: identifier,
            prevLedgerIndex: prevLedgerIndex,
            servers: servers
          }, callback);
        });
  
        return;
      }
  
      if (DEBUG>2) winston.info('Got ledger: ' + ledger.ledger_index);  
      callback(null, ledger);
  
    }
  }
  
 /**
  *  formatRemoteLedger makes slight modifications to the
  *  ledger json format, according to the format used in the CouchDB database
  */
  function formatRemoteLedger(ledger) {
  
    ledger.close_time_rpepoch = ledger.close_time;
    ledger.close_time_timestamp = ripple.utils.toTimestamp(ledger.close_time);
    ledger.close_time_human = moment(ripple.utils.toTimestamp(ledger.close_time))
      .utc().format("YYYY-MM-DD HH:mm:ss Z");
    ledger.from_rippled_api = true;
  
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
    ledger.transactions.forEach(function(transaction) {
      if(!transaction.metaData) {
        winston.info('transaction in ledger: ' + ledger.ledger_index + ' does not have metaData');
        return;
      }
  
      transaction.metaData.AffectedNodes.forEach(function(affNode) {
  
        var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;
  
        if (node.LedgerEntryType !== "Offer") {
          return;
        }
  
        var fields = node.FinalFields || node.NewFields;
  
        if (typeof fields.BookDirectory === "string") {
          node.exchange_rate = ripple.Amount.from_quality(fields.BookDirectory).to_json().value;
        }
  
      });
    });
  
    return ledger;
  }



 /*** COUCHDB FUNCTIONS ***/
  
  
 /**
  *  getLatestLedgerSaved gets the ledger with the highest
  *  index saved in CouchDB
  */  
  function getLatestLedgerSaved(callback) {
    db.list({descending:true, startkey:'_c', limit: 20}, function(err, res){
      if (err) {
        callback(err);
        return;
      }
      
      if (!res.rows.length) return callback(null, {index:1,hash:null}); //no ledgers saved, ledgerIndex = 1;
      
      var latestIndex = _.find(res.rows, function(row){      
        try {
          return (row.id.length === 10 && parseInt(row.id, 10) > config.startIndex);
        } catch (e) {
          return false;
        }
      }).id;
  
      db.get(latestIndex, function(err, res){
        if (err) {
          callback(err);
          return;
        }
  
        // console.log('Latest ledger in CouchDB: ledger_index ' + res.ledger_index + 
        //   ' ledger_hash ' + res.ledger_hash + 
        //   ' closed at ' + res.close_time_human);
  
        callback(null, {
          hash: res.ledger_hash,
          index: res.ledger_index
        });
  
      });
    });
  }
  
  
 /**
  * addLeadingZeros converts numbers to strings and pads them with
  * leading zeros up to the given number of digits
  */
  function addLeadingZeros (number, digits) {
  
    if (!digits)
      digits = 10;
  
    var numStr = String(number);
  
    while(numStr.length < digits) {
      numStr = "0" + numStr;
    }
  
    return numStr;
  
  }
  
  
 /**
  *  saveBatchToCouchDb saves all of the new or updated ledgers
  *  in the given batch to the CouchDB instance
  */
  function saveBatchToCouchDb (ledgerBatch, callback) {
  
    // console.log('Saving ' + ledgerBatch.length + ' ledgers');
  
    ledgerBatch.sort(function(a, b){
      return a.ledger_index - b.ledger_index;
    });
  
    // add doc ids to the ledgers
    _.each(ledgerBatch, function(ledger){
      ledger._id = addLeadingZeros(ledger.ledger_index);
    });
  
    var firstLedger = Math.min(ledgerBatch[0].ledger_index, ledgerBatch[ledgerBatch.length-1].ledger_index),
      lastLedger = Math.max(ledgerBatch[0].ledger_index, ledgerBatch[ledgerBatch.length-1].ledger_index);
  
    db.fetch({
      keys: _.map(_.range(firstLedger, lastLedger + 1), function(num){ return addLeadingZeros(num, 10); })
    }, function(err, res){
      if (err) {
        callback(err);
        return;
      }
  
      // add _rev values to the docs that will be updated
      _.each(res.rows, function(row){
        var index = _.findIndex(ledgerBatch, function(ledger){
          return (row.id === ledger._id);
        });
  
        // skip this one if that ledger is not already in the db (error 'not found')
        if (row.error) {
          return;
        }
  
        ledgerBatch[index]._rev = row.value.rev;
  
        // don't update docs that haven't been modified
        var diffRes = diff(ledgerBatch[index], row.doc);
        if (!diffRes || (diffRes.length === 1 && diffRes[0].path[0] === 'server')) {
          ledgerBatch[index].noUpdate = true;
        } else {
          if (DEBUG>2) winston.info('Replacing ledger ' + row.doc.ledger_index + 
            '\n   Previous: ' + JSON.stringify(row.doc) +
            '\n   Replacement: ' + JSON.stringify(ledgerBatch[index]));
          else if (DEBUG) winston.info('Replacing ledger ' + row.doc.ledger_index);  
        }
  
      });
  
      var docs = _.filter(ledgerBatch, function(ledger){
        return !ledger.noUpdate;
      });
  
      if (docs.length === 0) {
        if (DEBUG>1) winston.info('Saved 0 ledgers from ' + firstLedger + 
          ' to ' + lastLedger + 
          ' to CouchDB (' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ')');
  
        callback(null, {
          numLedgersSaved: 0, 
          earliestLedgerIndex: ledgerBatch[0].ledger_index
        });
        return;
      }
  
      db.bulk({docs: docs}, function(err){
        if (err) {
          callback(err);
          return;
        }
  
        if (DEBUG) {
          if (docs.length==1) winston.info('Saved ledger: ' + firstLedger +  
            ' to CouchDB (' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ')');
            
          else winston.info('Saved ' + docs.length + ' ledgers from ' + firstLedger + 
            ' to ' + lastLedger + 
            ' to CouchDB (' + moment().format("YYYY-MM-DD HH:mm:ss Z") + ')');
        }
        //re - index here
        indexer.pingCouchDB();
        
        
        callback(null, {
          numLedgersSaved: docs.length,
          earliestLedgerIndex: ledgerBatch[0].ledger_index
        });
      });
    });
  }
}

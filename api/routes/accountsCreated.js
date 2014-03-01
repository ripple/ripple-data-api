var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash');
  
  
/**
 *  accountsCreated returns the number of accounts created per time increment
 *  expects req.body to have:
 *  {
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    descending: true/false, // optional, defaults to true
 *    format: 'json', 'csv', or 'json_verbose'
 *  }
 */
function accountsCreated( req, res ) {

  var viewOpts = {};

  // parse startTime and endTime
  // TODO handle incorrect startTime/endTime values
  var startTime, endTime;
  if (!req.body.startTime && !req.body.endTime) {
    // default
    startTime = moment.utc().subtract('days', 30);
    endTime = moment.utc();
  } else if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
    startTime = moment.utc(req.body.startTime);
    endTime = moment.utc(req.body.endTime);
  } else {
    endTime = moment.utc(req.body.startTime);
    startTime = moment.utc(req.body.endTime);
  } 

  // handle descending/non-descending query
  if (!req.body.hasOwnProperty('descending') || req.body.descending === true) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;
  }

  // set startkey and endkey for couchdb query
  viewOpts.startkey = startTime.toArray().slice(0,6);
  viewOpts.endkey = endTime.toArray().slice(0,6);

  // always reduce
  viewOpts.reduce = true;
  var inc = req.body.timeIncrement ? req.body.timeIncrement.toLowerCase() : null;
  
  // determine the group_level from the timeIncrement field
  if (inc) {
    var levels = ['year', 'month', 'day', 'hour', 'minute', 'second'];
    if (inc === 'all') {
      viewOpts.group = false;
      
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 1 + levels.indexOf(inc);
    } else {
      viewOpts.group_level = 1 + 2; // default to day
    }
    
  } else {
    // TODO handle incorrect options better
    viewOpts.group_level = 1 + 2; // default to day
  }

  //winston.info('viewOpts: ' + JSON.stringify(viewOpts));

  db.view('accountsCreated', 'v1', viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }

    //winston.info('Got ' + couchRes.rows.length + ' rows');
    //winston.info(JSON.stringify(couchRes.rows));

    // prepare results to send back
    var resRows = [],
      headerRow = [
        'time', 
        'accountsCreated'
      ];
      
   resRows.push(headerRow);   

/*
  
  //get the number of accounts on the genesis ledger - 
  //the total is 136, we dont need to check every time -
  //just left this here to see the logic for arriving at 136
  
  var l     = require('../db/32570_full.json').result.ledger;
  var genAccounts = 0;
  for (var i=0; i<l.accountState.length; i++) {
    var obj =  l.accountState[i]; 
    if (obj.LedgerEntryType=="AccountRoot") genAccounts++;
  }

  console.log(genAccounts);
  
*/
  
  
/* below is a workaround for the fact that we dont have ledger history
   before ledger #32570 */ 
   
    var genTime = moment("2013/1/2"); //date of genesis ledger
    var genAccounts = 136;
    
//if we are getting a total, add the genesis acounts if
//the time range includes the genesis ledger  
    if (inc=='all') { 
      if (endTime.isBefore(genTime) &&
        startTime.isAfter(genTime)) {

        
        if (couchRes.rows.length) {
          couchRes.rows[0].value += genAccounts;
        } else {
          couchRes.rows.push({key:null,value:genAccounts});
        }
      }
 
//if we are getting intervals, add the genesis accounts to the
//first interval if it is the same date as the genesis ledger               
    } else if (couchRes.rows.length) {
      var index = req.body.descending === false ? 0 : couchRes.rows.length-1;
      var time  = moment.utc(couchRes.rows[index].key);

      if (time.format("YYY-MM-DD")==genTime.format("YYY-MM-DD")) {
        couchRes.rows[index].value += genAccounts;  
      }
    }  
    
    couchRes.rows.forEach(function(row){
      resRows.push([
        (row.key ? moment.utc(row.key).format(DATEFORMAT) : ''),
        row.value
        ]);
    });

    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // TODO include time sent?
      res.send(resRows);

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(resRows, function(row){
        return row.join(', ');
      }).join('\n');

      // TODO make this download instead of display
      res.setHeader('Content-disposition', 'attachment; filename=offersExercised.csv');
      res.setHeader('Content-type', 'text/csv');
      res.charset = 'UTF-8';
      res.end(csvStr);

    } else if (req.body.format === 'json_verbose') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(couchRes.rows, function(row){

        // reformat rows
        return {
          openTime: (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
          accountsCreated: row.value
        };

      });

      res.json(apiRes);

    } else {

      winston.error('incorrect format: ' + req.body.format);
      res.send(500, 'Invalid format: '+ req.body.format);
    }

  });

}

module.exports = accountsCreated;
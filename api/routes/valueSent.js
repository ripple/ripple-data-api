var winston = require('winston'),
  moment    = require('moment'),
  tools     = require('../utils');
  
  
/**
 * valueSent - get the amount of value sent from any account for a specific currency over time. 
 * 
 * request: {
 *
 *  currency   : ("XRP", "USD", etc.)     //required
 *  issuer     : ("bitstamp", "rxSza...") //required
 *    
 *  start      : // range start date + time
 *  end        : // range end date + time
 *  interval   : // second, minute, etc
 *  descending : // true/false - optional, defaults to false
 *  reduce     : // true/false - optional, defaults to true
 * }
 *
 * response: {
 *  
 *  currency : //from request
 *  issuer   : //from request 
 *  results  : [
 *    ["time","originVolume","destinationVolume"], 
 *    [
 *      time,
 *      originVolume,
 *      destinationVolume
 *    ],
 *            .
 *            .
 *            .
 *            .
 *    ]
 *  }
 *
 */



function valueSent( req, res ) {
  
//Parse start and end times
  var time = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
  
  if (time.error) res.send(500, { error: time.error });
  
  var startTime = time.start;
  var endTime   = time.end;

//Parse timeIncrement and timeMultiple
  var results = tools.parseTimeIncrement(req.body.timeIncrement);
  var group          = results.group;
  var group_level    = results.group_level;
  var group_multiple = results.group_multiple;
  
  if (typeof req.body.timeMultiple === 'number') {
    group_multiple = group_multiple ? group_multiple*req.body.timeMultiple : req.body.timeMultiple;
  } else {
    group_multiple = 1;
  }
  
  
}

module.exports = valueSent;
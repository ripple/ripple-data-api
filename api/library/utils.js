var moment           = require('moment');
var SerializedObject = require('ripple-lib').SerializedObject;

/**
 * formatTime
 */

module.exports.formatTime = function(time, interval) {
  var format = 'YYYYMMDD';

  if (interval !== 'day') {
    format += 'HHmmss';
  }

  if (typeof time === 'number') {
    t = moment.unix(time).utc();
  } else {
    t = moment.utc(time);
  }
  return t.format(format);
};

/**
 * unformatTime
 */

module.exports.unformatTime = function(time) {
  var t = [
    parseInt(time.slice(0, 4) || 0, 10),     //year
    parseInt(time.slice(4, 6) || 0, 10) - 1, //month
    parseInt(time.slice(6, 8) || 0, 10),     //day
    parseInt(time.slice(8, 10) || 0, 10),    //hour
    parseInt(time.slice(10, 12) || 0, 10),   //minute
    parseInt(time.slice(12, 14) || 0, 10),   //second
  ]

  return moment.utc(t);
};

/**
 * reverseTimestamp
 */

module.exports.reverseTimestamp = function(time) {
  time = parseInt(module.exports.formatTime(time), 10);
  return 70000000000000 - time;
};

/**
 * padNumber
 */

module.exports.padNumber = function (num, size) {
  var s = num+"";
  if (!size) size = 10;
  while (s.length < size) s = "0" + s;
  return s;
};

/**
 * formatTime
 * Convert json to binary/hex to store as raw data
 */

module.exports.toHex = function (input) {
  return new SerializedObject.from_json(input).to_hex();
}

/*
 * getAlignedTime - uses the interval and multiple
 * to align the time to a consistent series, such as 9:00, 9:05, 9:10...
 * rather than 9:03, 9:08, 9:13...
 */

module.exports.getAlignedTime = function (original, interval, multiple) {
  var time = moment.utc(original); //clone the original
  if (!multiple) multiple = 1;

  interval = interval ? interval.slice(0,3) : null;

  if (interval === 'day' && multiple === 7) {
    interval = 'wee';
    multiple = 1;
  }

  if (interval === 'sec') {
    time.startOf('second');
    if (multiple > 1) {
      time.subtract(time.seconds()%multiple, 'seconds');
    }

  } else if (interval === 'min') {
    time.startOf('minute');
    if (multiple > 1) {
      time.subtract(time.minutes()%multiple, 'minutes');
    }

  } else if (interval === 'hou') {
    time.startOf('hour');
    if (multiple > 1) {
      time.subtract(time.hours()%multiple, 'hours');
    }

  } else if (interval === 'day') {
    var days;
    var diff;

    if (multiple === 1) {
      days = 0;

    } else {
      diff = time.diff(moment.utc([2013,0,1]), 'hours')/24;
      if (diff<0) days = multiple - (0 - Math.floor(diff))%multiple;
      else days = Math.floor(diff)%multiple;
    }

    time.startOf('day');
    if (days) {
      time.subtract(days, 'days');
    }

  } else if (interval === 'wee') {
    time.startOf('isoWeek');
    if (multiple > 1) {
      time.subtract(time.weeks()%multiple, 'weeks');
    }

  } else if (interval === 'mon') {
    time.startOf('month');
    if (multiple > 1) {
      time.subtract(time.months()%multiple, 'months');
    }
  } else if (interval === 'yea') {
    time.startOf('year')
    if (multiple > 1) {
      time.subtract(time.years()%multiple, 'years');
    }
  }

  return time;
}

/*
 * get XRP to specified currency conversion
 */

exports.getConversion = function (params, callback) {
  var options = {
    base       : {currency:"XRP"},
    counter    : {currency:params.currency,issuer:params.issuer},
    start      : params.start,
    endTime    : params.end,
    descending : false
  };


  if (params.interval) {
    options.interval = params.interval;
  } else {
    options.reduce = true
  }

  hbase.getExchanges(options, function(err, resp) {
    if (err) {
      callback(err);
      return;
    }

    if (params.interval) {
      resp = resp[0];
    }

    if (resp) {
      callback(null, resp.vwap); // vwavPrice
    } else {
      callback("cannot determine exchange rate");
    }
  });
}

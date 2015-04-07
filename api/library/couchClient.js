var env     = process.env.NODE_ENV || "development";
var winston = require('winston');
var moment  = require('moment');

function init (params) {
  var client = require('nano')(params);

  client.parentView = client.view;
  client.view       = function(doc, view, options, callback) {
    var d     = Date.now();
    var label = "";
    var tags; //tracking elapsed time
    var suffix;
    var rowcount;

    if (options.label) {
      label         = options.label;
      options.label = undefined;
    }

    tags = [doc+'.'+view];
    if (label) tags.push(label.replace(':','_'));

    suffix = tags.join('.');
    statsd.increment('couchDB.request.' + suffix, null);

    client.parentView(doc, view, options, function(error, response){
      var date = '[' + moment.utc().format('YYYY-MM-DD HH:mm:ss.SSS') + ']';

      if (error) {
        if (error.code === 'EMFILE' || error.code === 'EADDRINFO' || error.code === 'ENOTFOUND') {
          error = 'Too Many Connections';
        } else if (error.code === 'ECONNRESET') {
          error = 'Service Unavailable';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          error = 'Request Timeout';
        }
      }

      //return response
      callback(error, response);

      if (response && response.rows) rowcount = response.rows.length;

      //log stats
      d = (Date.now()-d)/1000;

      winston.info(date,
        'COUCHDB',
        'view:' + suffix,
        'time:' + d + 's',
        rowcount ? 'rowcount:' + rowcount : '',
        error ? ('ERROR:' + error) : '');

      statsd.timing('couchDB.responseTime.' + suffix, d);
    });
  }

  return client;
}

module.exports = init;

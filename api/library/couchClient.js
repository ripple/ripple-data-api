var env     = process.env.NODE_ENV || "development";
var winston = require('winston');

function init (params) {
  var client = require('nano')(params);
  
  client.parentView = client.view;
  client.view       = function(doc, view, options, callback) {
    var label = "", d = Date.now()
    var tags; //tracking elapsed time
    var suffix;
    
    if (options.label) {
      label         = options.label;
      options.label = undefined;  
    } 
    
    tags = [doc+'.'+view];
    if (label) tags.push(label.replace(':','_'));
    
    suffix = tags.join('.');
    statsd.increment('couchDB.request.' + suffix, null);
    
    client.parentView(doc, view, options, function(error, response){
      if (error) { 
        if (error.code === 'EMFILE' || error.code === 'EADDRINFO' || error.code === 'ENOTFOUND') {
          error = 'Too Many Connections';
        } else if (error.code === 'ECONNRESET') {
          error = 'Service Unavailable';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          error = 'Request Timeout';
        }
      }
      
      d = Date.now()-d;
      if (DEBUG) winston.info('CouchDB - '+doc+'/'+view, label, (d/1000)+'s');
      
      statsd.timing('couchDB.responseTime.' + suffix, d);    
      callback(error, response);
    });
  }
  
  return client;
}

module.exports = init;
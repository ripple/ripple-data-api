var env   = process.env.NODE_ENV || "development",
  winston = require('winston');

function init (url) {
  var client = require('nano')(url);
  
  client.parentView = client.view;
  client.view       = function(doc, view, options, callback) {
    var label = "", d = Date.now(), tags; //tracking elapsed time
    
    if (options.label) {
      label         = options.label;
      options.label = undefined;  
    } 
    
    tags = ["view:"+doc+"/"+view, "node_env:"+env];
    datadog.increment('ripple_data_api.couchDB_requests', null, tags);
    return client.parentView(doc, view, options, function(error, response){
      if (error) { 
        if (error.code === 'EMFILE' || error.code === 'EADDRINFO' || error.code === 'ENOTFOUND') {
          error = 'Too Many Connections';
        } else if (error.code === 'ECONNRESET') {
          error = 'Service Unavailable';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          error = 'Request Timeout';
        }
      }
      
      d = (Date.now()-d)/1000;
      if (DEBUG) winston.info("CouchDB - "+doc+"/"+view, label, d+"s");
      
      datadog.histogram('ripple_data_api.couchDB_responseTime', d, null, tags);    
      callback(error, response);
    });
  }
  
  return client;
}

module.exports = init;
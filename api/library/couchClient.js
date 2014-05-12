var env   = process.env.NODE_ENV || "development",
  winston = require('winston');

function init (url) {
  var client = require('nano')(url);
  
  client.parentView = client.view;
  client.view       = function(doc, view, options, callback) {
    var label = "", d = Date.now(); //tracking elapsed time
    
    if (options.label) {
      label         = options.label;
      options.label = undefined;  
    } 
    
    return client.parentView(doc, view, options, function(error, response){
      d = (Date.now()-d)/1000;
      if (DEBUG) winston.info("CouchDB - "+doc+"/"+view, label, d+"s");
      
      datadog.histogram('ripple_data_api.couchDB_responseTime', d, null, ["view:"+doc+"/"+view, "node_env:"+env]);    
      callback(error, response);
    });
  }
  
  return client;
}

module.exports = init;
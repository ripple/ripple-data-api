var winston = require('winston');

function init (url) {
  var client = require('nano')(url);
  
  client.parentView = client.view;
  client.view       = function(doc, view, options, callback) {
    var label = "";
    if (DEBUG) var d = Date.now(); //tracking elapsed time
    if (options.label) {
      label         = options.label;
      options.label = undefined;  
    } 
    
    return client.parentView(doc, view, options, function(error, response){
      if (DEBUG) {
        d = (Date.now()-d)/1000;
    
        winston.info("CouchDB - "+doc+"/"+view, label, d+"s");
      }   
           
      callback(error, response);
    });
  }
  
  return client;
}

module.exports = init;
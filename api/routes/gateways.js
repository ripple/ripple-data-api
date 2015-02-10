var utils  = require('../utils');
var path   = require('path');
var assets = path.resolve(__dirname + '/../gatewayAssets/');


//cached in memory since
//they will not change until restart
var gatewaysByCurrency = utils.getGatewaysByCurrency();

/**
 * gateways
 * return information for all gatways 
 * or a single gateway
 */

var Gateways = function (req, res, next) {
  var currency = req.query.currency;
  var address  = req.params.gateway;
  
  if (address) {
    gateway = utils.getGateway(address);
    if (gateway) {
      res.send(JSON.stringify(gateway, null));
    } else {
      res.status(404).send('Not found');
    }
  } else {
    res.send(JSON.stringify(gatewaysByCurrency, null)); 
  }
};

/**
 * Assets
 * return gateway assets
 */

var Assets = function (req, res, next) {
  var address  = req.params.gateway;
  var filename = req.params.filename || 'logo.svg';
  var identifier;
  
  if (address) {
    gateway    = utils.getGateway(address);
    identifier = gateway.name.toLowerCase().replace(/\W/g, '');

    console.log(identifier);
    res.sendfile(assets + '/' + identifier + '.' + filename, null, function(err) {
      if (err) {
        console.log(err);
        res.status(err.status).send('Not found');
      }     
    });

    return;
  }

  
  res.status(404).send('Not found');
};



module.exports.Assets   = Assets;
module.exports.Gateways = Gateways;
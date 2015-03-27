var utils      = require('../utils');
var path       = require('path');
var assetPath  = path.resolve(__dirname + '/../gatewayAssets/');
var currencies = path.resolve(__dirname + '/../currencyAssets/');

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
    gateway = utils.getGateway(address);

    if (!gateway) {
      res.status(400).send('invalid gateway name or address');
      return;
    }

    identifier = gateway.name.toLowerCase().replace(/\W/g, '');

    res.sendfile(assetPath + '/' + identifier + '.' + filename, null, function(err) {
      if (err) {
        console.log(err, identifier);
        res.status(err.status).send('Not found');
      }
    });

    return;
  }

  res.status(404).send('Not found');
};

var Currencies = function (req, res, next) {
  var filename = (req.params.currencyAsset || 'default.svg').toLowerCase();

  if (filename) {
    res.sendfile(currencies + '/' + filename, null, function(err) {

      //send default svg if its not found
      if (err && err.status === 404) {
        res.sendfile(currencies + '/default.svg', null, function(err) {
          if (err) {
            console.log(err);
            res.status(500).send('server error');
          }
        });

      } else if (err) {
        console.log(err, filename);
        res.status(err.status).send('server error');
      }
    });

    return;
  }

  res.status(404).send('Not found');
};

module.exports.Assets     = Assets;
module.exports.Gateways   = Gateways;
module.exports.Currencies = Currencies;

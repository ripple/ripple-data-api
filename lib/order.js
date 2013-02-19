var ripple = require('../../ripple/src/js'),
    Amount = ripple.Amount;

var pairs = {
  'BTC/XRP': true,
  'AUD/XRP': true,
  'BTC/USD': true
};

var Order = function (node)
{
  var gets = Amount.from_json(node.TakerGets),
      pays = Amount.from_json(node.TakerPays),
      type, first, second;

  // Determine pair direction
  var getsCurrency = gets.currency().to_json();
  var paysCurrency = pays.currency().to_json();

  if (pairs["" + getsCurrency + '/' + paysCurrency]) {
    type = "bid";
    first = gets;
    second = pays;
  } else if (pairs["" + paysCurrency + '/' + getsCurrency]) {
    type = "ask";
    first = pays;
    second = gets;
  } else {
    return;
  }

  this.id = node.index;

  this.key = "" +
    first.currency().to_json() +
    (first.is_native() ? '' : '/' + first.issuer().to_json()) + '|' +
    second.currency().to_json() +
    (second.is_native() ?  '' : '/' + second.issuer().to_json());

  this.type = type;
  this.base = first.to_json();
  this.counter = second.to_json();
};

Order.prototype.getKey = function ()
{
  return this.key;
};

module.exports.Order = Order;

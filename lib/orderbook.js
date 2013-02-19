var OrderBook = function ()
{
  this.bids = [];
  this.asks = [];
};

OrderBook.prototype.add = function (order)
{
  console.log(order.type + 's');
  this[order.type + 's'].push(order);
};

module.exports.OrderBook = OrderBook;

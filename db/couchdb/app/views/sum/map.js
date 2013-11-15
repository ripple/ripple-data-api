function(doc) {
  var date = new Date(doc.close_time_timestamp),
      key = [null, date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()],
      transactions = doc.transactions;

  for (var i = 0, n = transactions.length; i < n; ++i) {
    var t = transactions[i],
        type = t.TransactionType;
    if (!type) continue;
    var pair = type === "Payment" ? value(t.Amount)
          : type === "TrustSet" ? value(t.LimitAmount)
          //: type === "OfferCreate" ? value(t.TakerPays) + "/" + value(t.TakerGets)
          : null;
    if (pair == null) continue;
    var k = key.slice();
    k[0] = type;
    emit(k, pair);
  }
}

function value(d) {
  return d.currency ? [+d.value, d.currency] : [+d, "XRP"];
}

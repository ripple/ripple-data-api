function(doc) {
  var date = new Date(doc.close_time_timestamp),
      key = [null, date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()],
      transactions = doc.transactions;

  for (var i = 0, n = transactions.length; i < n; ++i) {
    var t = transactions[i],
        type = t.TransactionType;
    if (!type) continue;
    var currency = type === "Payment" ? symbol(t.Amount)
          : type === "TrustSet" ? symbol(t.LimitAmount)
          : type === "OfferCreate" ? symbol(t.TakerPays) + "/" + symbol(t.TakerGets)
          : null;
    if (currency == null) continue;
    var k = key.slice();
    k[0] = type;
    emit(k, currency);
  }
}

function symbol(d) {
  return d.currency || "XRP";
}

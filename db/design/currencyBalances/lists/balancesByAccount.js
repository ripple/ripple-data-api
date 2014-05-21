function(head, req) {
  var row, accounts = {}, response = [];
  while(row = getRow()) {
    var account = row.value[0];
    
    //loop through the balances to find the latest change for each account
    if (!accounts[account] || row.value[3]>accounts[account][1]) 
      accounts[account] = [row.value[1], row.value[3]];
  }
  
  for (var account in accounts) {
    if (!accounts[account][0]) continue;  //ignore 0 balances

    response.push([
      account,
      accounts[account][0],
      new Date(accounts[account][1])
    ]);
  }
  
  send(toJSON(response));
}

/*
 * 
 
 http://127.0.0.1:5984/ripple2/_design/currencyBalances/_list/balancesByAccount/v1?startkey=["CNY.rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK",2013]&endkey=["CNY.rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK",2015]
 
 http://127.0.0.1:5984/ripple2/_design/currencyBalances/_list/balancesByAccount/v1?startkey=["USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",2013]&endkey=["USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",2015]
 
 http://127.0.0.1:5984/ripple2/_design/currencyBalances/_list/balancesByAccount/v1?startkey=["XRP",2013]&endkey=["XRP",2015]
 
 
 * * 
 */
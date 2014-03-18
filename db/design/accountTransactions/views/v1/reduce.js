function(keys, values, rereduce) {
  if (rereduce) {
    
    var stats = {};
    
    for (currency in values) {
      
      if (!stats[currency]) stats[currency] = {};
      
      if (currency == "XRP") {  
        for (type in values.XRP) {
          if (!stats.XRP[type]) stats.XRP[type] = {amount:0, count:0};
          stats.XRP[type]['amount'] += values.XRP[type]['amount'];
          stats.XRP[type]['count']  += values.XRP[type]['count'];
        }
      } else {
        for (issuer in values[currency]) {
          if (!stats[currency][issuer]) stats[currency][issuer] = {};
          
          for (type in values[currency][issuer]) {
            if (!stats[currency][issuer][type]) stats[currency][issuer][type] = {amount:0, count:0};
            stats[currency][issuer][type]['amount'] += values[currency][issuer][type]['amount'];
            stats[currency][issuer][type]['count']  += values[currency][issuer][type]['count'];
          }          
        }
      }
    }
    
    return stats;
    
  } else {
    var stats = {};


    values.forEach( function( d, index ) {

      //d[0] = currency
      //d[1] = issuer
      //d[2] = sent or recieved
      //d[3] = amount
      
      if (d[0]=='XRP') {
        if (!stats[d[0]])       stats[d[0]] = {};
        if (!stats[d[0]][d[2]]) stats[d[0]][d[2]] = {amount:0, count:0};
        stats[d[0]][d[2]]['amount'] += d[3];
        stats[d[0]][d[2]]['count']++;
        
        
      } else {
        if (!stats[d[0]])       stats[d[0]] = {};
        if (!stats[d[0]][d[1]]) stats[d[0]][d[1]] = {};
        if (!stats[d[0]][d[1]][d[2]]) stats[d[0]][d[1]][d[2]] = {amount:0, count:0};
        stats[d[0]][d[1]][d[2]]['amount'] += d[3];
        stats[d[0]][d[1]][d[2]]['amount']++;
      }
      
    });
    
    return stats;   
    
  }
}
##Ripplecharts Data API



Ripplecharts data API is the end point for ripplecharts and other applications that need historical data.  It consists of 4 main parts:

  1. Couch DB data storage and query
    
    >CouchDB stores all ledgers as a JSON document.  To retrieve structured data from the ledgers, "views" have been created which index specific elements from the ledger into a format that can be queried efficiently.  For example, one view collects all successful transactions that exercise offers and indexes them according to the currencies, issuers, and date, and returns the amounts and prices of the exercised offers.  We can then query this view and group the indexed results by time increments to get an array of offers excercised over time for a given pair of currencies.

  
  2. Node.js ledger importer to retrieve historical ledgers
    
    >The ledger importer retrieves current and historical ledgers from the ripple network.

  
  3. Node.js indexing triggerer to cause couch to index new data
    
    >Couch DB only reindexes new documents into views when the view is queried.  In order to keep the indexes up to date with the latest data from the Ripple Network, the views are queried on a regular basis to trigger indexing of new data.
  
  
  4. Node.js API server endpoint for querying the historical data
    
    >Accessing the historical data is not done by querying the database directly but through a node.js API server.  The server takes requests in the form of JSON data, interprets it into one or several couchDB queries, processes the data as necessary and returns the results.

###API routes:

####offersExercised
Exchange offers exercised over time - returns volume in terms of base and counter currencies, number of trades, open, high, low, close, and volume weighted price.

  request:
  
```js
  
  {    
    base  : {currency: "XRP"},
    trade : {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    startTime     : (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
    endTime       : (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
    timeIncrement : (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
    timeMultiple  : 5, 15, etc.. //optional, defaults to 1 (for 5 minutes, 15 mintues, etc.)
    descending : true/false, // optional, defaults to false
    reduce     : true/false, // optional, defaults to true
    limit      : 1000 //optional, ignored unless reduce is false - limit the number of returned trades
    format     : ('json', 'csv') // optional
  }
```

  response (default):

```js

  [
    [
      "startTime",          //start time of period
      "baseCurrVolume",     //volume in terms of base currency
      "tradeCurrVolume",    //volume in terms of trade currency
      "numTrades",          //number of trades
      "openPrice",          //price of the first trade in the time period
      "closePrice",         //price of the last trade in the time period
      "highPrice",          //highest price
      "lowPrice",           //lowest price
      "vwavPrice",          //volume weighted average price
      "openTime",           //time of the first trade
      "closeTime",          //time of the last trade
      "partial"             //true indicates this row may not include all trades in the
                            //interval due to the alignment of the requested
                            //time period. for example, a time interval of 1 minute was
                            //requested, but the end time for the range was 3:45:30
    ],
    [
      "2014-03-11T00:00:00+00:00",
      205162.305195,
      3006.5845870187113,
      61,
      0.0146372844753653,
      0.014679829716270498,
      0.01468414097523932,
      0.014513788098693749,
      0.014654723805895043,
      "2014-03-11T11:44:10+00:00",
      "2014-03-11T14:10:00+00:00",
      false
    ],
    .
    .
    .
    .
  ]

```

  response (json): 
  
```js
  {
    "timeRetrieved" : "2014-03-14T19:45:33+00:00",
    "startTime"     : "2014-03-11T11:35:00+00:00",
    "endTime"       : "2014-03-11T14:10:30+00:00",
    "base"          : {"currency":"XRP"},
    "trade"         : {"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "interval"      : "hours",
    "multiple"      : 15,
    "results"       : [
      {
        "startTime"    : "2014-03-11T00:00:00+00:00",
        "openTime"     : "2014-03-11T14:10:00+00:00",
        "closeTime"    : "2014-03-11T11:44:10+00:00",
        "baseCurrVol"  : 205162.30519499994,
        "tradeCurrVol" : 3006.5845870187104,
        "numTrades"    : 61,
        "openPrice"    : 0.0146372844753653,
        "closePrice"   : 0.014679829716270498,
        "highPrice"    : 0.01468414097523932,
        "lowPrice"     : 0.014513788098693749,
        "vwavPrice"    : 0.014654723805895048,
        "partial"      : true
      },
      .
      .
      .
      .
    ]
  }

```

  response (csv):

```csv
startTime, baseCurrVolume, tradeCurrVolume, numTrades, openPrice, closePrice, highPrice, lowPrice, vwavPrice, openTime, closeTime, partial
2014-03-04T12:00:00+00:00, 164012.080984, 2689.4286312898475, 29, 0.01628759134744031, 0.016380000119127273, 0.016513094884243202, 0.01625223468238441, 0.01639829423286873, 2014-03-04T12:03:10+00:00, 2014-03-04T12:14:40+00:00, false
2014-03-04T12:30:00+00:00, 33784.83996800001, 557.9164025426339, 22, 0.016380000119127273, 0.01638001638001638, 0.01652892561983471, 0.016380000119127273, 0.016513831010725292, 2014-03-04T12:32:10+00:00, 2014-03-04T12:43:40+00:00, false
2014-03-04T12:45:00+00:00, 132662.01327999998, 2200.7328971618, 132, 0.01638001638001638, 0.01659834016923635, 0.01666666666666666, 0.01638001638001638, 0.016589391414399513, 2014-03-04T12:46:10+00:00, 2014-03-04T12:59:00+00:00, false
...

```

  response (reduce = false):

```
  [
    [ "time", "price", "baseAmount", "tradeAmount", "tx_hash" ],
    [ "2014-03-14T20:58:45+00:00", 0.0146372844753653, 346.697779, 5.07471400683615, KAXs2Adoas3..... ],
    .
    .
    .
    .
  ]
```  

####exchangeRates
The exchange rates between two or more currencies for a given time range and increment.

  request:
  
```js
  {
    pairs    : [
      {
        base  : {currency:"USD","issuer":"bitstamp"},
        trade : {currency:"BTC","issuer":"bitstamp"}
      },
      {
        base  : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
        trade : {currency:"XRP"}
      }
    ],

    base  : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}, //required if "pairs" not present, for a single currency pair exchange rate
    trade : {currency:"XRP"}, //require if "pairs" not present, for a single currency pair exchange rate
    range : "hour", "day", "week", "month", "year",  //time range to average the price over, defaults to "day"
  }
``` 
  response :
  
```js  
  {
    pairs : [
      {
        base  : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK","name":"rippleCN"},
        trade : {currency:"XRP"},
        rate  : //volume weighted average price
        last  : //last trade price
        range : "hour", "day", "month", year" - from request
      },
        ....
    ] 
  }
```  
  
####topMarkets
The total trading volume for the top 5 markets on the ripple network for a given time period, normalized USD.  Returns data for the last 24 hours if no arguments are given.

  request:
   
```js
  {
    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
    endTime   : (any momentjs-readable date), // optional, defaults to now
    exchange  : {                             // optional, defaults to XRP
      currency  : (XRP, USD, BTC, etc.),         
      issuer    : "rAusZ...."                 // optional, required if currency != XRP
    }
  }
```

  response:
  
```js
  { 
    startTime    : '2014-03-13T20:26:24+00:00',   //period start
    endTime      : '2014-03-14T20:26:24+00:00',   //period end
    exchange     : { currency: 'XRP' },           //requested exchange currency
    exchangeRate : 1,                             //XRP exchange rate of requested currency
    total        : 1431068.4284775178,            //total volume in requested currency
    count        : 627,                           //number of trades
    components   : [                              //list of component markets
      { 
        base            : {"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
        trade           : {"currency":"XRP"},
        rate            : 69.9309953931345,
        count           : 99,
        amount          : 3107.9273091242917,
        convertedAmount : 217340.45033656774 
      },
      .
      .
      .
    ]
  }        
```

####totalValueSent
The total of amounts sent or exchanged from any wallet, either through a payment or an "offerCreate" that exercises another offer, for a curated list of currency/issuers and XRP, normalized to a specified currency

  request : 

```
  {
    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
    endTime   : (any momentjs-readable date), // optional, defaults to now
    exchange  : {                             // optional, defaults to XRP
      currency  : (XRP, USD, BTC, etc.),         
      issuer    : "rAusZ...."                 // optional, required if currency != XRP
    }
  }
```
 
response : 

```
  {
    startTime    : "2014-03-13T20:39:26+00:00",       //period start
    endTime      : "2014-03-14T20:39:26+00:00",       //period end
    exchange     : {
      currency : "USD",                               //exchange currency
      issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"  //exchange issuer
    },
    exchangeRate : 0.014301217579817786,              //exchange rate
    total        : 726824.6504823748,                 //total value sent
    count        : 6040,                              //number of transactions
    components   : [                                  //list of component currencies
      {
        currency        : "USD",
        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
        amount          : 27606.296227064257,
        count           : 51,
        rate            : 1,
        convertedAmount : 27606.296227064257
      },
      .
      .
      .
      .
    ]
  }
```
####valueSent
The amount of value sent from any account for a specific currency over time. 

  request: 
  
```js
  {
    currency      : ("XRP", "USD", etc.)     //required
    issuer        : ("bitstamp", "rxSza...") //required
    startTime     : // range start date + time
    endTime       : // range end date + time
    timeIncrement : // second, minute, etc.     - optional, defaluts to "all"
    descending    : // true/false               - optional, defaults to false
    reduce        : // true/false               - optional, ignored if timeIncrement set
  }
```

  response: 

```
  {
  
    currency : //from request
    issuer   : //from request 
    results  : [

      ["time","amount","count or tx_hash"],  //tx_hash if reduce = false 
      [
        time,
        amount,
        count/tx_hash
      ],
      .
      .
      .
    ]
  }
```  

####issuerCapitalization
the changes in balance for a gateway’s issuing wallet over time, with known hot wallets factored in.

  request:
  
```js
  {
    pairs : [
      {currency:"USD", issuer:"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      {currency:"USD", issuer:"rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q"},
      {currency:"USD", issuer:"rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun"},
      {currency:"USD", issuer:"rPDXxSZcuVL3ZWoyU82bcde3zwvmShkRyF"},
      {currency:"USD", issuer:"ra9eZxMbJrUcgV8ui7aPc161FgrqWScQxV"},
      {currency:"USD", issuer:"r9Dr5xwkeLegBeXq6ujinjSBLQzQ1zQGjH"}
    ],
    startTime : (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago
    endTime   : (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago
    timeIncrement : (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day" 
  }
```  
  
  response:
  
```js
  [
    {
      "currency"   : "USD",
      "issuer"     : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "name"       : "Bitstamp",
      "hotwallets" : [
        "rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1"
      ],
      "results": [
        [ 1391212800000, 0 ],
        [ 1393627434992, -7148.881387749084],
          ...
          ...
          ...
      ]
    },
    ...
    ...
    ...
  ]  
```
  
####accountsCreated
the number of ripple accounts that have been created over time.

  request:
  
```js
  {
    startTime     : (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
    endTime       : (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
    timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
    descending    : true/false, // optional, defaults to true
    reduce        : true/false  // optional, ignored if timeIncrement is set. false returns individual accounts created
    format        : 'json', 'csv', or 'json_verbose'
 }
```
  response:
  
```js
[
  [ "time","accountsCreated" ], //header row
  [ "2014-02-28T18:00:00+0000", 1 ],
  [ "2014-02-28T17:00:00+0000", 18 ],
  [ "2014-02-28T16:00:00+0000", 6 ],
  [ "2014-02-28T15:00:00+0000", 8],
    ...
    ...
    ...
]
```
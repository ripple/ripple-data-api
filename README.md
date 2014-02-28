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
exchange offers exercised over time - returns volume in terms of base and counter currencies, number of trades, open, high, low, close, and volume weighted price.

  request:
```js
  
  {    
    base  : {currency: "XRP"},
    trade : {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    startTime     : (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
    endTime       : (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
    timeIncrement : (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
    timeMultiple  : 5 //optional, defaults to 1 (for 5 minutes, 15 mintues, etc.)
    descending : true/false, // optional, defaults to true
    reduce     : true/false, // optional, defaults to true
    limit      : 1000 //optional, ignored unless reduce is false - limit the number of returned trades
    format     : (either 'json', 'json_verbose', 'csv') // optional, defaults to 'json'
  }
```
  response:
  
####exchangeRates
the exchange rates between two or more currencies for a given time range and increment.

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
the total trading volume for the top 5 markets on the ripple network for a given time period, normalized USD.  Returns data for the last 24 hours if no arguments are given.

  request: 
```js
  {
    startTime : (any momentjs-readable date), // optional,  defaults to 1 day ago if endTime is absent
    endTime   : (any momentjs-readable date), // optional,  defaults to now if startTime is absent
  }
```
  
  response:
```js
  [
    ['startTime','baseCurrVolume','finalCoversionRate','marketValue'], //header row
    ... //one row for each of the top 5 markets
  ]
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
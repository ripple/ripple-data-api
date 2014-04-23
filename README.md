API Documentation: http://docs.rippledataapi.apiary.io/

# Ripple Data API
The Ripple data API is the end point for ripplecharts and other applications that need historical data.  This API is built on Node.js, CouchDB, and Redis.

## Components

### Ledger Importer
The ledger importer imports ledgers from the Ripple Network into the data store.  The process is set up to import continously in real time as ledgers are validated, as well as import historical ledgers.

### Data Store
The data store uses CouchDB to store ledgers as a JSON document.  To retrieve structured data from the ledgers, "views" have been created which index specific elements from the ledger into a format that can be queried efficiently.  For example, one view collects all successful transactions that exercise offers and indexes them according to the currencies, issuers, and date, and returns the amounts and prices of the exercised offers.  We can then query this view and group the indexed results by time increments to get an array of offers excercised over time for a given pair of currencies.

### API Server
Accessing the historical data is not done by querying the database directly but through a node.js API server.  The server takes requests in the form of JSON data, interprets it into one or several couchDB queries, processes the data as necessary and returns the results.

### Memory Cache
To reduce the load on CouchDB, the API server contains a cacheing layer.  The cache expects the data stored in couch to be accurate and up to date, thus it will be automatically disabled if the importer is unable to keep up to date for any reason, and will restart again when the data gets caught up.

## group API Routes
All API routes are post requests with parameters passed as a JSON object.  the specific endpoint is defined as `/[ROUTE]`, such as `/offersExercised`

### offers_exercised [/offers_exercised{base}{counter}{startTime}{endTime}{timeIncrement}{timeMultiple}{descending}{reduce}{limit}{offset}{format}]
Exchange offers exercised over time - returns volume in terms of base and counter currencies, number of trades, open, high, low, close, and volume weighted price.

#### POST    

+ Parameters
    + base (JSON) ... base currency of the trading pair, in the form {currency,issuer}
    + counter (JSON) ... counter currency of the trading pair, in the form {currency, issuer}
    + startTime (string) ... any momentjs-readable date
    + endTime (string) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + timeMultiple (integer, optional) ... 5, 15, etc.. defaults to 1 (for 5 minutes, 15 mintues, etc.)
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, false returns individual transactions
    + limit (integer, optional) ... ignored unless reduce is false - limit the number of returned trades
    + offset (integer, optional) ... offset by n transactions for pagination, ignored if reduce != false
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array

+ Request (json)

        {    
            base : {currency: "XRP"},
            counter : {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
            startTime : "2014-03-11",
            endTime : "2014-03-12",
            timeIncrement : "minute",
            timeMultiple : 15,
            format : "json"
        }

+ Response 200 (text/plain) 

    + startTime - start time of period
    + baseVolume - volume in terms of base currency
    + counterVolume - volume in terms of trade currency
    + count - number of trades
    + open - price of the first trade in the time period
    + high - highest price
    + low - lowest price    
    + close - price of the last trade in the time period
    + vwap - volume weighted average price
    + openTime - time of the first trade
    + closeTime - time of the last trade
    + partial - true indicates this row may not include all trades in the interval due to the alignment of the requested time period. For example, a time interval of 1 minute was requested, but the end time for the range was 3:45:30    

    
    + Body
    
            [
                [
                    "startTime",
                    "baseVolume",
                    "counterVolume",
                    "count",
                    "open",
                    "high",
                    "low",
                    "close",
                    "vwap",
                    "openTime",
                    "closeTime",
                    "partial"
                ],
                [
                    "2014-03-11T12:00:00+00:00",
                    283100.785902,
                    4148.880165613894,
                    129,0.014637002338207711,
                    0.01473544628685632,
                    0.01451000001204874,
                    0.01455619191687749,
                    0.014655231083925739,
                    "2014-03-11T12:09:10+00:00",
                    "2014-03-11T15:57:20+00:00",
                    false
                ],
                .
                .
                .
            ]   
            
+ Response 200 (reduce = false, text/plain)

        [
            [ "time", "price", "baseAmount", "counterAmount", "tx_hash" ],
            [ "2014-03-14T20:58:45+00:00", 0.0146372844753653, 346.697779, 5.07471400683615, KAXs2Adoas3..... ],
            .
            .
            .
        ]
        
+ Response 200 (json) 

        {
            startTime : "2014-03-11T11:44:00+00:00",
            endTime   : "2014-03-12T12:09:00+00:00",
            base      : {
                currency : "XRP"
            },
            counter : {
                currency : "USD",
                issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            },
            timeIncrement : "hours",
            timeMultiple  : 4,
            results       : [
                {
                    startTime     : "2014-03-11T12:00:00+00:00",
                    openTime      : "2014-03-11T15:57:20+00:00",
                    closeTime     : "2014-03-11T12:09:10+00:00",
                    baseVolume    : 283100.785902,
                    counterVolume : 4148.880165613894,
                    count         : 129,
                    open          : 0.014637002338207711,
                    high          : 0.01451000001204874,
                    low           : 0.01455619191687749, 
                    close         : 0.01473544628685632,
                    vwap          : 0.014655231083925739,
                    partial       : false
                },
                .
                .
                .
            ]
        }
        
+ Response 200 (text/csv)   

        startTime, baseVolume, counterVolume, count, open, high, low, close, vwap, openTime, closeTime, partial
        2014-03-11T08:00:00+00:00, 457.81426600000003, 6.701129377783959, 4, 0.0146372844753653, 0.0146372844753653, 0.01463700234192037, 0.01463700234192037, 0.014637222778328018, 2014-03-11T11:44:10+00:00, 2014-03-11T11:57:20+00:00, true
        2014-03-11T12:00:00+00:00, 283100.785902, 4148.880165613894, 129, 0.014637002338207711, 0.01473544628685632, 0.01451000001204874, 0.01455619191687749, 0.014655231083925737, 2014-03-11T12:09:10+00:00, 2014-03-11T15:57:20+00:00, false
        2014-03-11T16:00:00+00:00, 265984.147741, 3848.099297442456, 66, 0.01455, 0.01472737999181529, 0.014314547875005369, 0.014580006546125387, 0.014467756083227484, 2014-03-11T16:23:20+00:00, 2014-03-11T19:30:10+00:00, false
        ...
        ...
        ...

### value_sent [/value_sent{currency}{issuer}{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
The amount of value sent from all accounts for a specific currency over time. 

#### POST

+ Parameters
    + currency (string) ... "XRP", "USD", etc.
    + issuer   (string) ... "rvYAfWj5gh67oV6f..." 
    + startTime (string) ... any momentjs-readable date
    + endTime (string) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, ignored if timeIncrement is set
    + limit (integer, optional) ... limit the number of responses, ignored if reduce != false
    + offset (integer, optional) ... offset by n transactions for pagination, ignored if reduce != false
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array

+ Request (json)
        
        {
            currency  : "USD",
            issuer    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
            startTime : "Mar 5, 2014 10:00 am",
            endTime   : "Mar 6, 2014 10:00 am"
        }


+ Response 200 (text/plain)

        [
            ["time","amount","count"],
            ["2014-03-04T08:00:00+00:00",1444.360203839022,4],
            ["2014-03-04T09:00:00+00:00",41678.45554351887,12],
            ["2014-03-04T10:00:00+00:00",4095.8676436164487,19],
            ...
            ...
            ...
        ]
        
+ Response 200 (reduce = false)

        [
            [
                "time",
                "amount",
                "account",
                "destination",
                "txHash",
                "ledgerIndex"
            ],
            [
                "2014-03-15T17:19:00+00:00",
                0.151374648,
                "rHsZHqa5oMQNL5....",
                null,
                "BFED0E5164F4....",
                5536660
            ],  
            .
            .
            .
        ]
        
+ Response 200 (json)

        {
            currency      : "BTC",
            issuer        : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
            startTime     : "2014-03-05T18:00:00+00:00",
            endTime       : "2014-03-06T18:00:00+00:00",
            timeIncrement : "hour",
            results       : [
                {
                    time   : "2014-03-05T18:00:00+00:00",
                    amount : 0.01065677430038825,
                    count  : 1
                },
                {
                    time   : "2014-03-05T19:00:00+00:00",
                    amount : 0.3742335806999557,
                    count  : 3
                },
                .
                .
                .
            ]
        }

+ Response 200 (csv)

        time, amount, count
        2014-03-15T00:00:00+00:00, 296151.704209, 57
        2014-03-15T01:00:00+00:00, 18227.868377, 57
        2014-03-15T02:00:00+00:00, 471575.79683899996, 78
        ...
        ...
        ...

### issuer_capitalization [/issuer_capitalization{currencies}{startTime}{endTime}{timeIncrement}]
Returns the total capitalization (outstanding balance) of a specified issuer & specified currency pair, over the given time range.

#### POST

+ Parameters
    + currencies (JSON) ... list of currencies in the form {currency, issuer}
    + startTime (string) ... any momentjs-readable date
    + endTime (string) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    
+ Request (json)

        {
            currencies : [
              {currency:"USD", issuer:"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
              {currency:"USD", issuer:"rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q"},
            ],
            
            startTime : "Mar 1, 2014 10:00 am",
            endTime   : "Apr 1, 2014 10:00 am",
            timeIncrement : "day"
        }

+ Response 200 (json)

    + currency - currency of pair from request
    + issuer - issuer of pair from request
    + name - name of gateway requested, if known
    + results - list of balances over time for the selected currency in the form [unixTimestamp,balance]
    
    + Body
    
            [
                {
                    currency : "USD",
                    issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
                    name     : "Bitstamp",
                    results : [
                        ["2013-02-01T00:00:00+00:00",0],
                        ["2013-03-01T00:00:00+00:00",25669.508235252037],
                        ["2013-04-01T00:00:00+00:00",58557.238743623835],
                        ...
                        ...
                        ...
                    ]
                },
                ...
                ...
                ...
            ] 

### accounts_created [/accounts_created{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
The number of ripple accounts that have been created over time.

#### POST

+ Parameters
    + startTime (string, optional) ... any momentjs-readable date
    + endTime (string, optional) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, false returns individual accounts
    + limit (integer, optional) ... limit the number of responses, ignored if reduce != false
    + offset (integer, optional) ... offset by n transactions for pagination, ignored if reduce != false
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array
    
+ Request (json)

        {
            startTime: "2013-04-08",
            endTime: "2014-04-08",
            timeIncrement: "day,
            descending: true
        }
        
+ Response 200 (text/plain)

        [
            ["time","accountsCreated"]
            ["2013-04-08T00:00:00+00:00",38],
            ["2013-04-07T00:00:00+00:00",53],
            ["2013-04-06T00:00:00+00:00",59],
            ...
            ...
            ...
        ]

+ Response 200 (reduce = false, text/plain) 
    
        [
            ["time","account","txHash","ledgerIndex"],
            [
                "2014-03-09T17:07:50+00:00",
                "rNt4o6wkK5dg...",
                "ADFA23A4E361ED...",
                5426006
            ],
            [
                "2014-03-09T17:08:50+00:00",
                "rNtApu2u698Phy...",
                "CA7E143C6B47FAD7....",
                5426016
            ],
            .
            .
            .
        ]

+ Response 200 (json)

        {
            startTime     : "2014-03-09T17:00:00+00:00",
            endTime       : "2014-03-10T17:00:00+00:00",
            timeIncrement : "hour",
            total         : 172,
            results       : [
                {
                    time  : "2014-03-09T17:00:00+00:00",
                    count : 4
                },
                {
                    time  : "2014-03-09T18:00:00+00:00",
                    count : 2
                },
                .
                .
                .
            ]
        }
        
+ Response 200 (csv)

        time, count
        2014-03-09T17:00:00+00:00, 4
        2014-03-09T18:00:00+00:00, 2
        2014-03-09T19:00:00+00:00, 2
        ...
        ...
        ...

### transaction_stats [/transaction_stats{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
Breakdown of valid transactions by type on the ripple network over time.

#### POST

+ Parameters
    + startTime (string, optional) ... any momentjs-readable date
    + endTime (string, optional) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, false returns individual transactions
    + limit (integer, optional) ... limit the number of responses, ignored if reduce != false
    + offset (integer, optional) ... offset by n transactions for pagination, ignored if reduce != false
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array
    
+ Request (json)

        {
            startTime     : "Mar 10, 2014 4:35 am",
            endTime       : "Mar 11, 2014 5:10:30 am",
            timeIncrement : "hour",
            format        : "json"
        }
        
+ Response 200 (text/plain)

        {
            ["time", "Payment", "OfferCreate", "OfferCancel", "TrustSet", "AccountSet", "SetFee", "SetRegularKey"]
            [ "2014-02-28T18:00:00+0000", 502, 244, 102, 83, 12, 2, 5 ],
            [ "2014-02-28T17:00:00+0000", 1800, 500, 232, 103, 55, 12, 4 ],
            [ "2014-02-28T16:00:00+0000", 6102, 1293, 503, 230, 100, 14, 5 ],
            ...
            ...
            ...
        }
        
+ Response 200 (reduce = false, text/plain)

        {
            ["time", "type", "account", "txHash", "ledgerIndex"],
            ["2014-02-28T18:00:00+0000", "Payment",     "rXaaFst....", "4ABA3B0777E97BDEA924A732A943B169D...."],
            ["2014-02-28T17:00:00+0000", "OfferCreate", "rXaaFst....", "4ABA3B0777E97BDEA924A732A943B169D...."],
            ...
            ...
            ...
        }

+ Response 200 (json)

        {
            startTime     : "2014-03-10T11:35:00+00:00",
            endTime       : "2014-03-11T12:10:30+00:00",
            timeIncrement : "hour",
            results       : [
                {
                    Payment     : 292,
                    OfferCreate : 315,
                    OfferCancel : 251,
                    AccountSet  : 18,
                    TrustSet    : 6,
                    time        : "2014-03-10T11:00:00+00:00"
                },
                .
                .
                .
            ]
        }
        
+ Response 200 (text/csv)

        time, TrustSet, Payment, OfferCreate, AccountSet, OfferCancel, SetFee, SetRegularKey
        2013-01-01T00:00:00+00:00, 241, 434, 72, 62, 41, 0, 0
        2013-02-01T00:00:00+00:00, 886, 1890, 3086, 9, 2455, 0, 0
        2013-03-01T00:00:00+00:00, 1537, 3968, 11244, 5, 9390, 0, 0
        ...
        ...
        ...

### exchange_rates [/exchange_rates{pairs}{base}{counter}{range}]
The exchange rates between two or more currencies for a given time range and increment.

#### POST  

+ Parameters 
    + pairs (JSON, optional) ... Array of currency pairs for retreival.  Required if base and counter are absent
    + base (JSON, optional) ... base currency of the trading pair, in the form {currency,issuer}.  Required if `pairs` is absent
    + counter (JSON, optional) ... counter currency of the trading pair, in the form {currency, issuer}.  Required if `pairs` is absent
    + range (string, optional) ... "hour", "day", "week", "month", "year".  Time range to average the price over, defaults to `day`
 
+ Request (json)
    
        {
            pairs : [
                {
                    base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
                    counter : {currency:"XRP"}
                }
            ],
            range : "day"
        }


+ Response 200 (json)

    + Pairs - array of results as json for each trading pair requested
        + rate  - volume weighted average price for the given range
        + last  - last traded price for the given range
    
    + Body       
    
            {
                pairs : [
                  {
                    base    : {
                        currency : "CNY", 
                        issuer   : "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK",
                        name     : "rippleCN"
                    },
                    counter : {
                        currency : "XRP"
                    },
                    rate    : .5412
                    last    : .5405
                    range   : "day"
                  },
                    ....
                ] 
            }

### market_makers [/market_makers{base}{counter}{range}{startTime}{format}]
Returns a list of accounts that participated in trading the specified trading pair during the specified time range, ordered by base currency volume.  If no trading pair is provided, the API uses a list of the top XRP markets

#### POST

+ Parameters
    + base (JSON, optional) ... base currency-issuer. If not present, top XRP markets are queried
    + counter  (JSON, optional) ... counter currency-issuer. Required if base is present
    + period (string, optional) ... Any of the following ("24h", "3d", "7d", "30d")
    + startTime (string, optional) ... moment.js readable date string
    + transactions (boolean, optional) ... include individual transactions in the response, defaults to false. ignored in csv format
    + format ('json' or 'csv', optional) ... defaults to a CSV-like array
    
+ Request (json)

        {
            base : {
                currency : "XRP"
            },
            counter : {
                currency : "USD",
                issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            },
            period : "24h"
        }
        
+ Response 200 (text/plain)

        [
            ["account","volume","count"],
            ["rnErNnnxRxpki...",1928.618644523547,8],
            ["rLqAVKdGpJt2...",1586.0617068572724,5],
            ["rGEDQD48uACC2...",1318,3],
            ...
            ...
            ...
        ]
        
+ Response 200 (json)

        {
            startTime : "2014-04-09T20:53:30+00:00",
            endTime   : "2014-04-10T20:53:30+00:00",
            results   : [
                {
                    account : "rwLezhH....",
                    volume  : 9058276.664807992,
                    count   : 219
                },
                {
                    account : "rHrSaVx....",
                    volume  : 4347587.137745989,
                    count   : 456
                },
                .
                .
                .
            ]    
        }

+ Response 200 (csv)

        account, volume, count
        rwZewhQae..., 9484699.918622022, 245
        rHrSaQVSj..., 2717824.9351769933, 245
        rCvBeHsW3..., 2242708.7111989968, 329
        ...
        ...
        ...
        
### total_network_value [/total_network_value{time}{exchange}]
Total value of currencies for the top gateways on the ripple network, normalized to a specified currrency.

#### POST

+ Parameters
    + time (string) ... any momentjs-readable date.  The time of desired snapshot
    + exchange (JSON, optional) ... desired currency for valuation, in the form {currency, issuer}. Defaults to XRP

+ Request (json)

        {
            time      : "2014-03-13T20:39:26+00:00"
            exchange  : {
                currency  : "CNY",         
                issuer    : "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"
            }
        }

+ Response 200 (json)

    + time - the time of desired snapshot
    + exchange - valuation currency and issuer
    + exchangeRate - final valuation exchange rate
    + total - combined valuation amount in specified valuation currency
    + components - individual component currencies that make up the combined total
        
    + Body   
    
            {
                time     : "2014-03-13T20:39:26+00:00",
                exchange : {
                    currency : "USD", 
                    issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
                },
                exchangeRate : 0.014301217579817786,
                total        : 726824.6504823748,
                components   : [
                    {
                        currency        : "USD",
                        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
                        amount          : 27606.296227064257,
                        rate            : 1,
                        convertedAmount : 27606.296227064257
                    },
                    .
                    .
                    .
                ]
            }

### top_markets [/top_markets{startTime}{endTime}{exchange}]
The total trading volume for the top 5 markets on the ripple network for a given time period, normalized USD.  Returns data for the last 24 hours if no arguments are given.

#### POST  

+ Parameters 
    + startTime (string, optional) ... any momentjs-readable date, defaults to 1 day before end time
    + endTime (string, optional) ... any momentjs-readable date, defaults to now
    + exchange (JSON, optional) ... desired currency for valuation, in the form {currency, issuer}. Defaults to XRP
 
+ Request (json)

        {
            startTime : "2014-01-15 7:00 AM",
            endTime   : "2014-01-16 8:00 PM",
            exchange  : {
                currency : "USD",
                issuer : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            }
        }

+ Response 200 (json)
    
        { 
            startTime    : '2014-03-13T20:26:24+00:00',
            endTime      : '2014-03-14T20:26:24+00:00',
            exchange     : { currency: 'XRP' },
            exchangeRate : 1,                 
            total        : 1431068.4284775178,
            count        : 627,
            components   : [
                { 
                    base : {
                        currency:"USD",
                        issuer:"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
                    },
                    counter : {
                        currency:"XRP"
                    },
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

### total_value_sent [/total_value_sent{startTime}{endTime}{exchange}]
The total of amounts sent or exchanged from any wallet, either through a payment or an "offerCreate" that exercises another offer, for a curated list of currency/issuers and XRP, normalized to a specified currency

#### POST  

+ Parameters 
    + startTime (string, optional) ... any momentjs-readable date, defaults to 1 day before end time
    + endTime (string, optional) ... any momentjs-readable date, defaults to now
    + exchange (JSON, optional) ... desired currency for valuation, in the form {currency, issuer}. Defaults to XRP
 
+ Request (json)

        {
            startTime : "2014-01-15 7:00 AM",
            endTime   : "2014-01-16 8:00 PM",
            exchange  : {
                currency : "USD",
                issuer : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            }
        }

+ Response 200 (json)

        {
            startTime    : "2014-03-13T20:39:26+00:00",
            endTime      : "2014-03-14T20:39:26+00:00",
            exchange     : {
                currency : "USD",
                issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            },
            exchangeRate : 0.014301217579817786,
            total        : 726824.6504823748,
            count        : 6040,
            components   : [
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
        
### account_offers_exercised [/account_offers_exercised{account}{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
Returns a list of offers excercised for a given account. Providing a time increment or reduce option results in a count of transactions for the given interval or time period.

#### POST

+ Parameters 
    + account (string) ... valid ripple address
    + startTime (string, optional) ... any momentjs-readable date
    + endTime (string, optional) ... any momentjs-readable date
    + descending (boolean, optional) ... defaults to false
    + limit (integer, optional) ... limit the number of responses
    + offset (integer, optional) ... offset by n transactions for pagination
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array

+ Request (json)

        {
            account   : "r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV",
            startTime : "jan 1, 2014 10:00 am",
            endTime   : "jan 10, 2015 10:00 am",
            format    : "json"
        }
                    
+ Response 200 (text/plain)

        [
            [
                "baseCurrency",
                "baseIssuer",
                "baseAmount",
                "counterCurrency",
                "counterIssuer",
                "counterAmount",
                "type",
                "rate",
                "counterparty",
                "time",
                "txHash",
                "ledgerIndex"
            ],
            [
                "USD",
                "r4cgRZUJs7sA....",
                0.4999999999999929,
                "XRP",
                null,
                37.5,
                "buy",
                0.01333333333333333,
                "rn9dcbUdqY3XEbmxG....",
                "2013-06-25T18:38:30+00:00",
                "DB5620CB7FAA1ADE6FD2E6....",
                1137051
            ],
            .
            .
            .
        ]
        
+ Response 200 (json) 

        {
            account   : "rN9U9jLxBQq6N4bREdG2UxxoAXPGiSANfc",
            startTime : "1970-01-01T00:00:00+00:00",
            endTime   : "2014-04-08T17:20:21+00:00",
            results   : [
                {
                    base : {
                        currency : "USD",
                        issuer   : "r4cgRZUJs7....",
                        amount   : 0.4999999999999929
                    },
                    counter : {
                        currency : "XRP",
                        issuer   : null,
                        amount   : 37.5
                    },
                    type         : "buy",
                    rate         : 0.01333333333333333,
                    counterparty : "rn9dcbUd....",
                    time         : "2013-06-25T18:38:30+00:00",
                    txHash       : "DB5620CB7FAA1ADE6FD2E6....",
                    ledgerIndex  : 1137051
                },
                .
                .
                .
            ]
        }
        
+ Response 200 (text/csv)
    
        baseCurrency, baseIssuer, baseAmount, counterCurrency, counterIssuer, counterAmount, type, rate, counterparty, time, txHash, ledgerIndex
        USD, r4cgRZUJs7sAX..., 0.499999, XRP, , 37.5, buy, 0.0133, rn9dcbUdqY..., 2013-06-25T18:38:30+00:00, DB5620CB7FAA1ADE6FD2E6...., 1137051
        XRP, , 40.16, USD, r4cgRZUJs7sA..., 0.502, buy, 80, rn9dcbUdqY..., 2013-06-25T18:41:10+00:00, DB5620CB7FAA1ADE6FD2E6...., 1137069
        ...
        ...
        ...


### account_transactions [/account_transactions{account}{startTime}{endTime}{descending}{limit}{offset}{format}]
Returns a list of transactions in which the specified account sent or received an amount.

#### POST  

+ Parameters 
    + account (string) ... valid ripple address
    + startTime (string, optional) ... any momentjs-readable date
    + endTime (string, optional) ... any momentjs-readable date
    + descending (boolean, optional) ... defaults to false
    + limit (integer, optional) ... limit the number of responses
    + offset (integer, optional) ... offset by n transactions for pagination
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array
 
+ Request (json)

        {
            startTime  : "jan 1, 2014 10:00 am",
            endTime    : "jan 10, 2015 10:00 am",
            account    : "r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV",
            limit      : 100,
            descending : true
        }

+ Response 200 (text/plain)
        
        [
            ["currency","issuer","type","amount","counterparty","time","txHash","ledgerIndex"],
            [
                "XRP",
                "",
                "received",
                0.01,
                "rHaaBCatBh7EKn....",
                "2014-04-08T09:50:30+00:00",
                "3F05E56EB331D8....",
                5960292
            ],
            ...
            ...
            ...
        ]

+ Response 200 (json)

        {
            account   : "r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV",
            startTime : "2015-01-10T18:00:00+00:00",
            endTime   : "2014-01-01T18:00:00+00:00",
            summary   : {
                "XRP" : {
                    received: {
                        amount : 1465.35985, 
                        count  : 10
                    }
                }
            },
            transactions : [
                {
                    currency     : "XRP",
                    issuer       : "",
                    type         : "received",
                    amount       : 0.01,
                    counterparty : "rHaaBCatBh7EKnPM2rQogkFi87tfW9RtAe",
                    time         : "2014-04-08T09:50:30+00:00",
                    txHash       : "3F05E56EB331D87D8D73.....",
                    ledgerIndex  : 5960292
                },
                .
                .
                .
            ]
        }

+ Response 200 (text/csv)
    
        currency, issuer, type, amount, counterparty, time, txHash, ledgerIndex
        XRP, , received, 0.01, rHaaB.., 2014-04-08T09:50:30+00:00, 3F05E56E..., 5960292
        XRP, , received, 250, r9Toy.., 2014-04-05T15:35:00+00:00, 0F1A2B0..., 5913459
        ...
        ...
        ...

### account_transaction_stats [/account_transaction_stats{account}{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
Breakdown of valid transactions by type for a specified account on the ripple network over time.

#### POST

+ Parameters 
    + account (string) ... valid ripple address
    + startTime (string, optional) ... any momentjs-readable date
    + endTime (string, optional) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, false returns individual transactions
    + limit (integer, optional) ... limit the number of responses
    + offset (integer, optional) ... offset by n transactions for pagination
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array


+ Request (json)

        {
            startTime : "Mar 9, 2014 10:00 am",
            endTime   : "Mar 10, 2014 10:00 am",
            account   : "rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1",
            reduce    : false
            format    : "json",
        }

+ Response 200 (text/plain)
        
        [
            ["time","Payment","TrustSet","OfferCancel","OfferCreate"],
            ["2014-03-10T01:00:00+00:00",2,1,0,0],
            ["2014-03-10T02:00:00+00:00",0,2,0,0],
            ["2014-03-11T21:00:00+00:00",1,0,0,0],
            .
            .
            .
        ]

+ Response 200 (reduce = false, json)
    
        {
            account   : "rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1",
            startTime : "2014-03-09T17:00:00+00:00",
            endTime   : "2014-03-10T17:00:00+00:00",
            results   : [
                {
                    time        : "2014-03-09T17:03:20+00:00",
                    type        : "Payment",
                    txHash      : "87E84E5808E590...",
                    ledgerIndex : 5425962
                },
                .
                .
                .
            ]
        }

+ Response 200 (json)

        {
            account       : "rNgxZuUa.....",
            startTime     : "2014-03-09T17:00:00+00:00",
            endTime       : "2014-04-10T17:00:00+00:00",
            timeIncrement : "hour",
            results       : [
                {
                    Payment  : 2,
                    TrustSet : 1,
                    time     : "2014-03-10T01:00:00+00:00"
                },
                {   
                    TrustSet : 2,
                    time     : "2014-03-10T02:00:00+00:00"
                },
                .
                .
                .
            ]
        }

+ Response 200 (csv)

        time, Payment, TrustSet, OfferCancel, OfferCreate
        2014-03-10T01:00:00+00:00, 2, 1, 0, 0
        2014-03-10T02:00:00+00:00, 0, 2, 0, 0
        2014-03-10T03:00:00+00:00, 1, 0, 0, 0
        ...
        ...
        ...


### ledgers_closed [/ledgers_closed{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
Returns the ledger closes over time, as individual ledger indexes or counts

#### POST
+ Parameters
    + startTime (string, optional) ... any momentjs-readable date
    + endTime (string, optional) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, false returns individual ledger indexes
    + limit (integer, optional) ... limit the number of responses
    + offset (integer, optional) ... offset by n ledgers for pagination
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array

+ Request (json)

        {
            startTime     : "Apr 1, 2014 10:00 am",
            endTime       : "Apr 10, 2014 10:00 am",
            timeIncrement : "day",
            format        : "json"
        }
        
+ Response 200 (text/plain)

        [
            ["time","count"],
            ["2014-04-01T00:00:00+00:00",4993],
            ["2014-04-02T00:00:00+00:00",18066],
            ["2014-04-03T00:00:00+00:00",18627],
            ...
            ...
            ...
        ] 

+ Response 200 (reduce = false, text/plain)

        [
            ["time","ledgerIndex"],
            ["2014-04-01T17:00:00+00:00",5841087],
            ["2014-04-01T17:00:00+00:00",5841088],
            ["2014-04-01T17:00:10+00:00",5841089],
            ...
            ...
            ...
        ]
        
+ Response 200 (json)

        {
            startTime     : "2014-04-01T17:00:00+00:00",
            endTime       : "2014-04-10T17:00:00+00:00",
            timeIncrement : "day",
            total         :128454,
            results       : [
                {
                    time  : "2014-04-01T00:00:00+00:00",
                    count : 4993
                },
                {   
                    time  : "2014-04-02T00:00:00+00:00",
                    count : 18066
                },
                .
                .
                .
            ]
        }
        
+ Response 200 (csv)

        time, count
        2014-04-01T00:00:00+00:00, 4993
        2014-04-02T00:00:00+00:00, 18066
        2014-04-03T00:00:00+00:00, 18627
        ...
        ...
        ...

### offers [/offers{base}{counter}{startTime}{endTime}{timeIncrement}{descending}{reduce}{limit}{offset}{format}]
Returns all offer creates and cancels over time for a given trading pair.

#### POST    
+ Parameters
    + base (JSON) ... base currency of the trading pair, in the form {currency,issuer}
    + counter (JSON) ... counter currency of the trading pair, in the form {currency, issuer}
    + startTime (string) ... any momentjs-readable date
    + endTime (string) ... any momentjs-readable date
    + timeIncrement (string, optional) ... any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second" - defaults to "day"
    + descending (boolean, optional) ... defaults to false
    + reduce (boolean, optional) ... defaults to true, false returns individual transactions
    + limit (integer, optional) ... ignored unless reduce is false - limit the number of returned trades
    + offset (integer, optional) ... offset by n transactions for pagination, ignored if reduce != false
    + format ('json' or 'csv', optional) ... default will be a lightweight CSV like array

+ Request (json)

        {
            base    : {
                currency : "XRP"
            },
            counter : {
                currency : "USD", 
                issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            },
            startTime     : "Feb 10, 2014 4:44:00 am",
            endTime       : "Feb 11, 2014 5:09:00 am",
            timeIncrement : "hour"
        }
        
+ Response 200 (text/plain)

        [
            ["time","OfferCreate","OfferCancel"],
            ["2014-02-10T12:00:00+00:00",55,8],
            ["2014-02-10T13:00:00+00:00",117,19],
            ["2014-02-10T14:00:00+00:00",135,6],
            ...
            ...
            ...
        ]    

+ Response 200 (reduce = false, text/plain)

        [
            [
                "type",
                "account",
                "baseAmount",
                "counterAmount",
                "price",
                "time",
                "txHash",
                "ledgerIndex"
            ],
            [
                "OfferCreate",
                "rPEZyTnSyQyXBCwMVYy...",
                0.6482999999999998,
                37.500375,
                0.017287827121728768,
                "2014-02-10T12:45:50+00:00",
                "23E15021A4110D2129DC2A...",
                4903939
            ],
            .
            .
            .
        ]

+ Response 200 (json)
        
        {
            base : {
                currency : "XRP"
            },
            counter : { 
                currency : "USD",
                issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
            },
            startTime     : "2014-02-10T12:44:00+00:00",
            endTime       : "2014-02-11T13:09:00+00:00",
            timeIncrement : "hour",
            results       : [
                {
                    time         : "2014-02-10T12:00:00.000Z",
                    OfferCreate  : 55,
                    OfferCancel  : 8
                },
                {   
                    time         : "2014-02-10T13:00:00.000Z",
                    OfferCreate  : 117,
                    OfferCancel  : 19
                },
                .
                .
                .
            ]
        }
  
+ Response 200 (text/csv)

        time, OfferCreate, OfferCancel
        2014-02-10T12:00:00+00:00, 55, 8
        2014-02-10T13:00:00+00:00, 117, 19
        2014-02-10T14:00:00+00:00, 135, 6
        ...
        ...
        ...

 
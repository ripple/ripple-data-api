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
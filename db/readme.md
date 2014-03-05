##Ripple Historical Data Storage

###Ledger Importing Process

Historical ledgers from the Ripple Network are stored in couchDB through an ongoing importing process. This process consists of 3 parts: an importing script, an indexing triggerer, and a database validation script.

####Importer.js

importer.js is the ledger importing script.  The script can be configured to continously import new scripts, import historical scripts, or both at the same time.  It can also retreive a specific range of ledgers.

Available command line options:
```
  $node importer.js                           //historical import from current last closed ledger
  $node importer.js live                      //live update as well as historical import
  $node importer.js liveOnly                  //live updating only
  $node importer.js <minLedger>               //historical import from current last closed ledger to specified minumum
  $node importer.js <minLedger> <minLedger>   //historical import of specified range
  
  $node importer.js debug (or debug2,debug3)  //debugging levels, greater numbers show more information
```

Runing the script with no options or live enabled will begin the process of importing historical ledgers.  If the importing process had been started before, the script will continue importing from the most recently closed ledger back to the last saved ledger in the database. At that point, the database checker will run to make sure the data stored is all correct.  If there are any ledgers missing or wrong, the importing process will begin again from the point of error until all ledgers have been imported.  At that point the checker will verify the stored data again and then complete.

#####Indexing couchDB

The ledgers are saved to the database in batches, and each time a new batch is saved, the script queries each of the views to trigger indexing of the new data.  Doing this ensures that indexing does not need to be done at the time of an API call, which degrades performance.

#####Logging

errors and other messages are logged in `db/importer.log`

###CouchDB Design Docs

CouchDB uses sets of views for interpreting the ledgers stored in the database.  These views are separated into individual design documents so that they can be added, modified, and removed without causing other views to be unnecessarily reindexed.  the views are stored in the `db/design` folder with the following structure:

```
design/
  |- "name of view"/      // i.e. "accountsCreated" 
  |  |- views/
  |  |  |- v1/
  |  |  |  |- map.js      // couchDB maping function
  |  |  |  |- reduce.js   // couchDB reduce function
  |  |- _id               // text file containing the name of the view, i.e. "_design/accountsCreated" 
  |  |- language          // text file containing the langaue of the functions, ie. "javascript"
  |  |- validate_doc_update.js
```

views stored in this structure will be combined into a single JSON file and uploaded to couchDB via grunt.  Any new or
modified views will be reindexed, unchanged views will be ignored.



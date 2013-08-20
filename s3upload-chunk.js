var _ = require('lodash');
var express = require('express'),
    extend = require('extend'),
    fs = require('fs'),
    winston = require('winston'),
    config = require('./config'),
    model = require('./model');

var app = module.exports = express();

// Ripple client
var ripple = require('ripple-lib');
var utils = require('ripple-lib').utils;
var remote = ripple.Remote.from_config(config.remote);

//Amazon S3
var knox = require('knox');
var client = knox.createClient({
  key: config.s3.key,
  secret: config.s3.secret,
  bucket: config.s3.bucket
});

remote.on('error', function (err) {
  winston.error(err);
});

remote.on('connected', function(connection) {
  winston.info('WebSocket client connected');

  model.apply({
    status_connected: true
  });
  getLedgerIndex();
});

remote.on('disconnected', function(connection) {
  model.apply({
    status_connected: false
  });
});

remote.connect();

//Get Ledger index from S3 ledger-manifest.json file.
function getLedgerIndex() {
  client.get('/meta/chunk-manifest.json').on('response', function(res){
    var data = '';
    if(res.statusCode == 200) {
      res.on('data', function(chunk) {
        data += chunk.toString();
        //console.log(JSON.parse(data));
      }).on('end', function() {
        var ledger_index_data = JSON.parse(data);
        var latest = Math.max(+ledger_index_data.latest || 0, config.net.genesis_ledger);
        checkS3Chunk(latest+1);
      });
    } else {
      client.list({prefix: 'ledger'}, function(err, data) {
        if(data.Contents.length > 0) {
          data.Contents.sort(function(a, b) {
            return a.LastModified - b.LastModified;
          });
          var index = data.Contents[0].Key.replace(/^.*(\\|\/|\:)/, '').split('.')[0];
          checkS3Chunk(parseInt(index));
        } else {
          console.log('No ledger data in S3 ledger directory');
        }
      })
    }
  }).end();
}

//Check Chunk file size
function checkS3Chunk (ledger_index) {
  client.list({prefix: 'chunk'}, function(err, data){
    if(data.Contents.length > 0) {
      data.Contents.sort(function(a, b) {
        return a.LastModified - b.LastModified;
      });
      var last_item = data.Contents[data.Contents.length - 1];
      if(last_item.Size < 10*1024*1024) {
        getLatestChunkContent(last_item.Key, ledger_index);
      } else {
        var new_file_index = data.Contents.length + 1;
        createNewChunkFile(new_file_index, ledger_index);
      }
    } else {
      createNewChunkFile(1, ledger_index);
    }
  });
}

//Create a new Chunk file
function createNewChunkFile(file_index, ledger_index) {
  var new_filename = '/chunk/'+file_index+'.json';
  var string = JSON.stringify({ledgers: []});
  uploadS3File(new_filename, string, function(req, res) {
    if (200 == res.statusCode) {
      console.log('Created new chunk to %s', req.url);
      getLatestChunkContent(new_filename, ledger_index);
    }
  });
}

//Get latest chunk file content and check ledger index
function getLatestChunkContent(chunk_filename, ledger_index) {
  client.get(chunk_filename).on('response', function(res){
    var data = '';
    if(res.statusCode == 200){
      res.on('data', function(chunk) {
        data += chunk.toString();
        //console.log(JSON.parse(data));
      }).on('end', function() {
        var ledger_data = JSON.parse(data);
        var has_ledger = false;
        if (ledger_data.ledgers.length > 0) {
          _.each(ledger_data.ledgers, function(ledger_item) {
            if (parseInt(ledger_item.ledger.ledger_index) === parseInt(ledger_index)) {
              has_ledger = true;
              return true;
            }
          });
        }
        if (has_ledger) checkS3Chunk(ledger_index+1);
        else requestLedger(chunk_filename, ledger_index, ledger_data);
      });
    }
  }).end();
}

//Request ledger
function requestLedger(chunk_filename, ledger_index, ledger_data) {
  var ledger_filename = '/ledger/'+ledger_index+'.json';
  console.log(ledger_filename);
  client.get(ledger_filename).on('response', function(res){
    var data = '';
    console.log(res.statusCode);
    if(res.statusCode == 200) {
      res.on('data', function(chunk) {
        data += chunk.toString();
        //console.log(JSON.parse(data));
      }).on('end', function() {
        ledger_data.ledgers.push(JSON.parse(data));
        console.log(ledger_data);
        if(JSON.stringify(ledger_data).length > 10*1024*1024)
          uploadLedgerData(chunk_filename, ledger_data, ledger_index);
        else
          requestLedger(chunk_filename, ledger_index + 1, ledger_data);
      });
    }
  }).end();
}

//Upload each ledger data to the S3.
function uploadLedgerData (chunk_filename, ledger_data, ledger_index) {
  var ledger_string = JSON.stringify(ledger_data);
  uploadS3File(chunk_filename, ledger_string, function(req, res) {
    if (200 == res.statusCode) {
      console.log('saved to %s', req.url);
      uploadLastLedger(ledger_index);
    } else {
      console.log('Failed to upload');
      checkS3Chunk(ledger_index);
    }
  });
}

//Upload the latest ledger index to the S3.
function uploadLastLedger (ledger_index) {
  var s3_filename = '/meta/chunk-manifest.json';
  var last_ledger = {latest: ledger_index};
  var str_last_ledger = JSON.stringify(last_ledger);
  uploadS3File(s3_filename, str_last_ledger, function(req, res) {
    if (200 == res.statusCode) {
      console.log('saved to %s', req.url);
      checkS3Chunk(ledger_index+1);
    } else {
      console.log('Failed to upload');
      uploadLastLedger(ledger_index);
    }
  });
}

function uploadS3File (file_name, data, callback) {
  var req = client.put(file_name, {
    'Content-Length': data.length,
    'Content-Type': 'application/json'
  });

  req.on('response', function(res){
    callback(req, res);
  });

  req.end(data);
}
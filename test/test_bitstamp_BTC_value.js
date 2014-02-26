
var request = require('request'),
    moment  = require('moment');

  console.log("************************");

  console.log(" Requesting 24 hour Volume[USD] from Top 5 markets: ");

/*
  console.log("************************\n");

  console.log("Requesting Bitstamp 24 hour Volume[XRP:USD] result")
  request.post({
    url: 'http://127.0.0.1:5993/api/offersExercised',
    json: {
      base: {currency: 'XRP'},
      trade: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      descending: false,
//      timeMultiple: 24,
      startTime:'Jan 06 2014 00:00:00 GMT-0800 (PST)',
      endTime:'Jan 07 2014 00:00:00 GMT-0800 (PST)',
//      timeIncrement: 'hour'
    }
  }, function(err, res){
    if (err || res.body.err) {
      console.log(err || res.body.err);
      return;
    }
    console.log("NUMBER OF RESULTS: " + (res.body.length-1));

    console.log(res.body.join("\n"));
    //console.log(JSON.stringify(res.body));
  });
*/

  console.log("************************\n");

  console.log("Requesting Bitstamp Jan06 24 hour Volume[BTC:XRP] result")
  request.post({
    url: 'http://127.0.0.1:5993/api/topMarkets',
    json: {
      base: {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      trade: {currency: 'XRP'},
      descending: false,
      reduce:true,
//      timeMultiple: 24,
      startTime:'Jan 06 2014 00:00:00 GMT-0800 (PST)',
      endTime:'Jan 07 2014 00:00:00 GMT-0800 (PST)',
//      timeIncrement: 'hour'
    }
  }, function(err, res){
    if (err || res.body.err) {
      console.log(err || res.body.err);
      return;
    }
    console.log("NUMBER OF RESULTS: " + (res.body.length-1));

    console.log(res.body.join("\n"));
    //console.log(JSON.stringify(res.body));
  });
/*
  console.log("************************");

  console.log("Requesting RippleChina 24 hour Volume[USD] result")
  request.post({
    url: 'http://127.0.0.1:5993/api/offersExercised',
    json: {
      base: {currency: 'USD', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'},
      trade: {currency: 'XRP'},
      descending: false,
      timeMultiple: 24,
      startTime:'Tue Dec 31 2013 16:58:41 GMT-0800 (PST)',
      endTime:'Fri Jan 03 2014 16:58:41 GMT-0800 (PST)',
      timeIncrement: 'hour'
    }
  }, function(err, res){
    if (err || res.body.err) {
      console.log(err || res.body.err);
      return;
    }
    console.log("NUMBER OF RESULTS: " + (res.body.length-1));

    console.log(res.body.join("\n"));
    //console.log(JSON.stringify(res.body));
  });

  console.log("************************");

  console.log("Requesting rippleCN 24 hour Volume[USD] result")
  request.post({
    url: 'http://127.0.0.1:5993/api/offersExercised',
    json: {
      base: {currency: 'USD', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
      trade: {currency: 'XRP'},
      descending: false,
      timeMultiple: 24,
      startTime:'Tue Dec 31 2013 16:58:41 GMT-0800 (PST)',
      endTime:'Fri Jan 03 2014 16:58:41 GMT-0800 (PST)',
      timeIncrement: 'hour'
    }
  }, function(err, res){
    if (err || res.body.err) {
      console.log(err || res.body.err);
      return;
    }
    console.log("NUMBER OF RESULTS: " + (res.body.length-1));

    console.log(res.body.join("\n"));
    //console.log(JSON.stringify(res.body));
  });

  console.log("************************");

  console.log("Requesting RippleIsrael 24 hour Volume[USD] result")
  request.post({
    url: 'http://127.0.0.1:5993/api/offersExercised',
    json: {
      base: {currency: 'USD', issuer: 'rNPRNzBB92BVpAhhZr4iXDTveCgV5Pofm9'},
      trade: {currency: 'XRP'},
      descending: false,
      timeMultiple: 24,
      startTime:'Tue Dec 31 2013 16:58:41 GMT-0800 (PST)',
      endTime:'Fri Jan 03 2014 16:58:41 GMT-0800 (PST)',
      timeIncrement: 'hour'
    }
  }, function(err, res){
    if (err || res.body.err) {
      console.log(err || res.body.err);
      return;
    }
    console.log("NUMBER OF RESULTS: " + (res.body.length-1));

    console.log(res.body.join("\n"));
    //console.log(JSON.stringify(res.body));
  });

  console.log("************************");

  console.log("Requesting SnapSwap 24 hour Volume[USD] result")
  request.post({
    url: 'http://127.0.0.1:5993/api/offersExercised',
    json: {
      base: {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
      trade: {currency: 'XRP'},
      descending: false,
      timeMultiple: 24,
      startTime:'Tue Dec 31 2013 16:58:41 GMT-0800 (PST)',
      endTime:'Fri Jan 03 2014 16:58:41 GMT-0800 (PST)',
      timeIncrement: 'hour'
    }
  }, function(err, res){
    if (err || res.body.err) {
      console.log(err || res.body.err);
      return;
    }
    console.log("NUMBER OF RESULTS: " + (res.body.length-1));

    console.log(res.body.join("\n"));
    //console.log(JSON.stringify(res.body));
  });
*/
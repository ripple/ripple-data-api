
/*
 * GET home page.
 */
var index = require('../indexes');

exports.index = function(req, res){
  res.render('index', { issuers: index.issuers });
};

exports.partials = function (req, res) {
  var name = req.params.name;
  res.render('partials/' + name);
};
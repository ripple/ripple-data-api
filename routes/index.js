
/*
 * GET home page.
 */
var index = require('../indexes');

exports.index = function(req, res){
  res.render('index', { issuers: index.issuers });
};

exports.partials = function (req, res) {
  var name = req.params.name;
  if ("string" !== typeof name) throw new Error("Invalid partial");
  name = name.replace(/\.html$/i, '');
  res.render('partials/' + name);
};

var _ = require('lodash');
var winston = require('winston');
var rssparser = require('rssparser');

var config = require('./config');
var index = require('./indexes');
var model = require('./model');

var News = function (db, remote) {
  this.db = db;
  this.remote = remote;

};

News.prototype.getRss = function () {
  var self = this;
  var latest_date = "";
  self.db.query("SELECT publish_date FROM articles ORDER BY publish_date DESC LIMIT 0, 1",
                function (err, rows) {
    if (err) winston.error(err)
    if (rows[0]) {
      latest_date = rows[0].publish_date;
    }
    insertNews(latest_date);
  });

  function insertNews(date) {
    rssparser.parseURL('https://ripple.com/feed', {}, function(err, data){
      _.each(data.items, function (item) {
        var publish_date = new Date(item.published_at),
            title = item.title,
            category = item.categories,
            summary = item.summary,
            url = item.url;
        var date_diff = publish_date - date;
        if (date === "" || date_diff > 0) {
          self.db.query("INSERT INTO articles (title, category, summary, url, publish_date) VALUES (?, ?, ?, ?, ?)",
                      [title, category, summary, url, publish_date],
            function (err) {
              if (err) winston.error(err);
          });
        }
      });
    });
  }
};

exports.News = News;

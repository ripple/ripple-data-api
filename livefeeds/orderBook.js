/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;

/* Loading ripple-lib in a webpage */
// var Remote = ripple.Remote;
// var Amount = ripple.Amount;

var remote = new Remote({
    // see the API Reference for available options
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
});

getOrderBook(["XRP"], ["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"]);

function getOrderBook(curr1, curr2, callback) {
    remote.connect(function() {

        remote.book(
            (curr1.currency || curr1[0] || "XRP"), 
            (curr1.issuer || curr1[1] || ""), 
            (curr2.currency || curr2[0] || "XRP"), 
            (curr2.issuer || curr2[1] || "")
        ).on("model", function(book_entries) {
            var offers = book_entries.map(function(book_entry){
              var curr1_volume = (typeof book_entry.TakerPays === "object" ? book_entry.TakerPays.value : parseInt(book_entry.TakerPays, 10) / 1000000.0);
              var curr2_volume = (typeof book_entry.TakerGets === "object" ? book_entry.TakerGets.value : parseInt(book_entry.TakerGets, 10) / 1000000.0);
              
              var exchange_rate = Amount.from_quality(book_entry.BookDirectory).to_json().value;
              if (typeof book_entry.TakerPays !== "object")
                exchange_rate = exchange_rate / 1000000.0;
              if (typeof book_entry.TakerGets !== "object")
                exchange_rate = exchange_rate * 1000000.0;

              return {curr1_volume: curr1_volume, curr2_volume: curr2_volume, price: exchange_rate};
            });

            if (callback)
              callback(offers);
            else
              console.log(JSON.stringify(offers));
        });
    });
}

//var Remote = ripple.Remote;
//var Amount = ripple.Amount;


/**
 *  createTransactions listener attaches the txProcessor
 *  specified by viewName and the displayFn, along with
 *  the given options object to the live ripple transaction feed
 */
var TransactionFeed = function (options) {
    var self   = this;

    self.base  = options.base,
    self.trade = options.trade;
        
    this.listen = function () {
        options.remote.on( 'transaction_all', function(tx) {
            if (tx.engine_result !== 'tesSUCCESS') return;

            if (tx.transaction.TransactionType !== 'Payment' && 
                tx.transaction.TransactionType !== 'OfferCreate' ) {
                return;
            }
                        
            handleTransaction (tx);
        });        
    }  
    
    this.setCurrencies = function (base, trade) {
        self.base  = base;
        self.trade = trade;    
    }
    
    function handleTransaction(tx) {
        tx.meta.AffectedNodes.forEach( function( affNode ) {

            var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;
    
            if ( node.LedgerEntryType !== 'Offer' || 
                !node.PreviousFields || 
                !node.PreviousFields.TakerPays || 
                !node.PreviousFields.TakerGets ) {
                return;
            }
    
            var date = new Date((tx.transaction.date + 0x386D4380) * 1000);
            //var exchange_rate = ripple.Amount.from_quality(node.FinalFields.BookDirectory).to_json().value,
            var pays, gets;
    
            //extract assets exchanged
            if ( typeof node.PreviousFields.TakerPays === "object" ) {
                pays = {
                    currency : node.PreviousFields.TakerPays.currency, 
                    issuer   : node.PreviousFields.TakerPays.issuer,
                    amount   : node.PreviousFields.TakerPays.value - node.FinalFields.TakerPays.value};
                    
            } else {
                pays = {
                    currency : "XRP", 
                    issuer   : "",
                    amount   : (node.PreviousFields.TakerPays - node.FinalFields.TakerPays) / 1000000.0}; // convert from drops
            }
    
            if ( typeof node.PreviousFields.TakerGets === "object" ) {
                gets = {
                    currency : node.PreviousFields.TakerGets.currency, 
                    issuer   : node.PreviousFields.TakerGets.issuer,
                    amount   : node.PreviousFields.TakerGets.value - node.FinalFields.TakerGets.value};
            } else {
                gets = {
                    currency : "XRP", 
                    issuer   : "",
                    amount   : (node.PreviousFields.TakerGets - node.FinalFields.TakerGets) / 1000000.0}; // convert from drops
            }
        
            if (assetEquals(self.base, pays) && assetEquals (self.trade, gets)) {
                handleOffer (pays, gets, date);
            } else if (assetEquals (self.base, gets) && assetEquals (self.trade, pays)) {
                handleOffer (gets, pays, date);
            }
        });
    }
    
    function handleOffer (a, b, date) {
        console.log(a, b, date);   
    }
    
    function assetEquals(a, b) {
        if (a.currency == b.currency &&
            a.issuer   == b.issuer) return true;
            return false; 
    }
}


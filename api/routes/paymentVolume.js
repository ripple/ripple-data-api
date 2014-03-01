/**
 * transactionVolume - get the volume of transactions between any 2 currency-issuer pairs
 * the transaction volume will be measured in the amount of originating currency, and the
 * amount of destination currency (the amount received). 
 * 
 * request: {
 *
 *    origin: {   // originating currency+issuer - optional, one of origin or destination is required
 *      currency : ("XRP", "USD", etc.)
 *      issuer   : ("bitstamp", "rxSza...") // optional, if absent all gateways from curated list will be queried
 *    },
 * 
 *    destination: {  // final currency+issuer - optional, one of origin or destination is required
 *      currency : ("XRP", "USD", etc.)
 *      issuer   : ("bitstamp", "rxSza...") // optional, if absent all gateways from curated list will be queried
 *    },
 *
 *
 *    pairs: {origin{currency,issuer},destination{currency,issuer}} // optional, list of origin/destination pairs in the format:
 *
 *      
 *
 *    interval   : // second, minute, etc
 *    start      : // range start date + time
 *    end        : // range end date + time
 *    descending : // true/false - optional
 *    reduce     : // true/false - optional
 * }
 *
 * response: [
 *    { 
 *      origin      : //currency pair from request 
 *      destination : //currency pair from 
 *      results : [
 *        [
 *          time,
 *          originVolume,
 *          destinationVolume
 *        ], 
 *        [
 *          time,
 *          originVolume,
 *          destinationVolume
 *        ],
 *            .
 *            .
 *            .
 *            .
 *      ]
 *    },
 *        .
 *        . 
 *        .
 *        .
 *  ]
 *
 */
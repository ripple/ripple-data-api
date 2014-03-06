// function map (doc) {
function(doc) {

  var time = new Date(doc.close_time_timestamp);
  var timestamp = [
    time.getUTCFullYear(), 
    time.getUTCMonth(), 
    time.getUTCDate(),
    time.getUTCHours(), 
    time.getUTCMinutes(), 
    time.getUTCSeconds()
  ];

  doc.transactions.forEach(function(tx){

    if (tx.metaData.TransactionResult !== 'tesSUCCESS') {
      return;
    }

    if (tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate') {
      return;
    }

    var src_balance_changes = parseBalanceChanges(tx, tx.Account);

    if (src_balance_changes.length > 0) {
      src_balance_changes.forEach(function(bal_change){
        emit([bal_change.currency, bal_change.issuer].concat(timestamp), [0 - parseFloat(bal_change.value), tx.hash]);
      });
    }

  });

  function parseBalanceChanges (tx, address) {

    var addressBalanceChanges = [];

    tx.metaData.AffectedNodes.forEach(function(affNode){

      var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;

      // Look for XRP balance change in AccountRoot node
      if (node.LedgerEntryType === 'AccountRoot') {

        var xrpBalChange = parseAccountRootBalanceChange(node, address);
        
        if (xrpBalChange) {
          xrpBalChange.value += parseFloat(tx.Fee); //remove the fee from the balance change
          
          //if we are still negative, XRP was sent.
          //often this would be zero, indicating only a fee
          //and not really sending XRP
          if (xrpBalChange.value<0) {
            xrpBalChange.value = dropsToXrp(xrpBalChange.value); //convert to XRP
            addressBalanceChanges.push(xrpBalChange);
          }
        }
      }

      // Look for trustline balance change in RippleState node
      if (node.LedgerEntryType === 'RippleState') {

        var currBalChange = parseTrustlineBalanceChange(node, address);
        if (currBalChange) {
          addressBalanceChanges.push(currBalChange);
        }

      }

    });

    return addressBalanceChanges;

  }


  function parseAccountRootBalanceChange (node, address) {

/*
    if (node.NewFields) {

      if (node.NewFields.Account === address) {
        return {
          value: dropsToXrp(node.NewFields.Balance),
          currency: 'XRP',
          issuer: ''
        };
      }

    } else if (node.FinalFields) {
*/
      
    if (node.FinalFields && node.FinalFields.Account === address) {

      var finalBal = node.FinalFields.Balance,
        prevBal    = node.PreviousFields.Balance,
        balChange  = finalBal - prevBal;
      
      //if the final balance is greater than the previous, xrp was sent
      if (balChange<0) return {
        value: balChange,
        currency: 'XRP',
        issuer: ''
      };
    }


    return null;
  }

  function parseTrustlineBalanceChange (node, address) {

    var balChange = {
        value: 0,
        currency: '',
        issuer: ''
      }, 
      trustHigh,
      trustLow,
      trustBalFinal,
      trustBalPrev;

    if (node.NewFields) {
      trustHigh = node.NewFields.HighLimit;
      trustLow = node.NewFields.LowLimit;
      trustBalFinal = parseFloat(node.NewFields.Balance.value);
    } else {
      trustHigh = node.FinalFields.HighLimit;
      trustLow = node.FinalFields.LowLimit;
      trustBalFinal = parseFloat(node.FinalFields.Balance.value); 
    }

    if (node.PreviousFields && node.PreviousFields.Balance) {
      trustBalPrev = parseFloat(node.PreviousFields.Balance.value);
    } else {
      trustBalPrev = 0;
    }

    //high = account
    //in this case, the account is not an issuer
    //for amounts sent, final - previous should be negative here
    //if not, its an amount received...i believe
    
    //low == account
    //in this case, the account is an issuer
    //for amounts sent, final - previous should be negative again
    //if not, its an amount received...i believe
    
    if (trustHigh.issuer === address ||
        trustLow.issuer  === address) {
      balChange.value = parseFloat(trustBalFinal) - parseFloat(trustBalPrev);  
    } else {
      return null; 
    }
    
    if (balChange.value > 0) return null;
/*
    // Set value
    if (trustLow.issuer === address) {
      balChange.value = parseFloat(trustBalFinal) - parseFloat(trustBalPrev);
    } else if (trustHigh.issuer === address) {
      balChange.value = 0 - (parseFloat(trustBalFinal) - parseFloat(trustBalPrev));
    } else {
      return null;
    }
*/

    // Set currency
    balChange.currency = (node.NewFields || node.FinalFields).Balance.currency;

    // Set issuer
    if ((parseFloat(trustHigh.value) === 0 && parseFloat(trustLow.value) === 0) ||
      (parseFloat(trustHigh.value) > 0 && parseFloat(trustLow.value) > 0)) {

      if (parseFloat(trustBalFinal) > 0 || parseFloat(trustBalPrev) > 0) {
        balChange.issuer = trustLow.issuer;
      } else {
        balChange.issuer = trustHigh.issuer;
      }

    } else if (parseFloat(trustHigh.value) > 0) {
      balChange.issuer = trustLow.issuer;
    } else if (parseFloat(trustLow.value) > 0) {
      balChange.issuer = trustHigh.issuer;
    }

    return balChange;

  }

  function dropsToXrp (drops) {
    return parseFloat(drops) / 1000000.0;
  }

  function xrpToDrops (xrp) {
    return parseFloat(xrp) * 1000000.0;
  }

}

// function emit(key, value) {
//   console.log('key: ' + JSON.stringify(key) + ' value: ' + value);
// }

// map({
//       "accepted": true,
//       "account_hash": "ADDDCDB0C57D4F6010713C8A97C09A39EBD9CFF339DD2020B081E87DF3D1FAE0",
//       "close_time": 444459220,
//       "close_time_human": "2014-Jan-31 04:53:40",
//       "close_time_resolution": 10,
//       "closed": true,
//       "hash": "E02BBDE4A5BB721C72BBF4C2139A0A22637E43A46DEC44B4BF85B8A20F765970",
//       "ledger_hash": "E02BBDE4A5BB721C72BBF4C2139A0A22637E43A46DEC44B4BF85B8A20F765970",
//       "ledger_index": "4718685",
//       "parent_hash": "B3BA5147905C6017354B408D1EF0C9AD0EB3E352BFAB8521B6D392E44E7F1B3D",
//       "seqNum": "4718685",
//       "totalCoins": "99999998050649525",
//       "total_coins": "99999998050649525",
//       "transaction_hash": "E7422BEA4FE1789B3EFFEB2293436C371F69F08904EAC7C17C29D64A643A9B29",
//       "transactions": [
//         {
//           "Account": "rU2DL7DwxxEjkRFV6uuSZtmJiosV5YgetS",
//           "Amount": {
//             "currency": "BTC",
//             "issuer": "rLpq5RcRzA8FU1yUqEPW4xfsdwon7casuM",
//             "value": "0.0001"
//           },
//           "Destination": "rLpq5RcRzA8FU1yUqEPW4xfsdwon7casuM",
//           "Fee": "15",
//           "Flags": 0,
//           "Paths": [
//             [
//               {
//                 "account": "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rsZJQzsexY63t8LdkKhFdkqc29Bh2946Uh",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               }
//             ],
//             [
//               {
//                 "account": "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "r9LqFsCMME6NNSFkb5wmPYaUaf1AzgbKyc",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               }
//             ],
//             [
//               {
//                 "account": "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rGe5oH9mzzJ5CsfUJhHhraUCrkfY7zEQVV",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               }
//             ],
//             [
//               {
//                 "account": "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rnziParaNb8nsU4aruQdwYE3j5jUcqjzFm",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               },
//               {
//                 "account": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
//                 "type": 1,
//                 "type_hex": "0000000000000001"
//               }
//             ]
//           ],
//           "SendMax": {
//             "currency": "BTC",
//             "issuer": "rU2DL7DwxxEjkRFV6uuSZtmJiosV5YgetS",
//             "value": "0.000101353803"
//           },
//           "Sequence": 22,
//           "SigningPubKey": "03B5115CC780BA2EE3F0CA617BA8CC2408BB52A646A0585C236F1BA362F4F8EB89",
//           "TransactionType": "Payment",
//           "TxnSignature": "304402202D80325969238916D0D873D42684B62DFE8E22264413FC38F26F3512758F8AC202205D5482A0E9E5818250472BE80974083A8C9B093738EB20F3F17AAC7A45942AB8",
//           "hash": "0D137EAAD7CC6296B4B330314846E89D484B2C4890936D3FE1969897A31F6D5C",
//           "metaData": {
//             "AffectedNodes": [
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "-0.000894562910134798"
//                     },
//                     "Flags": 131072,
//                     "HighLimit": {
//                       "currency": "BTC",
//                       "issuer": "rsZJQzsexY63t8LdkKhFdkqc29Bh2946Uh",
//                       "value": "0.1"
//                     },
//                     "HighNode": "0000000000000000",
//                     "LowLimit": {
//                       "currency": "BTC",
//                       "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
//                       "value": "0"
//                     },
//                     "LowNode": "0000000000000113"
//                   },
//                   "LedgerEntryType": "RippleState",
//                   "LedgerIndex": "235866687C354C777919CF68490F86E81CCF96E9F068765B964808DE7B97AEAF",
//                   "PreviousFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "-0.000994762910134798"
//                     }
//                   },
//                   "PreviousTxnID": "1CCCFFCB3EBEBDB2F075186858927D4315CB2A93FB601E66FE70ECB07FE5902F",
//                   "PreviousTxnLgrSeq": 4699097
//                 }
//               },
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "0.001141447515872594"
//                     },
//                     "Flags": 65536,
//                     "HighLimit": {
//                       "currency": "BTC",
//                       "issuer": "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX",
//                       "value": "0"
//                     },
//                     "HighNode": "0000000000000033",
//                     "LowLimit": {
//                       "currency": "BTC",
//                       "issuer": "rsZJQzsexY63t8LdkKhFdkqc29Bh2946Uh",
//                       "value": "0.1"
//                     },
//                     "LowNode": "0000000000000000"
//                   },
//                   "LedgerEntryType": "RippleState",
//                   "LedgerIndex": "2FAC03FAF21C97882149BC3D968431F947547E202841E703786E1B1229D904F0",
//                   "PreviousFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "0.001041247515872594"
//                     }
//                   },
//                   "PreviousTxnID": "1CCCFFCB3EBEBDB2F075186858927D4315CB2A93FB601E66FE70ECB07FE5902F",
//                   "PreviousTxnLgrSeq": 4699097
//                 }
//               },
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Account": "rU2DL7DwxxEjkRFV6uuSZtmJiosV5YgetS",
//                     "Balance": "172113760760",
//                     "Flags": 0,
//                     "OwnerCount": 2,
//                     "Sequence": 23
//                   },
//                   "LedgerEntryType": "AccountRoot",
//                   "LedgerIndex": "C32FC61866A3744D802E52F6276A4680F82738EB4A9671AD2BFFBDA934E068BE",
//                   "PreviousFields": {
//                     "Balance": "172113760775",
//                     "Sequence": 22
//                   },
//                   "PreviousTxnID": "18BDA2A877475840B427F8552E946367E0FBA5CC918E065B5CBFE4ED54752DDF",
//                   "PreviousTxnLgrSeq": 4707221
//                 }
//               },
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "-0.5489575198674392"
//                     },
//                     "Flags": 2228224,
//                     "HighLimit": {
//                       "currency": "BTC",
//                       "issuer": "rU2DL7DwxxEjkRFV6uuSZtmJiosV5YgetS",
//                       "value": "100"
//                     },
//                     "HighNode": "0000000000000000",
//                     "LowLimit": {
//                       "currency": "BTC",
//                       "issuer": "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX",
//                       "value": "0"
//                     },
//                     "LowNode": "000000000000003B"
//                   },
//                   "LedgerEntryType": "RippleState",
//                   "LedgerIndex": "D505A48DABB927A1F2A0E0A4A4393320772BDB14F243FBB38B1F89340E7B5D2E",
//                   "PreviousFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "-0.5490578701674392"
//                     }
//                   },
//                   "PreviousTxnID": "1F99E7E9BCFD285793D54F7CB3161745D7C9B615D68EEFA37E3D77044FF6CA2E",
//                   "PreviousTxnLgrSeq": 4689485
//                 }
//               },
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "-0.00112098"
//                     },
//                     "Flags": 131072,
//                     "HighLimit": {
//                       "currency": "BTC",
//                       "issuer": "rLpq5RcRzA8FU1yUqEPW4xfsdwon7casuM",
//                       "value": "1"
//                     },
//                     "HighNode": "0000000000000000",
//                     "LowLimit": {
//                       "currency": "BTC",
//                       "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
//                       "value": "0"
//                     },
//                     "LowNode": "00000000000000BB"
//                   },
//                   "LedgerEntryType": "RippleState",
//                   "LedgerIndex": "DB50D38DF8AA6F652D7BF58229745D8095FFFA9465130D1C1976AAEBB5C2DCDE",
//                   "PreviousFields": {
//                     "Balance": {
//                       "currency": "BTC",
//                       "issuer": "rrrrrrrrrrrrrrrrrrrrBZbvji",
//                       "value": "-0.00102098"
//                     }
//                   },
//                   "PreviousTxnID": "72E2970A1CE0CB56A8F11F9E36847E59BA62BEDB7DAD6C0461E36C1E694DFEDC",
//                   "PreviousTxnLgrSeq": 4699069
//                 }
//               }
//             ],
//             "TransactionIndex": 0,
//             "TransactionResult": "tesSUCCESS"
//           }
//         },
//         {
//           "Account": "rs1KQkwBYW1pY7jGeRiNgBkbD6WkPG4cYE",
//           "Amount": "4000000",
//           "Destination": "rpyUV8W6XRvss6SBkAS8PyzGwMsSDxgNXW",
//           "DestinationTag": 2,
//           "Fee": "12",
//           "Flags": 0,
//           "Sequence": 9113,
//           "SigningPubKey": "03441A4ED5967DEB25C52892BA8274EF6E1D7293609C0C4CF7DFF5257230365DDB",
//           "TransactionType": "Payment",
//           "TxnSignature": "304402207D4F0636474CB5AB61362FAA03AE609F45772FE472E38ACB589DC63BEA779C1C02207058EF9E47C46E51E96703EBAE61E91BB32BC5CD48FF77CAF6CB7980B44295D2",
//           "hash": "3F72E3C4C391AD1CE4E436CE68C3D6E16F8BA9FCDE911886D0AA6078BC8D1DF6",
//           "metaData": {
//             "AffectedNodes": [
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Account": "rs1KQkwBYW1pY7jGeRiNgBkbD6WkPG4cYE",
//                     "Balance": "2782924305",
//                     "Flags": 0,
//                     "OwnerCount": 0,
//                     "Sequence": 9114
//                   },
//                   "LedgerEntryType": "AccountRoot",
//                   "LedgerIndex": "A2A15502645DE43E85253F66C447D05B0A9C9927AA0C544AB0411A123D7FF80A",
//                   "PreviousFields": {
//                     "Balance": "2786924317",
//                     "Sequence": 9113
//                   },
//                   "PreviousTxnID": "40AB3BD0DE0A8C952E29B5C45DDA0A18D4EDB27B579ABAF56257D7DC2E93D866",
//                   "PreviousTxnLgrSeq": 4718675
//                 }
//               },
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Account": "rpyUV8W6XRvss6SBkAS8PyzGwMsSDxgNXW",
//                     "Balance": "1478454471599",
//                     "Flags": 0,
//                     "OwnerCount": 0,
//                     "Sequence": 228555
//                   },
//                   "LedgerEntryType": "AccountRoot",
//                   "LedgerIndex": "C754412E25ED3F4257524CED149B993DC1683BDEBE6E0514604008A9B259813B",
//                   "PreviousFields": {
//                     "Balance": "1478450471599"
//                   },
//                   "PreviousTxnID": "40AB3BD0DE0A8C952E29B5C45DDA0A18D4EDB27B579ABAF56257D7DC2E93D866",
//                   "PreviousTxnLgrSeq": 4718675
//                 }
//               }
//             ],
//             "TransactionIndex": 1,
//             "TransactionResult": "tesSUCCESS"
//           }
//         },
//         {
//           "Account": "ra7JkEzrgeKHdzKgo4EUUVBnxggY4z37kt",
//           "Amount": {
//             "currency": "USD",
//             "issuer": "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q",
//             "value": "100"
//           },
//           "Destination": "rfUW4KCKvzdA4MCgoft1u5ojuQbpSFRktB",
//           "Fee": "10",
//           "Flags": 0,
//           "SendMax": {
//             "currency": "USD",
//             "issuer": "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q",
//             "value": "100.00001"
//           },
//           "Sequence": 123651,
//           "SigningPubKey": "02808D78A818D7B27FC43D27A5E793E354A72204E0ACD59A88BB13743FF0F14625",
//           "SourceTag": 926415956,
//           "TransactionType": "Payment",
//           "TxnSignature": "3046022100EECB7E3083B924EF79F2366A50E8E5E22323E16515C502B47278AABB2E6E79260221008A1D05120284992C63FA75BFE1FB11F8823DD2238FE9DB6DF20185D133F8CA92",
//           "hash": "80575096E403379AD2F37A4006FF59A69E9AFD0DF4CA70AC9C4CEE08B1AB5F09",
//           "metaData": {
//             "AffectedNodes": [
//               {
//                 "ModifiedNode": {
//                   "FinalFields": {
//                     "Account": "ra7JkEzrgeKHdzKgo4EUUVBnxggY4z37kt",
//                     "Balance": "98863451",
//                     "Flags": 917504,
//                     "OwnerCount": 1,
//                     "Sequence": 123652
//                   },
//                   "LedgerEntryType": "AccountRoot",
//                   "LedgerIndex": "D72C5D772234B929C5025423FE111846E4F20EF92269368D4D264A12982FDFE4",
//                   "PreviousFields": {
//                     "Balance": "98863461",
//                     "Sequence": 123651
//                   },
//                   "PreviousTxnID": "CC277E6C1063C20D1BA1C922C4081320CD316A330019DE7B479D569C9D5404A0",
//                   "PreviousTxnLgrSeq": 4718677
//                 }
//               }
//             ],
//             "TransactionIndex": 2,
//             "TransactionResult": "tecPATH_PARTIAL"
//           }
//         }
//       ]
//     });
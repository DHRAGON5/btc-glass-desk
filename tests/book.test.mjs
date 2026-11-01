import test from 'node:test';import assert from 'node:assert/strict';import {Book,parseWire,crc32,decimal} from '../core/book.mjs';
test('CRC32 Standardreferenz und Dezimalpräzision',()=>{assert.equal(crc32('123456789'),3421780262);assert.equal(decimal(parseWire('1.00000000')), '1.00000000');assert.equal(decimal(parseWire('1.2e-7')), '0.00000012');});
test('Snapshot, Update, Löschung, Prüfsummenfehler und Neusynchronisierung',()=>{
 const book=new Book(10);const raw='{"type":"snapshot","data":[{"asks":[{"price":101.0,"qty":2.00000000}],"bids":[{"price":100.0,"qty":1.00000000}],"checksum":0}]}';const msg=parseWire(raw);msg.data[0].checksum=crc32('10102000000001000100000000');assert.equal(book.apply(msg),true);assert.equal(book.snapshot().asks[0].qty,2);
 const update=parseWire('{"type":"update","data":[{"asks":[{"price":101.0,"qty":0},{"price":102.0,"qty":3.00000000}],"checksum":0}]}');update.data[0].checksum=crc32('10203000000001000100000000');assert.equal(book.apply(update),true);assert.equal(book.snapshot().asks[0].price,102);
 update.data[0].checksum=1;assert.equal(book.apply(update),false);assert.equal(book.apply(msg),true);
});
test('Tiefe wird nach allen Updates abgeschnitten',()=>{const b=new Book(10);b.valid=true;const data={asks:Array.from({length:15},(_,i)=>({price:String(101+i),qty:'1.0'})),bids:Array.from({length:15},(_,i)=>({price:String(100-i),qty:'1.0'})),checksum:0};b.apply({type:'update',data:[data]});assert.equal(b.asks.size,10);assert.equal(b.bids.size,10);});

import { parse } from 'lossless-json';
export function parseWire(raw){return parse(raw);}
const val=x=>x?.value??String(x);
export function decimal(x){const s=val(x);if(!/[eE]/.test(s))return s;const [m,e]=s.toLowerCase().split('e');const [a,b='']=m.split('.'),digits=a+b,pos=a.length+Number(e);return pos<=0?'0.'+'0'.repeat(-pos)+digits:pos>=digits.length?digits+'0'.repeat(pos-digits.length):digits.slice(0,pos)+'.'+digits.slice(pos);}
export function crc32(s){let crc=0xffffffff;for(let i=0;i<s.length;i++){crc^=s.charCodeAt(i);for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
const clean=x=>decimal(x).replace('.','').replace(/^0+/,'');
export class Book {
  constructor(depth=100){this.depth=depth;this.reset();}
  reset(){this.bids=new Map();this.asks=new Map();this.valid=false;this.updatedAt=0;}
  rows(side){return [...this[side].values()].sort((a,b)=>side==='asks'?Number(a.price)-Number(b.price):Number(b.price)-Number(a.price));}
  checksum(){return crc32(['asks','bids'].map(side=>this.rows(side).slice(0,10).map(x=>clean(x.price)+clean(x.qty)).join('')).join(''));}
  apply(message,now=Date.now()){
    if(message.type==='snapshot')this.reset();else if(!this.valid)return false;
    const data=message.data[0];
    for(const side of ['bids','asks']){
      for(const row of data[side]??[]){const price=decimal(row.price),qty=decimal(row.qty);if(Number(qty)===0)this[side].delete(String(Number(price)));else this[side].set(String(Number(price)),{price,qty});}
      const sorted=this.rows(side);for(const row of sorted.slice(this.depth))this[side].delete(String(Number(row.price)));
    }
    this.valid=this.checksum()===Number(data.checksum);
    if(this.bids.size&&this.asks.size&&Number(this.rows('bids')[0].price)>=Number(this.rows('asks')[0].price))this.valid=false;
    this.updatedAt=this.valid?now:0;return this.valid;
  }
  snapshot(){return {valid:this.valid,updatedAt:this.updatedAt,bids:this.rows('bids').map(x=>({price:Number(x.price),qty:Number(x.qty)})),asks:this.rows('asks').map(x=>({price:Number(x.price),qty:Number(x.qty)}))};}
}

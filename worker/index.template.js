const ASSETS=__ASSET_MAP__;
const NEWS_SOURCE='https://www.coindesk.com/arc/outboundfeeds/rss/';

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
function type(path){const dot=path.lastIndexOf('.');return TYPES[path.slice(dot)]||'application/octet-stream';}
function binary(base64){const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
function decode(value=''){return value.replace(/^\s*<!\[CDATA\[/,'').replace(/\]\]>\s*$/,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function tag(block,name){const match=block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'));return decode(match?.[1]||'');}
function parseFeed(xml){return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match,index)=>{const block=match[1],url=tag(block,'link'),title=tag(block,'title'),body=tag(block,'description'),published=Date.parse(tag(block,'pubDate'));return {id:tag(block,'guid')||url||String(index),title,body,url,published_on:Number.isFinite(published)?Math.floor(published/1000):0,categories:[...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(x=>decode(x[1])).join('|'),source_info:{name:'CoinDesk'}};});}
async function news(request,ctx){
  const key=new Request(new URL('/api/news-cache',request.url));
  const cache=globalThis.caches?.default,cached=cache?await cache.match(key):null;if(cached)return cached;
  try{
    const upstream=await fetch(NEWS_SOURCE,{headers:{Accept:'application/rss+xml, application/xml','User-Agent':'BTC-Glass-Desk/1.0'}});
    if(!upstream.ok)return Response.json({Data:[],Message:`News Quelle antwortet mit ${upstream.status}`},{status:502});
    const response=Response.json({Data:parseFeed(await upstream.text())},{headers:{'cache-control':'public, max-age=300'}});
    if(cache)ctx.waitUntil(cache.put(key,response.clone()));return response;
  }catch(error){return Response.json({Data:[],Message:error?.message||'News Quelle nicht erreichbar'},{status:502});}
}
export default {async fetch(request,env,ctx){
  void env;const url=new URL(request.url);if(url.pathname==='/api/news')return news(request,ctx);
  const path=url.pathname==='/'?'/index.html':url.pathname,asset=ASSETS[path];
  if(!asset)return new Response('Not found',{status:404});
  return new Response(asset.binary?binary(asset.body):asset.body,{headers:{'content-type':type(path),'cache-control':path==='/index.html'?'no-cache':'public, max-age=31536000, immutable'}});
}};

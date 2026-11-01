import 'dotenv/config';
import express from 'express';
import {createServer} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import webpush from 'web-push';
import {resolve} from 'node:path';
import {Market} from '../core/market.mjs';
import {DEFAULTS,validateSettings} from '../core/engine.mjs';
import {Storage} from './storage.mjs';
import {constantEqual,issueSession,verifySession,cookieToken,validateSubscription} from './security.mjs';

const port=Number(process.env.PORT||3000),password=process.env.APP_PASSWORD,secret=process.env.SESSION_SECRET;
if(!password||password.length<16||!secret||secret.length<32){console.error('Konfiguration fehlt. Zuerst npm run setup ausführen.');process.exit(1);}
const origin=new URL(process.env.PUBLIC_ORIGIN||`http://localhost:${port}`).origin;
if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw Error('PUBLIC_ORIGIN muss HTTPS verwenden');
const db=new Storage(process.env.DATA_DIR||'data');
const pushReady=Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
if(pushReady)webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss://ws.kraken.com https://api.kraken.com; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  if(['POST','PUT','DELETE','PATCH'].includes(req.method)&&req.headers.origin!==origin)return res.status(403).json({error:'Origin nicht zugelassen'});
  next();
});
app.use(express.json({limit:'16kb'}));
const attempts=new Map();
app.post('/api/login',(req,res)=>{
  const key=req.ip;let a=attempts.get(key);if(!a||Date.now()-a.start>900000){a={start:Date.now(),count:0};attempts.set(key,a);}if(++a.count>20)return res.status(429).json({error:'Zu viele Versuche. In 15 Minuten erneut versuchen.'});
  if(!constantEqual(req.body.password||'',password))return res.status(401).json({error:'Passwort stimmt nicht'});
  attempts.delete(key);res.setHeader('Set-Cookie',`desk_session=${issueSession(secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${origin.startsWith('https:')?'; Secure':''}`);res.json({ok:true});
});
app.get('/api/health',(_req,res)=>res.json({app:'btc-glass-desk',mode:'server',pushConfigured:pushReady,marketHealthy:market?.isHealthy()||false}));
let newsCache={time:0,body:null};
function decodeNews(value=''){return value.replace(/^\s*<!\[CDATA\[/,'').replace(/\]\]>\s*$/,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function newsTag(block,name){const match=block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'));return decodeNews(match?.[1]||'');}
function parseNewsFeed(xml){return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match,index)=>{const block=match[1],url=newsTag(block,'link'),title=newsTag(block,'title'),body=newsTag(block,'description'),published=Date.parse(newsTag(block,'pubDate'));return {id:newsTag(block,'guid')||url||String(index),title,body,url,published_on:Number.isFinite(published)?Math.floor(published/1000):0,categories:[...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(x=>decodeNews(x[1])).join('|'),source_info:{name:'CoinDesk'}};});}
app.get('/api/news',async(_req,res)=>{
  if(newsCache.body&&Date.now()-newsCache.time<300000)return res.json(newsCache.body);
  try{const upstream=await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/',{headers:{Accept:'application/rss+xml, application/xml','User-Agent':'BTC-Glass-Desk/1.0'},signal:AbortSignal.timeout(12000)});if(!upstream.ok)throw Error(`News Quelle antwortet mit ${upstream.status}`);const body={Data:parseNewsFeed(await upstream.text())};newsCache={time:Date.now(),body};res.json(body);}catch(error){res.status(502).json({Data:[],Message:error.message||'News Quelle nicht erreichbar'});}
});
app.use('/api',(req,res,next)=>verifySession(cookieToken(req.headers.cookie),secret)?next():res.status(401).json({error:'Bitte anmelden'}));
app.post('/api/logout',(_req,res)=>{res.setHeader('Set-Cookie','desk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({ok:true});});
const market=new Market({settings:db.get('settings',DEFAULTS),saved:db.get('engine'),WebSocketImpl:WebSocket,onEvent:event=>{
  db.record(event,pushReady&&event.dataHealthy&&!event.historical&&Date.now()/1000-event.eventTime<=30);
}});
function snapshot(){return {...market.snapshot(),mode:'server',events:db.events(),pushConfigured:pushReady,pushStatus:db.get('pushStatus'),subscribers:db.subscriptions().length};}
app.get('/api/state',(_req,res)=>res.json(snapshot()));
app.put('/api/settings',(req,res)=>{try{const settings=validateSettings(req.body);market.updateSettings(settings);db.set('settings',settings);res.json({settings});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/push/key',(_req,res)=>res.json({publicKey:pushReady?process.env.VAPID_PUBLIC_KEY:null}));
app.post('/api/push/subscribe',(req,res)=>{try{if(!pushReady)throw Error('VAPID nicht eingerichtet');db.subscribe(validateSubscription(req.body));res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/push/subscribe',(req,res)=>{db.unsubscribe(String(req.body.endpoint||''));res.json({ok:true});});
const pushTests=new Map();
app.post('/api/push/test',async(req,res)=>{
  if(!pushReady)return res.status(503).json({error:'Push nicht eingerichtet'});
  const endpoint=String(req.body.endpoint||'');const sub=db.subscriptions().find(s=>s.endpoint===endpoint);if(!sub)return res.status(404).json({error:'Dieses Gerät ist nicht angemeldet'});
  if(Date.now()-(pushTests.get(endpoint)||0)<10000)return res.status(429).json({error:'Bitte zehn Sekunden warten'});pushTests.set(endpoint,Date.now());
  try{await webpush.sendNotification(sub,JSON.stringify({title:'BTC Glass Desk · Test',body:'Push ist eingerichtet. Dies ist kein Handelssignal.',url:'/',tag:'desk-test'}),{TTL:60,timeout:8000});res.json({ok:true});}catch{res.status(502).json({error:'Push Anbieter hat die Testnachricht nicht angenommen'});}
});
app.use(express.static(resolve('dist'),{setHeaders:(res,path)=>{if(path.endsWith('sw.js'))res.setHeader('Cache-Control','no-cache');}}));
app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
app.use((err,_req,res,_next)=>res.status(400).json({error:err.type==='entity.too.large'?'Anfrage zu groß':'Ungültige Anfrage'}));
const server=createServer(app),wss=new WebSocketServer({noServer:true,maxPayload:1024});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/stream'||req.headers.origin!==origin||!verifySession(cookieToken(req.headers.cookie),secret)){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>{ws.send(JSON.stringify(snapshot()));});
});
let lastSaved=0,busy=false;
const timer=setInterval(async()=>{
  const now=Date.now();if(wss.clients.size){const snap=snapshot();const body=JSON.stringify({...snap,kind:'tick',frames:Object.fromEntries(Object.entries(snap.frames).map(([k,v])=>[k,v.slice(-2)])),heat:snap.heat.slice(-1)});for(const ws of wss.clients)if(ws.readyState===1){if(ws.bufferedAmount>2000000)ws.close(1013);else ws.send(body);}}
  if(now-lastSaved>5000){db.set('engine',market.export());lastSaved=now;}
  for(const [key,value] of attempts)if(now-value.start>900000)attempts.delete(key);
  if(!pushReady||busy)return;busy=true;
  try{for(const item of db.due()){
    const sub=db.subscriptions().find(s=>s.endpoint===item.endpoint);if(!sub){db.done(item.id);continue;}
    const e=JSON.parse(item.body);const labels={formed:'entsteht',confirmed:'bestätigt',invalidated:'ungültig',expired:'abgelaufen',completed:'Ziel erreicht'};
    const body={title:`${e.rule==='R1'?'Regel 1':e.rule==='R2'?'Regel 2':e.rule} · ${e.direction} · ${labels[e.state]}`,body:`${e.tf}m · Entry ${e.entry.join(' bis ')} · Stop ${e.stop.join(' bis ')}. ${e.cautions?.join(' ')||e.reason}`,url:'/?signal='+encodeURIComponent(e.eventId),tag:e.eventId};
    try{await webpush.sendNotification(sub,JSON.stringify(body),{TTL:45,urgency:'high',timeout:8000});db.done(item.id);db.set('pushStatus',{time:now,ok:true});}
    catch(err){if([404,410].includes(err.statusCode))db.unsubscribe(item.endpoint);else db.retry(item.id);db.set('pushStatus',{time:now,ok:false,status:err.statusCode||0});}
  }}finally{busy=false;}
},1000);
server.listen(port,'0.0.0.0',()=>console.log(`BTC Glass Desk läuft auf Port ${port}. Öffentliche Kraken Daten, keine Kontofunktionen.`));
market.start();
let shuttingDown=false;function shutdown(){if(shuttingDown)return;shuttingDown=true;clearInterval(timer);market.stop();db.set('engine',market.export());for(const ws of wss.clients)ws.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

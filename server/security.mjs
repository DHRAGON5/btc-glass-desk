import {createHmac,createHash,timingSafeEqual,randomBytes} from 'node:crypto';
export function constantEqual(a,b){return timingSafeEqual(createHash('sha256').update(String(a)).digest(),createHash('sha256').update(String(b)).digest());}
export function issueSession(secret,now=Date.now()){const data=Buffer.from(JSON.stringify({exp:now+30*86400000,nonce:randomBytes(16).toString('hex')})).toString('base64url');return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');}
export function verifySession(token,secret,now=Date.now()){try{const [data,sig]=token.split('.');return constantEqual(sig,createHmac('sha256',secret).update(data).digest('base64url'))&&JSON.parse(Buffer.from(data,'base64url')).exp>now;}catch{return false;}}
export function cookieToken(header=''){return header.split(';').map(x=>x.trim()).find(x=>x.startsWith('desk_session='))?.slice(13)||'';}
export function validateSubscription(sub){
  if(!sub||typeof sub.endpoint!=='string'||sub.endpoint.length>3000)throw Error('Ungültiges Push Abonnement');
  const url=new URL(sub.endpoint);const host=url.hostname;
  const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||/^updates\.push\.services\.mozilla\.com$/.test(host)||host==='web.push.apple.com'||host.endsWith('.push.apple.com');
  if(url.protocol!=='https:'||!allowed||url.username||url.password||url.port)throw Error('Push Anbieter nicht zugelassen');
  if(!/^[A-Za-z0-9_\-=]{80,100}$/.test(sub.keys?.p256dh||'')||!/^[A-Za-z0-9_\-=]{20,30}$/.test(sub.keys?.auth||''))throw Error('Ungültiger Push Schlüssel');
  return {endpoint:sub.endpoint,expirationTime:sub.expirationTime??null,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}};
}

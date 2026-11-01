import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:net';import {WebSocket} from 'ws';
test('HTTP und Stream: Anmeldung, Schutz, Einstellungen, Push Validierung und Journal',async()=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://localhost:${port}`,dir=mkdtempSync(join(tmpdir(),'desk-http-')),password='integration-test-password-only';
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:origin,APP_PASSWORD:password,SESSION_SECRET:'integration-test-secret-'.repeat(3),DATA_DIR:dir,VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:'',NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',x=>errors+=x);const exit=new Promise(r=>child.once('exit',r));
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Serverstart: '+errors)),5000);child.stdout.on('data',x=>{if(String(x).includes('läuft auf Port')){clearTimeout(timer);resolve();}});child.on('error',reject);});
  const call=(path,opts={})=>fetch(origin+path,opts);
  assert.equal((await call('/api/health')).status,200);assert.equal((await call('/api/state')).status,401);
  assert.equal((await call('/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({password})})).status,403);
  const login=await call('/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
  const state=await (await call('/api/state',{headers})).json();assert.equal(state.mode,'server');assert.equal(state.agents.length,6);
  const result=await call('/api/settings',{method:'PUT',headers,body:JSON.stringify({...state.settings,feeBps:8})});assert.equal(result.status,200);assert.equal((await result.json()).settings.feeBps,8);
  assert.equal((await call('/api/settings',{method:'PUT',headers,body:JSON.stringify({feeBps:-2})})).status,400);
  assert.equal((await call('/api/push/subscribe',{method:'POST',headers,body:JSON.stringify({endpoint:'http://127.0.0.1'})})).status,400);
  const received=await new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://localhost:${port}/stream`,{headers:{Cookie:cookie,Origin:origin}});const timeout=setTimeout(()=>{ws.terminate();reject(Error('Stream timeout'));},4000);ws.on('message',x=>{clearTimeout(timeout);ws.close();resolve(JSON.parse(String(x)));});ws.on('error',reject);});assert.equal(received.mode,'server');
  const unauth=await new Promise(resolve=>{const ws=new WebSocket(`ws://localhost:${port}/stream`,{headers:{Origin:origin}});ws.on('unexpected-response',(_req,res)=>{resolve(res.statusCode);res.resume();ws.terminate();});ws.on('error',()=>{});});assert.equal(unauth,401);
 }finally{child.kill('SIGTERM');await exit;rmSync(dir,{recursive:true,force:true});}
});

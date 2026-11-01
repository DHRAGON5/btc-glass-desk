import test from 'node:test';
import assert from 'node:assert/strict';
import {EdgeAnalyst} from '../core/edge.mjs';
import {DEFAULTS,validateSettings,settingsFor} from '../core/engine.mjs';
import {Market} from '../core/market.mjs';

const settings=validateSettings({...DEFAULTS,feeBps:4,slippageBps:1});
const signal=(id='signal')=>({id,eventId:`${id}:confirmed`,state:'confirmed',rule:'R2',tf:5,direction:'Long',created:0,updated:0,eventTime:300,entry:[99,101],stop:[94,95],target:110,netRR:2.4});

test('Edge Analyst bewertet erst den nächsten Kerzenopen und erkennt das Ziel',()=>{
  const edge=new EdgeAnalyst();edge.register(signal(),settings);
  edge.observeCandle(5,{time:300,open:100,high:111,low:98,close:109});
  assert.equal(edge.records[0].status,'win');
  assert.equal(edge.records[0].resultR,2.4);
  assert.equal(edge.summary().sample,1);
  assert.equal(edge.summary().ready,false);
});

test('Stop und Ziel in derselben OHLC Kerze werden nicht erfunden',()=>{
  const edge=new EdgeAnalyst();edge.register(signal(),settings);
  edge.observeCandle(5,{time:300,open:100,high:111,low:94,close:105});
  assert.equal(edge.records[0].status,'ambiguous');
  assert.equal(edge.summary().sample,0);
});

test('10.000 Bayes Szenarien sind reproduzierbar und erst ab 30 Ergebnissen freigegeben',()=>{
  const records=Array.from({length:30},(_,i)=>({signalId:`s${i}`,rule:'R1',tf:5,direction:'Long',status:i<14?'win':'loss',resultR:i<14?2:-1}));
  const a=new EdgeAnalyst({records}),b=new EdgeAnalyst({records});
  assert.equal(a.summary().simulations,10000);
  assert.equal(a.summary().ready,true);
  assert.deepEqual(a.summary(),b.summary());
  assert.ok(a.summary().winRateLow<a.summary().winRateHigh);
});

test('5 Minuten und 15 Minuten besitzen unabhängige Profile',()=>{
  const value=validateSettings({profiles:{5:{rangeBars:20,fvgLife:18},15:{rangeBars:40,fvgLife:60}}});
  assert.equal(settingsFor(value,5).rangeBars,20);
  assert.equal(settingsFor(value,15).rangeBars,40);
  assert.equal(settingsFor(value,5).fvgLife,18);
  assert.equal(settingsFor(value,15).fvgLife,60);
});

test('1 Minute wird geladen, besitzt aber keine Analyse Engine',()=>{
  const market=new Market();
  assert.ok(Array.isArray(market.frames[1]));
  assert.equal(market.engines[1],undefined);
});

test('Parameteränderungen vermischen keine Strategieversionen',()=>{
  const edge=new EdgeAnalyst();
  edge.register(signal('old'),settings);
  edge.observeCandle(5,{time:300,open:100,high:111,low:98,close:109});
  assert.equal(edge.summaryCurrent(settings).sample,1);
  const changed=validateSettings({...settings,profiles:{...settings.profiles,5:{...settings.profiles[5],fvgMinAtr:.33}}});
  assert.equal(edge.summaryCurrent(changed).sample,0);
  assert.equal(edge.records.length,1);
});

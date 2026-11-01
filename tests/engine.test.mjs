import test from 'node:test';import assert from 'node:assert/strict';
import {Engine,DEFAULTS,validateSettings,validCandle} from '../core/engine.mjs';
const start=1700000100;
const bar=(i,{open=105,high=108,low=102,close=105,volume=10}={})=>({time:start+i*300,open,high,low,close,volume});
function warm(settings={}){const e=new Engine(5,{...DEFAULTS,...settings});for(let i=0;i<30;i++)e.step(bar(i));e.range={id:start,direction:'Long',boundary:100,high:110,low:100,created:bar(29).time,atr:4,long:{count:0,ready:true,extreme:100},short:{count:0,ready:true,extreme:110}};e.zones=[];return e;}
const ctx={healthy:true,spreadBps:1,flow:2};
function extremeWarm(direction='Long'){
 const e=new Engine(5,DEFAULTS);
 for(let i=0;i<288;i++)e.step(bar(i,{open:105,high:i===265?110:108,low:i===264?100:102,close:105}));
 return e;
}
test('Regel 1: neues 24 Stunden Tief, drei separate Abweisungen und Gegenreaktion',()=>{
 const e=extremeWarm();let out=[];
 out.push(...e.step(bar(288,{open:102,high:103,low:98.5,close:101}),ctx));
 for(const i of [290,292]){out.push(...e.step(bar(i-1,{open:105,high:107,low:104,close:106}),ctx));out.push(...e.step(bar(i,{open:102,high:103,low:98,close:101}),ctx));}
 assert.equal(out.filter(x=>x.rule==='R1'&&x.state==='formed').length,1);
 assert.equal(out.filter(x=>x.rule==='R1'&&x.state==='confirmed').length,0);
 out=e.step(bar(293,{open:102,high:107,low:101,close:106}),ctx);
 assert.equal(out.find(x=>x.rule==='R1'&&x.state==='confirmed')?.direction,'Long');
 assert.equal(out.find(x=>x.rule==='R1')?.target,110);
 assert.deepEqual(e.step(bar(293),ctx),[]);
});
test('Regel 1: aneinanderliegende Tests zählen nicht dreifach',()=>{const e=extremeWarm();for(let i=288;i<292;i++)e.step(bar(i,{open:102,high:103,low:98,close:101}),ctx);assert.equal(e.range.long.count,1);assert.equal(e.setups.filter(x=>x.rule==='R1').length,0);});
test('Regel 1: ohne neues 24 Stunden Extrem entsteht kein Kandidat',()=>{const e=extremeWarm();e.step(bar(288,{open:105,high:107,low:101,close:104}),ctx);assert.equal(e.range,null);assert.equal(e.setups.length,0);});
test('Regel 1: Short am 24 Stunden Hoch ist spiegelbildlich',()=>{const e=extremeWarm('Short');let out=[];out.push(...e.step(bar(288,{open:108,high:111.5,low:107,close:109}),ctx));for(const i of [290,292]){e.step(bar(i-1,{open:105,high:106,low:103,close:104}),ctx);out.push(...e.step(bar(i,{open:108,high:112,low:107,close:109}),ctx));}out=e.step(bar(293,{open:108,high:109,low:103,close:104}),{...ctx,flow:-1});assert.equal(out.find(x=>x.rule==='R1'&&x.state==='confirmed')?.direction,'Short');});
test('Regel 2 und Zusatzsetups bleiben im kontrollierten Neustart gesperrt',()=>{const settings=validateSettings({agents:{fvg:true},optionalSweep:true,optionalVwap:true});assert.equal(settings.agents.fvg,false);assert.equal(settings.optionalSweep,false);assert.equal(settings.optionalVwap,false);});
test('Datenlücke invalidiert aktive Setups und verwirft Zonen',()=>{const e=warm();e.setups=[{id:'x',state:'formed',direction:'Long',stop:[98,99],updated:bar(29).time}];e.zones=[{id:1}];const out=e.step(bar(33),ctx);assert.equal(out[0].state,'invalidated');assert.equal(e.bars.length,1);assert.equal(e.zones.length,0);});
test('Snapshot setzt Erkennung ohne doppelte Ereignisse fort',()=>{const e=warm();const restored=new Engine(5,e.settings,e.export());assert.deepEqual(restored.step(bar(30),ctx),e.step(bar(30),ctx));assert.deepEqual(restored.step(bar(30),ctx),[]);});
test('Invalidation nach Stopkontakt und Ablauf nach Zeitfenster',()=>{const e=warm();e.settings.agents.range=false;e.settings.agents.fvg=false;e.setups=[{id:'x',state:'confirmed',direction:'Long',stop:[99,100],created:bar(29).time,updated:bar(29).time,_emitted:true}];const out=e.step(bar(30,{open:105,low:99,high:107,close:102}),ctx);assert.equal(out[0].state,'invalidated');const f=warm();f.settings.agents.range=false;f.settings.agents.fvg=false;f.setups=[{id:'y',state:'formed',direction:'Long',stop:[90,91],created:bar(26).time,updated:bar(26).time,_emitted:true}];assert.equal(f.step(bar(30),ctx)[0].state,'expired');});
test('Keine Zukunft: jedes Präfix liefert dieselben bis dahin bekannten Ereignisse',()=>{const a=warm(),b=warm();const rows=Array.from({length:40},(_,i)=>bar(i+30,{open:105,high:108+i%4,low:100+i%3,close:105+i%2}));const prefix=rows.slice(0,20).flatMap(c=>a.step(c,ctx));const full=rows.flatMap(c=>b.step(c,ctx));assert.deepEqual(full.filter(e=>e.eventTime<=rows[19].time+300),prefix);});
test('Schutzmodule sind nicht abschaltbar und Parameter werden geprüft',()=>{assert.equal(validateSettings({agents:{risk:false,quality:false}}).agents.risk,true);assert.throws(()=>validateSettings({feeBps:-1}));assert.throws(()=>validateSettings({rangeBars:24.5}));assert.equal(validCandle(bar(1,{low:110})),false);});

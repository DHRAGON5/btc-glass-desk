import {readFileSync,writeFileSync} from 'node:fs';
import {Engine,DEFAULTS,validCandle,validateSettings,settingsFor} from '../core/engine.mjs';
const args=process.argv.slice(2),file=args[0];
if(!file||file.startsWith('--')){console.log('Aufruf: npm run backtest -- candles.csv --tf 5 --fee-bps 40 --slippage-bps 2 --out result.json');process.exit(0);}
const option=(k,fallback)=>{const i=args.indexOf(k);return i>=0?args[i+1]:fallback;};
const tf=Number(option('--tf',5));if(![5,15].includes(tf))throw Error('tf muss 5 oder 15 sein');
const allSettings=validateSettings({...DEFAULTS,feeBps:Number(option('--fee-bps',40)),slippageBps:Number(option('--slippage-bps',2))}),settings=settingsFor(allSettings,tf);
const lines=readFileSync(file,'utf8').trim().split(/\r?\n/),headers=lines.shift().split(',').map(x=>x.trim());
const expected=['time','open','high','low','close','volume'];if(!expected.every(k=>headers.includes(k)))throw Error('CSV benötigt time,open,high,low,close,volume');
const bars=lines.filter(Boolean).map((line,i)=>{const values=line.split(',');const c=Object.fromEntries(headers.map((h,j)=>[h,Number(values[j])]));if(!validCandle(c))throw Error(`Ungültige Kerze in Zeile ${i+2}`);return c;});
for(let i=1;i<bars.length;i++)if(bars[i].time<=bars[i-1].time)throw Error('CSV muss aufsteigend sortiert sein, ohne Duplikate');
const engine=new Engine(tf,settings),events=[],trades=[];let position=null,pending=null,skipped=0;
function close(c,raw,reason){const sign=position.direction==='Long'?1:-1,exit=raw*(1-sign*settings.slippageBps/10000),fees=(position.entry+exit)*settings.feeBps/10000*position.qty,pnl=(exit-position.entry)*sign*position.qty-fees;trades.push({...position,exit,exitTime:c.time,reason,fees,pnl});position=null;}
for(let i=0;i<bars.length;i++){
 const c=bars[i];
 // A confirmed close can only be filled at the NEXT candle open. One position at a time.
 if(pending&&!position){const e=pending;pending=null;const sign=e.direction==='Long'?1:-1,entry=c.open*(1+sign*settings.slippageBps/10000),stop=sign===1?e.stop[1]:e.stop[0];
   if(c.time!==e.eventTime||entry<e.entry[0]||entry>e.entry[1]||(entry-stop)*sign<=0||(e.target-entry)*sign<=0){skipped++;}
   else{const totalRisk=Math.abs(entry-stop)+entry*(2*settings.feeBps+settings.slippageBps)/10000;position={id:e.id,rule:e.rule,direction:e.direction,entry,entryTime:c.time,stop,target:e.target,qty:settings.riskUsd/totalRisk,entryIndex:i};}
 }
 if(position){const long=position.direction==='Long',stopHit=long?c.low<=position.stop:c.high>=position.stop,targetHit=long?c.high>=position.target:c.low<=position.target;
   // When both levels occur in one OHLC bar, assume the stop happened first.
   if(stopHit)close(c,long?Math.min(c.open,position.stop):Math.max(c.open,position.stop),'stop');
   else if(targetHit)close(c,position.target,'target');
   else if(i-position.entryIndex>=6)close(c,c.close,'timeout');
 }
 const current=engine.step(c,{healthy:true,spreadBps:0});events.push(...current);
 const confirmed=current.find(e=>e.state==='confirmed'&&['R1','R2'].includes(e.rule));
 if(confirmed&&!position&&!pending){if(confirmed.netRR>=settings.minRR)pending=confirmed;else skipped++;}
}
if(position)close(bars.at(-1),bars.at(-1).close,'end_of_data');
const wins=trades.filter(t=>t.pnl>0),loss=trades.filter(t=>t.pnl<=0);let equity=0,peak=0,maxDrawdown=0;for(const t of trades){equity+=t.pnl;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
const result={disclaimer:'OHLC Simulation. Keine Echtzeit Orderflow Daten, kein Spread Replay, keine Aussage über künftige Rendite.',assumptions:{tf,settings,fill:'next_open_inside_entry_zone',sameBar:'stop_first',holdBars:6,onePosition:true},summary:{candles:bars.length,signals:events.filter(e=>e.state==='confirmed').length,trades:trades.length,skipped,winRate:trades.length?wins.length/trades.length:null,netPnl:equity,maxDrawdown,profitFactor:loss.length?wins.reduce((s,t)=>s+t.pnl,0)/Math.abs(loss.reduce((s,t)=>s+t.pnl,0)):null},trades,events};
const out=option('--out','backtest_result.json');writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({output:out,...result.summary},null,2));

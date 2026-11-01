// Pure, causal setup detector. Only completed candles may enter step().
export const PROFILE_DEFAULTS = Object.freeze({
  rangeBars:24, rangeMaxAtr:6, rangeMaxDrift:0.4, touchAtr:0.12,
  resetAtr:0.6, rangeLife:48, confirmBars:3, fvgMinAtr:0.12,
  fvgLife:36, stopAtr:0.25, entryAtr:0.15, minRR:2, targetRR:3, maxSpreadBps:5
});
export const DEFAULTS = Object.freeze({
  profiles:{5:{...PROFILE_DEFAULTS},15:{...PROFILE_DEFAULTS}},
  feeBps:5, slippageBps:2, riskUsd:25, optionalSweep:false, optionalVwap:false,
  agents:{range:true,news:true,liquidity:true,risk:true,quality:true,edge:true,fvg:false,flow:true}
});
export const AGENTS = [
  ['range','Regel 1 Wächter','24 Stunden Extrem, drei Abweisungen und Bestätigung'],
  ['news','News Agent','Relevante Bitcoin Ereignisse mit Quelle und Marktwirkung'],
  ['liquidity','Liquiditäts Agent','Sichtbare Kraken Tiefe und große Preislevel'],
  ['risk','Risiko Agent','Stopbereich, Gebühren, Spread und erreichbares CRV'],
  ['quality','Datenwächter','Alter, Lücken und Integrität der Marktdaten'],
  ['edge','Edge Analyst','Wertet Signalresultate mit 10.000 Bayes Szenarien aus']
];
export const mean = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
export function atr(a,n=14){const x=a.slice(-n-1); return mean(x.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-x[i].close),Math.abs(c.low-x[i].close))));}
export function ema(a,n){if(!a.length)return 0;let v=a[0].close;for(const c of a.slice(1))v=c.close*2/(n+1)+v*(1-2/(n+1));return v;}
export function validCandle(c){return c && ['time','open','high','low','close','volume'].every(k=>Number.isFinite(c[k])) && c.time>0 && c.low>0 && c.volume>=0 && c.high>=Math.max(c.open,c.close) && c.low<=Math.min(c.open,c.close);}
export function validateSettings(input={}){
  const s=structuredClone(DEFAULTS);
  const profileLimits={rangeBars:[12,96],rangeMaxAtr:[2,12],rangeMaxDrift:[0.05,0.8],touchAtr:[0.02,0.5],resetAtr:[0.2,2],rangeLife:[12,120],confirmBars:[1,8],fvgMinAtr:[0.02,1],fvgLife:[6,120],stopAtr:[0.05,2],entryAtr:[0.01,1],minRR:[1,5],targetRR:[1,8],maxSpreadBps:[0.1,50]};
  const globalLimits={feeBps:[0,100],slippageBps:[0,50],riskUsd:[1,5000]};
  for(const [key,[lo,hi]] of Object.entries(globalLimits)){if(input[key]!==undefined){const v=Number(input[key]);if(!Number.isFinite(v)||v<lo||v>hi)throw Error(`Ungültige Einstellung: ${key}`);s[key]=v;}}
  for(const tf of [5,15])for(const [key,[lo,hi]] of Object.entries(profileLimits)){
    const raw=input.profiles?.[tf]?.[key]??input.profiles?.[String(tf)]?.[key]??input[key];
    if(raw!==undefined){const v=Number(raw);if(!Number.isFinite(v)||v<lo||v>hi)throw Error(`Ungültige Einstellung: ${tf}m ${key}`);s.profiles[tf][key]=v;}
  }
  for(const tf of [5,15])for(const k of ['rangeBars','rangeLife','confirmBars','fvgLife'])if(!Number.isInteger(s.profiles[tf][k]))throw Error(`${tf}m ${k} muss ganzzahlig sein`);
  for(const k of ['optionalSweep','optionalVwap'])if(input[k]!==undefined&&typeof input[k]!=='boolean')throw Error(`Ungültig: ${k}`);
  for(const [key] of AGENTS)if(typeof input.agents?.[key]==='boolean')s.agents[key]=input.agents[key];
  // Kontrollierter Neustart: Nur Regel 1 erzeugt Signale. Regel 2 und Zusatzsetups
  // bleiben gesperrt, bis ihre Regeln an echten Chartbeispielen neu kalibriert sind.
  s.optionalSweep=false;s.optionalVwap=false;s.agents.fvg=false;
  s.agents.risk=s.agents.quality=s.agents.edge=true;return s;
}
export function settingsFor(input,tf){const s=input?.profiles?input:validateSettings(input);return {...s,...structuredClone(s.profiles?.[tf]||s.profiles?.[String(tf)]||PROFILE_DEFAULTS)};}
const round = v=>Math.round(v*100)/100;
export class Engine {
  constructor(tf=5,settings=DEFAULTS,snapshot){this.tf=tf;this.settings=settingsFor(settings,tf);this.bars=[];this.range=null;this.zones=[];this.setups=[];this.lastTime=0;if(snapshot?.version===4)Object.assign(this,snapshot,{settings:this.settings});}
  export(){return {version:4,tf:this.tf,bars:this.bars,range:this.range,zones:this.zones,setups:this.setups,lastTime:this.lastTime};}
  observePrice(price,epoch,context={}){
    if(!Number.isFinite(price)||!context.healthy)return [];
    const events=[];
    for(const z of this.setups.filter(z=>!z.historical&&['formed','confirmed'].includes(z.state))){
      if(z.direction==='Long'?price<=z.stop[1]:price>=z.stop[0])this.change(z,'invalidated',{time:epoch},'Live Kurs erreicht den strukturellen Stopbereich',events,context);
    }
    return events.map(e=>({...e,eventTime:epoch,intrabar:true}));
  }
  step(c,context={}){
    if(!validCandle(c)||c.time<=this.lastTime)return [];
    const events=[];const s=this.settings;const prev=this.bars.at(-1);
    // A discontinuity invalidates all active setups, rather than inventing candles.
    if(prev&&c.time-prev.time!==this.tf*60){
      for(const z of this.setups.filter(x=>!['invalidated','expired','completed'].includes(x.state)))this.change(z,'invalidated',c,'Datenlücke zwischen Kerzen',events);
      this.range=null;this.zones=[];this.bars=[];
    }
    this.lastTime=c.time;this.bars.push(c);this.bars=this.bars.slice(-400);
    const a=Math.max(atr(this.bars),c.close*0.00001);
    for(const z of this.setups.filter(x=>['formed','confirmed'].includes(x.state))){
      if(c.time===z.updated)continue;
      const hit=z.direction==='Long'?c.low<=z.stop[1]:c.high>=z.stop[0];
      if(hit)this.change(z,'invalidated',c,'Struktureller Stopbereich erreicht',events);
      else if(z.state==='confirmed'&&Number.isFinite(z.target)&&(z.direction==='Long'?c.high>=z.target:c.low<=z.target))this.change(z,'completed',c,'Gegenbewegung erreicht die gegenüberliegende Range Grenze',events,context);
      else if(c.time-z.updated>(z.state==='confirmed'?6:s.confirmBars)*this.tf*60)this.change(z,'expired',c,'Zeitfenster abgelaufen',events);
    }
    const dayBars=Math.round(24*60/this.tf);
    if(this.bars.length<Math.max(28,s.rangeBars+1,dayBars+1))return events;
    if(s.agents.range)this.rangeStep(c,a,events,context);
    if(s.agents.fvg)this.fvgStep(c,a,events,context);
    if(s.optionalSweep&&s.agents.structure)this.sweepStep(c,a,events,context);
    if(s.optionalVwap&&s.agents.volume)this.vwapStep(c,a,events,context);
    this.setups=this.setups.filter(z=>['formed','confirmed'].includes(z.state)||c.time-z.updated<12*this.tf*60).slice(-80);
    return events;
  }
  make(rule,direction,c,a,lo,hi,stop,reason,key,context,extra={}){
    const z={id:`${this.tf}:${rule}:${key}:${direction}`,rule,direction,tf:this.tf,state:'formed',created:c.time,updated:c.time,entry:[round(lo),round(hi)],stop:[round(stop-a*0.1),round(stop+a*0.1)],reason,...extra};
    if(this.setups.some(x=>x.id===z.id))return null;
    this.setups.push(z);return z;
  }
  change(z,state,c,reason,events,context={}){
    if(z.state===state&&z._emitted)return;
    z.state=state;z.updated=c.time;z.reason=reason;z._emitted=true;
    if(state==='confirmed'){
      const a=atr(this.bars);z.entry=[round(c.close-a*this.settings.entryAtr),round(c.close+a*this.settings.entryAtr)];
      const entry=c.close, stop=z.direction==='Long'?z.stop[1]:z.stop[0];
      const risk=Math.abs(entry-stop);const costs=entry*(2*this.settings.feeBps+2*this.settings.slippageBps)/10000;
      const target=z.target??entry+(z.direction==='Long'?1:-1)*risk*this.settings.targetRR;
      const reward=(target-entry)*(z.direction==='Long'?1:-1);
      z.target=round(target);z.grossRR=round(reward/Math.max(risk,0.01));z.netRR=round((reward-costs)/(risk+costs));
      z.sizeBtc=Number((this.settings.riskUsd/(risk+costs)).toFixed(6));
      z.cautions=[];
      if(z.netRR<this.settings.minRR)z.cautions.push(`Netto CRV ${z.netRR} liegt unter ${this.settings.minRR}. Gebühren prüfen.`);
      if(reward/Math.max(entry,0.01)<0.004)z.cautions.push('Zielabstand liegt unter 0,4 Prozent. Kein Entry.');
      if(context.spreadBps>this.settings.maxSpreadBps)z.cautions.push('Spread über dem Grenzwert');
      if(!context.healthy)z.cautions.push('Live Daten nicht vollständig geprüft');
      z.actionable=z.cautions.length===0;
    }
    events.push({...structuredClone(z),eventId:`${z.id}:${state}:${c.time}`,eventTime:c.time+this.tf*60});
  }
  rangeStep(c,a,events,context){
    const s=this.settings;
    if(!this.range){
      const dayBars=Math.round(24*60/this.tf),day=this.bars.slice(-dayBars-1,-1),w=day.slice(-s.rangeBars);
      if(day.length<dayBars||w.length<s.rangeBars)return;
      const dayHigh=Math.max(...day.map(x=>x.high)),dayLow=Math.min(...day.map(x=>x.low));
      const high=Math.max(...w.map(x=>x.high)),low=Math.min(...w.map(x=>x.low)),width=high-low;
      const drift=Math.abs(w.at(-1).close-w[0].close),sideways=width>=a*1.5&&width<=a*s.rangeMaxAtr&&drift<=width*s.rangeMaxDrift;
      if(!sideways)return;
      const tolerance=a*s.touchAtr;
      const lowIsDayExtreme=Math.abs(low-dayLow)<=tolerance,highIsDayExtreme=Math.abs(high-dayHigh)<=tolerance;
      const longFail=lowIsDayExtreme&&c.low<dayLow-tolerance&&c.close>=dayLow;
      const shortFail=highIsDayExtreme&&c.high>dayHigh+tolerance&&c.close<=dayHigh;
      if(!longFail&&!shortFail)return;
      const direction=longFail&&shortFail?(dayLow-c.low>=c.high-dayHigh?'Long':'Short'):longFail?'Long':'Short';
      const boundary=direction==='Long'?dayLow:dayHigh,extreme=direction==='Long'?c.low:c.high;
      this.range={id:`${w[0].time}:${direction}`,direction,boundary,high,low,dayHigh,dayLow,created:c.time,atr:a,
        long:{count:direction==='Long'?1:0,ready:false,extreme:direction==='Long'?extreme:low},
        short:{count:direction==='Short'?1:0,ready:false,extreme:direction==='Short'?extreme:high}};
      return;
    }
    const r=this.range;if(!r)return;
    const outside=r.direction==='Long'?c.close<r.boundary-r.atr*s.touchAtr||c.close>r.high+r.atr*s.touchAtr:c.close>r.boundary+r.atr*s.touchAtr||c.close<r.low-r.atr*s.touchAtr;
    if(outside||c.time-r.created>s.rangeLife*this.tf*60){
      for(const z of this.setups.filter(z=>z.rule==='R1'&&z.rangeId===r.id&&['formed','confirmed'].includes(z.state)))this.change(z,'invalidated',c,'Range verlassen oder Zeitfenster abgelaufen',events);
      this.range=null;return;
    }
    const dir=r.direction,p=dir==='Long'?r.long:r.short,edge=r.boundary;
    const fail=dir==='Long'?c.low<edge-r.atr*s.touchAtr&&c.close>=edge:c.high>edge+r.atr*s.touchAtr&&c.close<=edge;
    const reset=dir==='Long'?c.low>edge+r.atr*s.resetAtr:c.high<edge-r.atr*s.resetAtr;
    if(!p.ready&&reset)p.ready=true;
    if(fail&&p.ready&&p.count<3){
      p.count++;p.ready=false;p.extreme=dir==='Long'?Math.min(p.extreme,c.low):Math.max(p.extreme,c.high);
      if(p.count===3){
        const stop=p.extreme+(dir==='Long'?-1:1)*r.atr*s.stopAtr;
        const z=this.make('R1',dir,c,a,edge-a*s.entryAtr,edge+a*s.entryAtr,stop,'24 Stunden Extrem mit drei getrennten Fehlausbrüchen',r.id,context,{rangeId:r.id,trigger:dir==='Long'?c.high:c.low,target:dir==='Long'?r.high:r.low});
        if(z)this.change(z,'formed',c,z.reason,events);
      }
    }
    const z=this.setups.find(z=>z.rule==='R1'&&z.rangeId===r.id&&z.direction===dir&&z.state==='formed');
    if(z&&c.time>z.created&&(dir==='Long'?c.close>z.trigger:c.close<z.trigger))this.change(z,'confirmed',c,'Gegenreaktion schließt jenseits der dritten Abweisung',events,context);
  }
  fvgStep(c,a,events,context){
    const s=this.settings;
    for(const f of this.zones){const setup=this.setups.find(z=>z.id===f.setupId);if(setup&&['invalidated','expired','completed'].includes(setup.state))f.done=true;}
    const active=this.setups.find(z=>z.rule==='R2'&&['formed','confirmed'].includes(z.state));
    if(active){
      const reached=active.direction==='Long'?c.high>=active.target:c.low<=active.target;
      if(reached)this.change(active,'completed',c,'Gegenbewegung erreicht die andere FVG Grenze',events,context);
      return;
    }
    const left=this.bars.at(-3),mid=this.bars.at(-2);
    if(!left||mid.time-left.time!==this.tf*60||c.time-mid.time!==this.tf*60)return;
    const candleDirection=x=>x.close>x.open?'bullish':x.close<x.open?'bearish':'neutral';
    const direction=candleDirection(c);if(direction==='neutral'||candleDirection(left)!==direction||candleDirection(mid)!==direction)return;
    let run=0;for(let i=this.bars.length-1;i>=0&&candleDirection(this.bars[i])===direction;i--)run++;
    if(this.tf===5?(run<3||run>4):run!==3)return;
    const rising=left.close<mid.close&&mid.close<c.close&&left.high<mid.high&&mid.high<c.high&&left.low<mid.low&&mid.low<c.low;
    const falling=left.close>mid.close&&mid.close>c.close&&left.high>mid.high&&mid.high>c.high&&left.low>mid.low&&mid.low>c.low;
    const bullish=direction==='bullish'&&rising&&c.low-left.high>=a*s.fvgMinAtr;
    const bearish=direction==='bearish'&&falling&&left.low-c.high>=a*s.fvgMinAtr;
    if(!bullish&&!bearish)return;
    const move=bullish?c.high-left.low:left.high-c.low,middleBody=Math.abs(mid.close-mid.open);
    if(move<a*1.5||middleBody<a*.6)return;
    const low=bullish?left.high:c.high,high=bullish?c.low:left.low,setupDirection=bullish?'Short':'Long';
    const stop=bullish?Math.max(left.high,mid.high,c.high)+a*s.stopAtr:Math.min(left.low,mid.low,c.low)-a*s.stopAtr;
    const target=bullish?low:high,origin=bullish?'bullish':'bearish',f={id:c.time,created:c.time,low,high,origin,side:setupDirection,done:false,run};
    this.zones.push(f);this.zones=this.zones.slice(-40);
    const reason=`Starke ${bullish?'bullische':'bärische'} FVG aus ${run} Kerzen · ${setupDirection} Rücklauf zur anderen Grenze`;
    const z=this.make('R2',setupDirection,c,a,c.close-a*s.entryAtr,c.close+a*s.entryAtr,stop,reason,f.id,context,{fvgId:f.id,target,origin,impulseBars:run});
    if(z){f.setupId=z.id;this.change(z,'confirmed',c,reason,events,context);}
  }
  sweepStep(c,a,events,context){
    const w=this.bars.slice(-21,-1),low=Math.min(...w.map(x=>x.low)),high=Math.max(...w.map(x=>x.high));
    const dir=c.low<low&&c.close>low?'Long':c.high>high&&c.close<high?'Short':null;if(!dir)return;
    const z=this.make('SWEEP',dir,c,a,c.close-a*0.15,c.close+a*0.15,dir==='Long'?c.low-a*0.25:c.high+a*0.25,'20 Kerzen Extrem überschritten und zurückerobert',c.time,context);
    if(z){this.change(z,'formed',c,z.reason,events);this.change(z,'confirmed',c,z.reason,events,context);}
  }
  vwapStep(c,a,events,context){
    const day=Math.floor(c.time/86400),w=this.bars.filter(x=>Math.floor(x.time/86400)===day),p=this.bars.at(-2);if(w.length<12)return;
    const vol=w.reduce((s,x)=>s+x.volume,0);if(!vol)return;
    const v=w.reduce((s,x)=>s+(x.high+x.low+x.close)/3*x.volume,0)/vol;
    const dir=p.close<v&&c.close>v&&ema(this.bars,9)>ema(this.bars,26)?'Long':p.close>v&&c.close<v&&ema(this.bars,9)<ema(this.bars,26)?'Short':null;if(!dir)return;
    const z=this.make('VWAP',dir,c,a,c.close-a*0.15,c.close+a*0.15,dir==='Long'?Math.min(c.low,p.low)-a*0.25:Math.max(c.high,p.high)+a*0.25,'Session VWAP zurückerobert, EMA Richtung stimmt überein',c.time,context);
    if(z){this.change(z,'formed',c,z.reason,events);this.change(z,'confirmed',c,z.reason,events,context);}
  }
}
export function assessAgents(market,tf=5,now=Date.now()){
  const s=market.settings,e=market.engines[tf],p=e.settings,bars=e.bars,c=bars.at(-1),a=atr(bars),r=e.range,b=market.book.snapshot();
  const healthy=market.isHealthy(now),tr=market.recentTrades(now),flow=tr.reduce((v,t)=>v+(t.side==='buy'?t.qty:-t.qty),0),buy=tr.filter(t=>t.side==='buy').reduce((v,t)=>v+t.qty,0),volume=tr.reduce((v,t)=>v+t.qty,0);
  const imbalance=b.bids.slice(0,10).reduce((v,t)=>v+t.qty,0)/(b.bids.slice(0,10).reduce((v,t)=>v+t.qty,0)+b.asks.slice(0,10).reduce((v,t)=>v+t.qty,0)||1);
  const active=e.setups.filter(z=>!z.historical&&['formed','confirmed'].includes(z.state));const f=v=>Number.isFinite(v)?v.toFixed(2):'…';
  const swings=bars.slice(-10);const before=bars.slice(-20,-10);
  const structure=swings.length&&before.length?(Math.max(...swings.map(x=>x.high))>Math.max(...before.map(x=>x.high))&&Math.min(...swings.map(x=>x.low))>Math.min(...before.map(x=>x.low))?'Höhere Hochs und Tiefs':Math.max(...swings.map(x=>x.high))<Math.max(...before.map(x=>x.high))&&Math.min(...swings.map(x=>x.low))<Math.min(...before.map(x=>x.low))?'Tiefere Hochs und Tiefs':'Gemischte Struktur'):'Aufwärmphase';
  const edge=market.edge?.summaryCurrent(market.settings)||{sample:0,ready:false};
  const edgeText=edge.ready?`${edge.sample} Ergebnisse · ${edge.winRate} % positiv · Erwartung ${edge.expectancy} R · Edge Chance ${edge.positiveProbability} %`:`${edge.sample} von ${edge.minSample||30} Ergebnissen · noch keine belastbare Edge Aussage`;
  const activeFvg=e.setups.find(z=>z.rule==='R2'&&['formed','confirmed'].includes(z.state));
  const text={range:r?`${r.direction} Kandidat am 24h Extrem · ${r.direction==='Long'?r.long.count:r.short.count}/3 Abweisungen`:'Wartet auf neues 24h Hoch oder Tief mit Seitwärtsphase',news:'Lädt nur Ereignisse mit hoher Bitcoin Relevanz',liquidity:b.valid?`Top 10 Tiefe: ${f(imbalance*100)} % Kaufseite`:'Warte auf geprüftes Orderbuch',risk:`ATR ${f(a)} USD · ${s.feeBps} bp Gebühr je Seite · Netto CRV mindestens ${p.minRR}`,quality:healthy?'Kerzen, Trades und Orderbuch aktuell':market.problem||'Daten unvollständig oder veraltet',edge:edgeText};
  return AGENTS.map(([id,name,task])=>({id,name,task,enabled:s.agents[id],status:!s.agents[id]?'inactive':healthy?'active':'waiting',assessment:s.agents[id]?text[id]:'Modul pausiert',updatedAt:market.lastMessage||null}));
}

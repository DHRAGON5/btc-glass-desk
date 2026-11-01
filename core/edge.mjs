const SAMPLE_COUNT=10000,MIN_SAMPLE=30,MAX_RECORDS=2000,ALGORITHM_VERSION='2026-11-r1-24h-v1';
const round=(value,digits=2)=>Number(Number(value).toFixed(digits));

function hash(value){let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function randomFactory(seed){let x=seed||0x9e3779b9;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function normal(random){const u=Math.max(random(),1e-12),v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function gamma(shape,random){
  if(shape<1)return gamma(shape+1,random)*Math.pow(Math.max(random(),1e-12),1/shape);
  const d=shape-1/3,c=1/Math.sqrt(9*d);
  while(true){const x=normal(random),v=Math.pow(1+c*x,3);if(v<=0)continue;const u=random();if(u<1-.0331*x**4||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v;}
}
function beta(alpha,betaValue,random){const x=gamma(alpha,random),y=gamma(betaValue,random);return x/(x+y);}
function quantile(sorted,p){if(!sorted.length)return null;const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);}
function version(settings,tf){const profile=settings.profiles?.[tf]||settings.profiles?.[String(tf)]||{};return `v${hash(JSON.stringify({algorithm:ALGORITHM_VERSION,tf,profile,feeBps:settings.feeBps,slippageBps:settings.slippageBps})).toString(36)}`;}

export class EdgeAnalyst{
  constructor(saved={}){this.records=Array.isArray(saved?.records)?saved.records.slice(-MAX_RECORDS):[];this.revision=Number(saved?.revision)||0;this.cache=new Map();}
  export(){return {version:1,revision:this.revision,records:this.records.slice(-MAX_RECORDS)};}
  register(event,settings,{historical=false}={}){
    if(event.state!=='confirmed'||!['R1','R2'].includes(event.rule))return null;
    let record=this.records.find(x=>x.signalId===event.id);
    if(record)return record;
    const direction=event.direction,entryTime=event.eventTime;
    record={signalId:event.id,eventId:event.eventId,rule:event.rule,tf:event.tf,direction,created:event.created,confirmed:event.updated,entryTime,
      entryZone:[...event.entry],stop:[...event.stop],target:event.target,netRR:event.netRR,strategyVersion:version(settings,event.tf),source:historical?'history':'live',status:'waiting_entry',bars:0,
      feeBps:settings.feeBps,slippageBps:settings.slippageBps,updatedAt:Date.now()};
    this.records.push(record);this.records=this.records.slice(-MAX_RECORDS);this.touch();return record;
  }
  observeCandle(tf,c){
    let changed=false;
    for(const record of this.records.filter(x=>x.tf===tf&&['waiting_entry','active'].includes(x.status))){
      if(c.time<record.entryTime)continue;
      if(record.status==='waiting_entry'){
        if(c.time>record.entryTime){record.status='no_entry';record.closed=c.time;record.updatedAt=Date.now();changed=true;continue;}
        const sign=record.direction==='Long'?1:-1;
        const entry=c.open*(1+sign*record.slippageBps/10000),stop=sign===1?record.stop[1]:record.stop[0];
        if(entry<record.entryZone[0]||entry>record.entryZone[1]||(entry-stop)*sign<=0){record.status='no_entry';record.closed=c.time;record.updatedAt=Date.now();changed=true;continue;}
        record.entry=entry;record.activeAt=c.time;record.status='active';record.risk=Math.abs(entry-stop);changed=true;
      }
      if(record.status!=='active')continue;
      record.bars++;
      const long=record.direction==='Long',stop=long?record.stop[1]:record.stop[0],stopHit=long?c.low<=stop:c.high>=stop,targetHit=long?c.high>=record.target:c.low<=record.target;
      if(stopHit&&targetHit){this.finish(record,'ambiguous',null,c.time,'Stop und Ziel in derselben Kerze');changed=true;}
      else if(stopHit){this.finish(record,'loss',-1,c.time,'Stop zuerst erreicht');changed=true;}
      else if(targetHit){this.finish(record,'win',Number.isFinite(record.netRR)?record.netRR:3,c.time,'Ziel zuerst erreicht');changed=true;}
      else if(record.bars>=6){
        const sign=long?1:-1,costs=record.entry*(2*record.feeBps+2*record.slippageBps)/10000;
        const value=((c.close-record.entry)*sign-costs)/(record.risk+costs);
        this.finish(record,'timeout',round(value,3),c.time,'Nach sechs Kerzen beendet');changed=true;
      }
    }
    if(changed)this.touch();return changed;
  }
  finish(record,status,resultR,closed,reason){record.status=status;record.resultR=resultR;record.closed=closed;record.reason=reason;record.updatedAt=Date.now();}
  touch(){this.revision++;this.cache.clear();}
  matches(record,filter={}){return Object.entries(filter).every(([k,v])=>v===undefined||(k==='strategyVersions'&&Array.isArray(v)?v.includes(record.strategyVersion):record[k]===v));}
  evaluated(filter={}){return this.records.filter(record=>this.matches(record,filter)&&['win','loss','timeout'].includes(record.status)&&Number.isFinite(record.resultR));}
  summary(filter={}){
    const key=JSON.stringify([this.revision,filter]);if(this.cache.has(key))return this.cache.get(key);
    const candidates=this.records.filter(record=>this.matches(record,filter)),records=this.evaluated(filter),n=records.length,wins=records.filter(x=>x.resultR>0),losses=records.filter(x=>x.resultR<=0),values=records.map(x=>x.resultR);
    const base={sample:n,wins:wins.length,losses:losses.length,pending:candidates.filter(x=>['waiting_entry','active'].includes(x.status)).length,noEntry:candidates.filter(x=>x.status==='no_entry').length,ambiguous:candidates.filter(x=>x.status==='ambiguous').length,simulations:SAMPLE_COUNT,minSample:MIN_SAMPLE,ready:n>=MIN_SAMPLE};
    if(!n){const empty={...base,winRate:null,expectancy:null,profitFactor:null,positiveProbability:null,winRateLow:null,winRateHigh:null};this.cache.set(key,empty);return empty;}
    const random=randomFactory(hash(JSON.stringify(records.map(x=>[x.signalId,x.resultR])))),probabilities=[],expectancies=[];
    const winValues=wins.map(x=>x.resultR),lossValues=losses.map(x=>x.resultR);
    for(let i=0;i<SAMPLE_COUNT;i++){
      const p=beta(wins.length+.5,losses.length+.5,random);probabilities.push(p);
      const winR=winValues.length?winValues[Math.floor(random()*winValues.length)]:1;
      const lossR=lossValues.length?lossValues[Math.floor(random()*lossValues.length)]:-1;
      expectancies.push(p*winR+(1-p)*lossR);
    }
    probabilities.sort((a,b)=>a-b);expectancies.sort((a,b)=>a-b);
    const grossWin=wins.reduce((s,x)=>s+x.resultR,0),grossLoss=Math.abs(losses.reduce((s,x)=>s+x.resultR,0));
    const result={...base,winRate:round(wins.length/n*100,1),expectancy:round(values.reduce((a,b)=>a+b,0)/n,3),profitFactor:grossLoss?round(grossWin/grossLoss,2):null,
      positiveProbability:round(expectancies.filter(x=>x>0).length/SAMPLE_COUNT*100,1),winRateLow:round(quantile(probabilities,.05)*100,1),winRateHigh:round(quantile(probabilities,.95)*100,1),
      expectancyLow:round(quantile(expectancies,.05),3),expectancyHigh:round(quantile(expectancies,.95),3)};
    this.cache.set(key,result);return result;
  }
  estimate(event){
    const record=this.records.find(x=>x.signalId===event.id),strategyVersion=record?.strategyVersion;
    let filter={rule:event.rule,tf:event.tf,direction:event.direction,strategyVersion},summary=this.summary(filter);
    if(summary.sample<8){filter={rule:event.rule,tf:event.tf,strategyVersion};summary=this.summary(filter);}
    return {...summary,filter};
  }
  currentVersions(settings){return [5,15].map(tf=>version(settings,tf));}
  summaryCurrent(settings){return this.summary({strategyVersions:this.currentVersions(settings)});}
  snapshot(settings){
    const groups={};for(const rule of ['R1','R2'])for(const tf of [5,15])for(const direction of ['Long','Short'])groups[`${rule}:${tf}:${direction}`]=this.summary({rule,tf,direction,strategyVersion:version(settings,tf)});
    return {revision:this.revision,summary:this.summaryCurrent(settings),groups,records:this.records.slice(-500)};
  }
}

export const EDGE_SAMPLE_COUNT=SAMPLE_COUNT;

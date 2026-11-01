const ENDPOINT='/api/news';
const SOURCE_WEIGHT=new Map([
  ['Reuters',4],['Associated Press',4],['AP News',4],['Bloomberg',4],
  ['CoinDesk',3],['The Block',3],['Cointelegraph',2],['Decrypt',2]
]);
const HIGH=[
  ['hack',6,'Sicherheitsvorfall'],['exploit',6,'Sicherheitsvorfall'],['breach',6,'Sicherheitsvorfall'],
  ['withdrawal suspended',6,'Auszahlungen gestoppt'],['withdrawals paused',6,'Auszahlungen gestoppt'],
  ['etf outflow',5,'ETF Abfluss'],['etf inflow',4,'ETF Zufluss'],['liquidation',5,'Liquidationen'],
  ['fomc',4,'Notenbank'],['federal reserve',4,'Notenbank'],['cpi',4,'Inflation'],
  ['sec',3,'Regulierung'],['tariff',3,'Makrorisiko'],['war',4,'Geopolitik'],
  ['bankruptcy',5,'Insolvenz'],['insolvency',5,'Insolvenz'],['exchange',2,'Börsenrisiko']
];
const NEGATIVE=['hack','exploit','breach','stolen','theft','outflow','liquidation','suspended','paused','bankruptcy','selloff','falls','drops','decline','war'];
const POSITIVE=['inflow','approval','approved','adoption','reserve','buys','rally','surges','record high'];

function clean(value=''){return String(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function sourceName(item){let fallback='Unbekannte Quelle';try{fallback=new URL(item.url).hostname.replace(/^www\./,'');}catch{}return clean(item.source_info?.name||item.source||fallback);}
function safeUrl(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}}
function classify(item){
  const text=`${item.title||''} ${item.body||''}`.toLowerCase();
  if(!/(bitcoin|\bbtc\b)/i.test(text)&&!String(item.categories||'').toUpperCase().includes('BTC'))return null;
  let score=SOURCE_WEIGHT.get(sourceName(item))||0,topic='Bitcoin Markt';
  for(const [needle,points,label] of HIGH)if(text.includes(needle)){score+=points;if(points>=4)topic=label;}
  const negative=NEGATIVE.filter(x=>text.includes(x)).length,positive=POSITIVE.filter(x=>text.includes(x)).length;
  const direction=negative>positive?'Negativ':positive>negative?'Positiv':'Neutral';
  const level=score>=9?'SEHR HOCH':score>=6?'HOCH':score>=4?'MITTEL':'NIEDRIG';
  return {score,topic,direction,level};
}
function unique(items){const seen=new Set();return items.filter(item=>{const key=clean(item.title).toLowerCase().replace(/[^a-z0-9äöüß]+/g,' ').slice(0,90);if(seen.has(key))return false;seen.add(key);return true;});}

export class NewsAgent{
  constructor(onChange=()=>{}){this.onChange=onChange;this.items=[];this.status='idle';this.problem='';this.updatedAt=0;this.timer=null;}
  snapshot(){return {items:this.items,status:this.status,problem:this.problem,updatedAt:this.updatedAt};}
  async refresh(){
    if(this.status==='loading')return;
    this.status='loading';this.onChange(this.snapshot());
    try{
      const response=await fetch(ENDPOINT,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error(`News Quelle antwortet mit ${response.status}`);
      const json=await response.json();if(json.Message&&!(json.Data||[]).length)throw Error(json.Message);const cutoff=Date.now()/1000-48*3600;
      const firstLoad=this.updatedAt===0;
      const next=unique((json.Data||[]).filter(item=>Number(item.published_on)>=cutoff).map(item=>{
        const rating=classify(item);if(!rating||rating.score<4)return null;
        const url=safeUrl(item.url);if(!url)return null;
        return {id:String(item.id||item.guid||url),title:clean(item.title),summary:clean(item.body).slice(0,220),url,source:sourceName(item),publishedAt:Number(item.published_on)*1000,...rating};
      }).filter(Boolean).sort((a,b)=>b.score-a.score||b.publishedAt-a.publishedAt)).slice(0,12);
      const previous=new Set(this.items.map(x=>x.id));this.items=next;this.status='live';this.problem='';this.updatedAt=Date.now();
      if(!firstLoad)for(const item of next.filter(x=>!previous.has(x.id)&&x.level==='SEHR HOCH'))this.notify(item);
    }catch(error){this.status='error';this.problem=error.message||'News konnten nicht geladen werden';}
    this.onChange(this.snapshot());
  }
  notify(item){
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    try{new Notification(`BTC News · ${item.level}`,{body:`${item.topic}: ${item.title}`,tag:`btc-news-${item.id}`,icon:'/icons/icon-192.png'});}catch{}
  }
  start(){this.refresh();clearInterval(this.timer);this.timer=setInterval(()=>this.refresh(),5*60*1000);}
  stop(){clearInterval(this.timer);this.timer=null;}
}

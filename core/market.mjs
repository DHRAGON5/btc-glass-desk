import {Engine,DEFAULTS,validateSettings,assessAgents,validCandle,settingsFor} from './engine.mjs';
import {Book,parseWire} from './book.mjs';
import {EdgeAnalyst} from './edge.mjs';
export const WS_URL='wss://ws.kraken.com/v2';
export const REST_URL='https://api.kraken.com/0/public/OHLC';
export class Market {
  constructor({settings=DEFAULTS,onEvent=()=>{},onChange=()=>{},WebSocketImpl=globalThis.WebSocket,fetchImpl=globalThis.fetch,saved}={}){
    this.settings=validateSettings(settings);this.onEvent=onEvent;this.onChange=onChange;this.WS=WebSocketImpl;this.fetch=(...args)=>fetchImpl(...args);
    this.frames={1:[],5:[],15:[],60:[]};this.engines={5:new Engine(5,this.settings,saved?.engines?.[5]),15:new Engine(15,this.settings,saved?.engines?.[15])};this.edge=new EdgeAnalyst(saved?.edge);
    this.book=new Book(100);this.trades=[];this.tradeIds=new Set();this.ticker={};this.heat=[];this.events=[];this.status='connecting';this.problem='Verbindung wird aufgebaut';this.lastMessage=0;this.lastTrade=0;this.ohlcUpdated={};this.stopped=false;this.retry=0;this.generation=0;
  }
  closed(tf){return this.frames[tf].filter(c=>c.time+tf*60<=Date.now()/1000);}
  recentTrades(now=Date.now()){return this.trades.filter(t=>now-t.time<60000&&t.time<=now+2000);}
  isHealthy(now=Date.now()){
    return this.status==='live'&&now-this.lastMessage<10000&&this.book.valid&&now-this.book.updatedAt<10000&&now-this.lastTrade<30000&&[5,15,60].every(tf=>this.frames[tf].length>=30&&now-(this.ohlcUpdated[tf]||0)<30000&&this.frames[tf].at(-1).time+tf*60>now/1000-10);
  }
  context(){const b=this.book.snapshot(),bid=b.bids[0]?.price,ask=b.asks[0]?.price;return {healthy:this.isHealthy(),spreadBps:bid&&ask?(ask-bid)/bid*10000:Infinity,flow:this.settings.agents.flow?this.recentTrades().reduce((v,t)=>v+(t.side==='buy'?t.qty:-t.qty),0):undefined};}
  export(){return {engines:Object.fromEntries(Object.entries(this.engines).map(([k,e])=>[k,e.export()])),edge:this.edge.export()};}
  updateSettings(input){this.settings=validateSettings(input);for(const e of Object.values(this.engines)){e.settings=settingsFor(this.settings,e.tf);for(const z of e.setups){if((z.rule==='R1'&&!this.settings.agents.range)||(z.rule==='R2'&&!this.settings.agents.fvg)||(z.rule==='SWEEP'&&!this.settings.optionalSweep)||(z.rule==='VWAP'&&!this.settings.optionalVwap)){z.state='expired';z.reason='Modul deaktiviert';}}}this.onChange();}
  ingestCandle(tf,c,{historical=false}={}){
    if(!validCandle(c))return;
    let frame=this.frames[tf];const existing=frame.findIndex(x=>x.time===c.time);
    if(existing>=0)frame[existing]=c;else frame.push(c);
    frame.sort((a,b)=>a.time-b.time);this.frames[tf]=frame=frame.slice(-720);
    if(!historical)this.ohlcUpdated[tf]=Date.now();
    const engine=this.engines[tf];if(!engine)return;
    // Completion requires a subsequent exchange candle, never only a local clock.
    const last=frame.at(-1).time;
    for(const bar of frame){if(bar.time>=last||bar.time<=engine.lastTime)continue;
      this.edge.observeCandle(tf,bar);
      for(const event of engine.step(bar,this.context())){
        event.receivedAt=Date.now();event.historical=historical||Date.now()/1000-event.eventTime>30;
        const setup=engine.setups.find(z=>z.id===event.id);if(setup)setup.historical=event.historical;
        if(event.state==='confirmed'){
          this.edge.register(event,this.settings,{historical:event.historical});
          event.edgeEstimate=this.edge.estimate(event);
        }
        if(!event.historical){event.dataHealthy=this.isHealthy();this.events.unshift(event);this.events=this.events.slice(0,200);this.onEvent(event);}
      }
    }
  }
  async history(generation){
    for(const tf of [1,5,15,60]){
      const res=await this.fetch(`${REST_URL}?pair=XBTUSD&interval=${tf}`,{signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw Error(`Kraken Historie HTTP ${res.status}`);const json=await res.json();if(json.error?.length)throw Error(json.error.join(', '));
      const rows=Object.entries(json.result??{}).find(([k])=>k!=='last')?.[1];if(!Array.isArray(rows)||rows.length<30)throw Error('Kraken Historie unvollständig');
      if(generation!==this.generation||this.stopped)return;
      const bars=rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[6])}));
      // Replay after reconnect is silent. No delayed signals masquerade as fresh ones.
      for(const c of bars)this.ingestCandle(tf,c,{historical:true});
    }
  }
  async start(){this.stopped=false;clearInterval(this.watch);this.watch=setInterval(()=>this.tick(),1000);await this.connect();}
  async connect(){
    if(this.stopped||this.connecting)return;this.connecting=true;const generation=++this.generation;
    this.status='connecting';this.problem='Kraken Historie wird synchronisiert';this.book.reset();this.trades=[];this.tradeIds.clear();this.lastTrade=0;this.ohlcUpdated={};this.onChange();
    try{await this.history(generation);if(this.stopped||generation!==this.generation)return;
      // Kraken allows one OHLC interval per symbol on a connection.
      // Keep one main connection and two context connections, with a shared recovery path.
      this.connections=[];
      const fail=reason=>{
        if(generation!==this.generation||this.stopped)return;
        this.generation++;this.problem=reason||this.problem||'Kraken Verbindung unterbrochen';
        this.status='reconnecting';this.book.reset();
        for(const link of this.connections)link.socket.close();
        this.schedule();this.onChange();
      };
      for(const tf of [1,5,15,60]){
        const socket=new this.WS(WS_URL),link={socket,tf,lastMessage:Date.now(),lastPing:0};this.connections.push(link);
        socket.onopen=()=>{
          if(generation!==this.generation)return;link.lastMessage=Date.now();this.lastMessage=Date.now();this.problem='Warte auf aktuelle Marktdaten';
          const subscriptions=tf===5?[{channel:'ticker',event_trigger:'bbo'},{channel:'book',depth:100},{channel:'trade',snapshot:false},{channel:'ohlc',interval:5}]:[{channel:'ohlc',interval:tf}];
          for(const params of subscriptions)socket.send(JSON.stringify({method:'subscribe',params:{...params,symbol:['BTC/USD']}}));
        };
        socket.onmessage=event=>{if(generation!==this.generation)return;link.lastMessage=Date.now();try{this.handle(String(event.data));}catch(error){fail(`Datenfehler: ${error.message}`);}};
        socket.onerror=event=>{if(generation===this.generation)this.problem='Kraken Verbindung unterbrochen'+(event.message?': '+event.message:'');};
        socket.onclose=()=>fail(this.problem);
      }
    }catch(error){this.problem=error.message;this.status='error';this.schedule();}finally{this.connecting=false;this.onChange();}
  }
  schedule(){if(this.stopped)return;clearTimeout(this.reconnect);const delay=Math.min(30000,1000*2**Math.min(this.retry++,5))+Math.random()*500;this.reconnect=setTimeout(()=>this.connect(),delay);}
  handle(raw){
    const msg=JSON.parse(raw);this.lastMessage=Date.now();
    if(msg.success===false)throw Error(msg.error||'Subscription abgelehnt');
    if(msg.channel==='status'&&msg.data?.[0]?.system!=='online'){this.status='maintenance';this.problem='Kraken meldet eingeschränkten Betrieb';return;}
    if(msg.channel==='book'){
      if(!this.book.apply(parseWire(raw)))throw Error('Orderbuch Prüfsumme falsch, erneute Synchronisierung');
    }else if(msg.channel==='ticker'){this.ticker={...msg.data[0],updatedAt:Date.now()};}
    else if(msg.channel==='trade'){
      for(const t of msg.data??[]){const id=String(t.trade_id);if(this.tradeIds.has(id))continue;const time=Date.parse(t.timestamp);if(!Number.isFinite(time)||time>Date.now()+5000)continue;this.tradeIds.add(id);this.trades.push({id,time,side:t.side,price:Number(t.price),qty:Number(t.qty)});this.lastTrade=Math.max(this.lastTrade,time);}
      this.trades=this.trades.filter(t=>Date.now()-t.time<120000).slice(-20000);this.tradeIds=new Set(this.trades.map(t=>t.id));
      const latest=this.trades.at(-1);
      if(latest&&Date.now()-latest.time<10000&&this.isHealthy()){
        for(const engine of Object.values(this.engines))for(const event of engine.observePrice(latest.price,latest.time/1000,this.context())){
          event.receivedAt=Date.now();event.historical=false;event.dataHealthy=true;this.events.unshift(event);this.events=this.events.slice(0,200);this.onEvent(event);
        }
      }
    }else if(msg.channel==='ohlc'){
      for(const x of msg.data??[]){const tf=Number(x.interval);if(!this.frames[tf])continue;this.ingestCandle(tf,{time:Date.parse(x.interval_begin)/1000,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)});}
    }
    if(this.book.valid&&this.lastTrade&&this.status!=='maintenance'){this.status='live';this.retry=0;this.problem='';}
  }
  tick(){
    const now=Date.now();
    for(const link of this.connections||[]){
      if(link.socket.readyState===1){
        if(now-link.lastMessage>15000){this.problem='Datenstrom veraltet';this.status='stale';this.book.valid=false;link.socket.close();break;}
        if(now-link.lastPing>10000){link.socket.send(JSON.stringify({method:'ping'}));link.lastPing=now;}
      }else if(link.socket.readyState===0&&now-link.lastMessage>20000){this.problem='Kraken Verbindungsaufbau dauert zu lange';link.socket.close();break;}
    }
    if(this.isHealthy(now)&&now-(this.lastHeat||0)>=5000){const b=this.book.snapshot();this.heat.push({time:now,bids:b.bids,asks:b.asks});this.heat=this.heat.slice(-120);this.lastHeat=now;}
    this.onChange();
  }
  snapshot(){const agentsByTf={5:assessAgents(this,5),15:assessAgents(this,15)};return {version:2,generatedAt:Date.now(),mode:'browser',status:this.status,problem:this.problem,healthy:this.isHealthy(),lastMessage:this.lastMessage,lastTrade:this.lastTrade,settings:this.settings,frames:this.frames,engines:Object.fromEntries(Object.entries(this.engines).map(([k,e])=>[k,{range:e.range,zones:e.zones,setups:e.setups}])),ticker:this.ticker,book:this.book.snapshot(),flow:this.context().flow??0,heat:this.heat,events:this.events,edge:this.edge.snapshot(this.settings),agentsByTf,agents:agentsByTf[5]};}
  stop(){this.stopped=true;this.generation++;clearInterval(this.watch);clearTimeout(this.reconnect);for(const link of this.connections||[])link.socket.close();}
}

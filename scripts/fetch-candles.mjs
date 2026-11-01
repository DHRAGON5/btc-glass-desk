import {writeFileSync} from 'node:fs';
const tf=Number(process.argv[2]||5);if(![5,15].includes(tf))throw Error('Intervall muss 5 oder 15 sein');
const res=await fetch(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${tf}`,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error(`HTTP ${res.status}`);const json=await res.json();if(json.error?.length)throw Error(json.error.join(', '));const rows=Object.entries(json.result).find(([k])=>k!=='last')[1];
// Kraken always returns the current incomplete candle last. Exclude it from research.
const out=process.argv[3]||`btc_${tf}m.csv`;writeFileSync(out,'time,open,high,low,close,volume\n'+rows.slice(0,-1).map(r=>[r[0],r[1],r[2],r[3],r[4],r[6]].join(',')).join('\n')+'\n');console.log(`${out}: ${rows.length-1} abgeschlossene Kerzen. Das reicht nur für einen Funktionstest, nicht für einen belastbaren Strategietest.`);

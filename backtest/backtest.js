// Backtest of Strategy 2 (BTC/ETH whale-flow long) on real OKX 5m spot candles.
// WHALE FLOW PROXY (no historical whale trade feed is available for free):
//   a "whale candle" = 5m candle whose quote volume >= 3x the median of the previous 288 candles (24h).
//   signed by direction (close>open = buy, else sell). 1h flow = sum over last 12 candles.
//   signal: proxy buy >= 2x proxy sell AND net > 0 AND close > EMA21. Entry next candle open.
// Exits: SL = entry - 1*ATR14, TP = entry + 2*ATR14; if both inside one candle, assume SL (conservative).
// Sizing: risk 2% of equity / stop distance, capped at 100% equity (no leverage). Fees+slippage 0.1% per side.
const fs=require('fs');const FEE=+process.env.FEE||0.001,MULT=+process.argv[2]||3;
const ema=(a,n)=>{const k=2/(n+1),o=[a[0]];for(let i=1;i<a.length;i++)o.push(a[i]*k+o[i-1]*(1-k));return o};
function run(K,useFlow){const C=K.map(k=>k[4]),E=ema(C,21),tr=K.map((c,i)=>i?Math.max(c[2]-c[3],Math.abs(c[2]-K[i-1][4]),Math.abs(c[3]-K[i-1][4])):c[2]-c[3]);
 let eq=1000,pk=1000,dd=0,pos=null,T=[],win=[];const qv=K.map(k=>k[6]);
 for(let i=300;i<K.length-1;i++){const c=K[i];
  if(pos){let x=null;if(c[3]<=pos.sl)x=pos.sl;else if(c[2]>=pos.tp)x=pos.tp;
   if(x){const pnl=pos.q*x*(1-FEE)-pos.size*(1+FEE);eq+=pnl;T.push(pnl);pos=null}}
  if(!pos){const atr=tr.slice(i-13,i+1).reduce((s,x)=>s+x,0)/14;
   let ok=c[4]>E[i];if(useFlow&&ok){const med=qv.slice(i-288,i).sort((a,b)=>a-b)[144];let b=0,s=0;
    for(let j=i-11;j<=i;j++)if(qv[j]>=MULT*med){K[j][4]>K[j][1]?b+=qv[j]:s+=qv[j]}ok=b>0&&b>=2*s}
   else if(!useFlow)ok=ok&&i%12===0;// baseline: EMA filter only, at most one check per hour
   if(ok&&atr>0){const en=K[i+1][1],stop=atr/en,size=Math.min(eq*0.02/stop,eq);pos={size,q:size/en,sl:en-atr,tp:en+2*atr}}}
  const m=eq+(pos?pos.q*c[4]-pos.size:0);pk=Math.max(pk,m);dd=Math.max(dd,(pk-m)/pk)}
 const w=T.filter(x=>x>0),l=T.filter(x=>x<=0),gw=w.reduce((a,b)=>a+b,0),gl=-l.reduce((a,b)=>a+b,0);
 return{trades:T.length,winRate:+(w.length/T.length*100).toFixed(1),profitFactor:+(gw/gl).toFixed(2),maxDDPct:+(dd*100).toFixed(2),netPct:+((eq/1000-1)*100).toFixed(2),endEquity:+eq.toFixed(2)}}
const res={};for(const s of['BTC-USDT','ETH-USDT']){const K=JSON.parse(fs.readFileSync(s+'-5m.json'));
 res[s]={from:new Date(K[0][0]).toISOString(),to:new Date(K.at(-1)[0]).toISOString(),candles:K.length,buyHoldPct:+((K.at(-1)[4]/K[0][1]-1)*100).toFixed(2),strategy:run(K,true),baseline_EMA_only:run(K,false)}}
console.log(JSON.stringify(res,null,1));if(MULT===3)fs.writeFileSync('results.json',JSON.stringify(res,null,1));

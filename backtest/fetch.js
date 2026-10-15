// Fetch ~6 months of 5m spot candles from OKX public history (Bybit API returns 403 from this machine).
const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{for(const inst of['BTC-USDT','ETH-USDT']){const end=Date.now(),start=end-182*864e5;let after=end,out=[];
 while(after>start){const r=await (await fetch(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=5m&limit=100&after=${after}`)).json();
  if(r.code!=='0'){console.log(r);await sleep(2000);continue}if(!r.data.length)break;out.push(...r.data.filter(x=>x[8]==='1'));after=+r.data.at(-1)[0];await sleep(110)}
 out=out.map(x=>[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5],+x[7]]).filter(x=>x[0]>=start).sort((a,b)=>a[0]-b[0]);
 fs.writeFileSync(`${inst}-5m.json`,JSON.stringify(out));console.log(inst,out.length,new Date(out[0][0]).toISOString(),new Date(out.at(-1)[0]).toISOString())}})();

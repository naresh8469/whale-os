// WHALE-OS backend: watch-only proxy/poller. No keys, no trading.
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||8080, BIN='https://data-api.binance.vision/api/v3';
const WHALE_USD=+process.env.WHALE_USD||100000;
const S={boosts:[],profiles:[],pairs:[],trending:[],newPools:[],btc:null,eth:null,klines:[],whaleTrades:[],events:[],kpiHist:{},status:{},lastAgg:{}};
const log=(t,m)=>{S.events.unshift({ts:Date.now(),t,m});S.events.length=Math.min(S.events.length,200)};
async function j(u){const t=Date.now();try{const r=await fetch(u,{headers:{accept:'application/json'}});const host=new URL(u).host;S.status[host]={ok:r.ok,code:r.status,ms:Date.now()-t,at:Date.now()};if(!r.ok)throw new Error(r.status);return r.json()}catch(e){S.status[new URL(u).host]={ok:false,err:String(e.message),at:Date.now()};throw e}}
function sig(p){const v5=p.volume?.m5||0,h1=p.volume?.h1||0,b=p.txns?.m5?.buys||0,s=p.txns?.m5?.sells||0,bh=p.txns?.h1?.buys||0,sh=p.txns?.h1?.sells||0;
 return{chain:p.chainId,dex:p.dexId,addr:p.pairAddress,url:p.url,sym:p.baseToken?.symbol,name:p.baseToken?.name,price:+p.priceUsd||0,liq:p.liquidity?.usd||0,fdv:p.fdv||0,
 v5,h1,h24:p.volume?.h24||0,spike:h1>0?v5/(h1/12):0,b5:b,s5:s,bh,sh,imb:(bh+sh)?(bh-sh)/(bh+sh):0,chg5:p.priceChange?.m5||0,chg1:p.priceChange?.h1||0,chg24:p.priceChange?.h24||0,
 created:p.pairCreatedAt||0,ageH:p.pairCreatedAt?(Date.now()-p.pairCreatedAt)/36e5:null}}
async function pollDex(){try{
 const [bo,pr]=await Promise.all([j('https://api.dexscreener.com/token-boosts/latest/v1'),j('https://api.dexscreener.com/token-profiles/latest/v1')]);
 S.boosts=bo.slice(0,30);S.profiles=pr.slice(0,30);
 const byChain={};[...bo,...pr].slice(0,60).forEach(t=>{(byChain[t.chainId]??=new Set()).add(t.tokenAddress)});
 const out=[];for(const[c,set]of Object.entries(byChain)){const a=[...set];for(let i=0;i<a.length;i+=30){try{const r=await j(`https://api.dexscreener.com/tokens/v1/${c}/${a.slice(i,i+30).join(',')}`);out.push(...r)}catch{}}}
 const best={};out.forEach(p=>{const k=p.baseToken?.address;if(!best[k]||(p.liquidity?.usd||0)>(best[k].liquidity?.usd||0))best[k]=p});
 const prev=new Map(S.pairs.map(p=>[p.addr,p]));S.pairs=Object.values(best).map(sig).sort((a,b)=>b.h24-a.h24);
 S.pairs.forEach(p=>{if(!prev.has(p.addr))log('LAUNCH',`${p.sym} on ${p.chain}/${p.dex} liq $${fmt(p.liq)}`);if(p.spike>=3&&p.v5>5000)log('SPIKE',`${p.sym} m5 vol ${p.spike.toFixed(1)}x h1 avg ($${fmt(p.v5)})`);if(p.liq<5000&&p.liq>0&&p.h24>50000)log('RUGRISK',`${p.sym} liq $${fmt(p.liq)} vs 24h vol $${fmt(p.h24)}`)});
}catch(e){log('ERR','dexscreener '+e.message)}}
async function pollGecko(){try{const r=await j('https://api.geckoterminal.com/api/v2/networks/trending_pools?page=1');S.trending=r.data.map(d=>({name:d.attributes.name,net:d.relationships?.network?.data?.id||d.id.split('_')[0],price:+d.attributes.base_token_price_usd,liq:+d.attributes.reserve_in_usd,v24:+d.attributes.volume_usd?.h24,v1:+d.attributes.volume_usd?.h1,chg1:+d.attributes.price_change_percentage?.h1,tx1:d.attributes.transactions?.h1}));
 const n=await j('https://api.geckoterminal.com/api/v2/networks/new_pools?page=1');S.newPools=n.data.map(d=>({name:d.attributes.name,net:d.id.split('_')[0],liq:+d.attributes.reserve_in_usd,created:d.attributes.pool_created_at,v1:+d.attributes.volume_usd?.h1}));
}catch(e){log('ERR','geckoterminal '+e.message)}}
async function pollBin(){try{const[b,e,k]=await Promise.all([j(BIN+'/ticker/24hr?symbol=BTCUSDT'),j(BIN+'/ticker/24hr?symbol=ETHUSDT'),j(BIN+'/klines?symbol=BTCUSDT&interval=5m&limit=96')]);S.btc=b;S.eth=e;S.klines=k.map(x=>[x[0],+x[1],+x[2],+x[3],+x[4],+x[5]]);
 for(const sym of['BTCUSDT','ETHUSDT']){const t=await j(`${BIN}/aggTrades?symbol=${sym}&limit=1000`);for(const a of t){if(a.a<= (S.lastAgg[sym]||0))continue;const usd=a.p*a.q;if(usd>=WHALE_USD){S.whaleTrades.unshift({sym,ts:a.T,px:+a.p,qty:+a.q,usd,side:a.m?'SELL':'BUY'});log('WHALE',`${sym} ${a.m?'SELL':'BUY'} $${fmt(usd)} @ ${(+a.p).toFixed(2)}`)}}S.lastAgg[sym]=t.at(-1).a}
 S.whaleTrades.length=Math.min(S.whaleTrades.length,100);
}catch(e){log('ERR','binance '+e.message)}}
function fmt(n){n=+n||0;return n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toFixed(0)}
function kpis(){const P=S.pairs,h=Date.now()-36e5;const w=S.whaleTrades.filter(t=>t.ts>h);
 const k={WHALES:w.length,RUGS:P.filter(p=>p.liq>0&&p.liq<5000&&p.h24>50000||p.chg1<-50).length,LAUNCHES:P.filter(p=>p.ageH!==null&&p.ageH<24).length+S.newPools.length,
 UNLOCKS:null,LEVERAGE:null,FLOWS:Math.round(w.reduce((s,t)=>s+(t.side=='BUY'?t.usd:-t.usd),0))};
 for(const[x,v]of Object.entries(k)){if(v===null)continue;const a=(S.kpiHist[x]??=[]);a.push(v);if(a.length>60)a.shift()}return k}
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((q,r)=>{if(q.method!=='GET'&&q.method!=='HEAD'){r.writeHead(405);return r.end()}let u=q.url.split('?')[0];if(u===''||u.endsWith('/'))u='/';
 if(u==='/api/state'){r.writeHead(200,{'content-type':'application/json'});return r.end(JSON.stringify({now:Date.now(),whaleUsd:WHALE_USD,kpi:kpis(),kpiHist:S.kpiHist,pairs:S.pairs,trending:S.trending,newPools:S.newPools,btc:S.btc,eth:S.eth,klines:S.klines,whaleTrades:S.whaleTrades,events:S.events.slice(0,80),status:S.status,boostCount:S.boosts.length,profileCount:S.profiles.length}))}
 if(u.startsWith('/api/depth')){return j(BIN+'/depth?symbol=BTCUSDT&limit=20').then(d=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(d))}).catch(e=>{r.writeHead(502);r.end('{}')})}
 const f=path.join(__dirname,'public',u==='/'?'index.html':path.normalize(u));if(!f.startsWith(path.join(__dirname,'public'))){r.writeHead(403);return r.end()}
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('nf')}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'text/plain'});r.end(d)})
}).listen(PORT,()=>console.log('WHALE-OS on :'+PORT));
const loop=(fn,ms)=>{fn();setInterval(fn,ms)};loop(pollDex,30000);loop(pollGecko,60000);loop(pollBin,10000);

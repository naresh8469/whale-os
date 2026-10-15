// PAPER TRADING ENGINE — simulated only. No orders, no keys, no wallet.
const fs=require('fs'),path=require('path');
const CFG={start:1000,riskPct:0.02,feeDex:0.003,feeCex:0.001,
 dex:{spike:3,imb:1.5,liq:20000,ageH:1,chgMin:0,chgMax:40,tp:0.20,sl:0.10,timeMin:60,maxOpen:5,maxPosPct:0.2},
 cex:{flowMin:+process.env.FLOW_MIN||500000,flowRatio:2,ema:21,atr:14,slAtr:1,tpAtr:2,maxPosPct:1,cooldownMin:30}};
const FILE=process.env.PAPER_FILE||path.join(__dirname,'data','paper.json');
const GP_CHAIN={ethereum:1,bsc:56,base:8453,arbitrum:42161,polygon:137,avalanche:43114,optimism:10};
module.exports=function init({S,j,withEx,log}){
 let P={balance:CFG.start,open:[],closed:[],equity:[],started:Date.now(),lastCex:{}};
 try{P={...P,...JSON.parse(fs.readFileSync(FILE,'utf8'))};log('PAPER','restored state from '+FILE)}catch{}
 const save=()=>{try{fs.mkdirSync(path.dirname(FILE),{recursive:true});fs.writeFileSync(FILE,JSON.stringify(P))}catch{}};
 const gp={};// token security cache
 async function goplus(chain,token){const k=chain+':'+token;if(gp[k]&&Date.now()-gp[k].at<36e5)return gp[k];let res={checked:false,ok:true,why:'no GoPlus coverage'};
  try{if(GP_CHAIN[chain]){const r=await j(`https://api.gopluslabs.io/api/v1/token_security/${GP_CHAIN[chain]}?contract_addresses=${token}`);const d=r.result&&r.result[token.toLowerCase()];
    if(d){const st=+d.sell_tax||0,bt=+d.buy_tax||0;res={checked:true,ok:!(d.is_honeypot==='1'||st>0.1||bt>0.1||d.cannot_sell_all==='1'),why:`honeypot=${d.is_honeypot} buyTax=${bt} sellTax=${st}`}}}
   else if(chain==='solana'){const r=await j(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${token}`);const d=r.result&&(r.result[token]||Object.values(r.result)[0]);
    if(d){const fr=d.freezable?.status==='1',nt=d.non_transferable==='1';res={checked:true,ok:!(fr||nt),why:`freezable=${fr} nonTransferable=${nt}`}}}}catch(e){res={checked:false,ok:true,why:'GoPlus error '+e.message}}
  res.at=Date.now();gp[k]=res;return res}
 // Buy/Wait/Avoid score per DEX pair
 function score(p){const c=CFG.dex,bs=p.s5?p.b5/p.s5:(p.b5>0?99:0);const g=gp[p.chain+':'+p.token];
  const checks={spike:p.spike>=c.spike,imb:bs>=c.imb,liq:p.liq>=c.liq,age:p.ageH!==null&&p.ageH>=c.ageH,chg:p.chg1>=c.chgMin&&p.chg1<=c.chgMax};
  const n=Object.values(checks).filter(Boolean).length;let v=n===5?'BUY':n>=3?'WAIT':'AVOID',why=[];
  if(p.liq<5000||(p.liq<20000&&p.h24>p.liq*10)){v='AVOID';why.push('thin liq')}if(p.chg1>100||p.chg1<-30){v='AVOID';why.push('1h move extreme')}
  if(g&&!g.ok){v='AVOID';why.push('GoPlus: '+g.why)}
  return{v,n,bs:+bs.toFixed(2),checks,why,gp:g?(g.checked?(g.ok?'pass':'fail'):'n/a'):'pending'}}
 const ema=(a,n)=>{const k=2/(n+1);let e=a[0];const o=[e];for(let i=1;i<a.length;i++){e=a[i]*k+e*(1-k);o.push(e)}return o};
 const atr=(K,n)=>{let s=0;const tr=K.slice(1).map((c,i)=>Math.max(c[2]-c[3],Math.abs(c[2]-K[i][4]),Math.abs(c[3]-K[i][4])));const t=tr.slice(-n);t.forEach(x=>s+=x);return s/t.length};
 const equity=()=>P.balance+P.open.reduce((s,o)=>s+o.qty*(o.mark??o.entry),0);
 function open(o){const fee=o.strat==='DEX'?CFG.feeDex:CFG.feeCex,eq=equity();const riskUsd=eq*CFG.riskPct;
  let size=Math.min(riskUsd/o.stopPct,eq*o.maxPosPct,P.balance/(1+fee));if(size<10)return;
  const entry=o.px*(o.strat==='DEX'?1:1);const qty=size/entry;P.balance-=size*(1+fee);
  const pos={id:Date.now()+Math.random().toString(36).slice(2,6),strat:o.strat,sym:o.sym,chain:o.chain,pair:o.pair,url:o.url,entry,qty,size,fee,feeIn:size*fee,tp:o.tp,sl:o.sl,tStop:o.tStop||null,opened:Date.now(),mark:entry,why:o.why};
  P.open.push(pos);log('PAPER',`OPEN ${o.strat} ${o.sym} $${size.toFixed(0)} @ ${entry} TP ${o.tp.toPrecision(6)} SL ${o.sl.toPrecision(6)}`);save()}
 function close(pos,px,reason){const proceeds=pos.qty*px*(1-pos.fee),pnl=proceeds-pos.size-pos.feeIn;P.balance+=proceeds;P.open=P.open.filter(o=>o!==pos);
  P.closed.unshift({...pos,exit:px,closedAt:Date.now(),reason,pnl,pnlPct:pnl/pos.size*100});P.closed.length=Math.min(P.closed.length,500);
  log('PAPER',`CLOSE ${pos.strat} ${pos.sym} ${reason} pnl $${pnl.toFixed(2)}`);save()}
 async function dexLoop(){try{const c=CFG.dex;
  // exits: re-poll pair price
  for(const pos of P.open.filter(o=>o.strat==='DEX')){try{const r=await j(`https://api.dexscreener.com/latest/dex/pairs/${pos.chain}/${pos.pair}`);const px=+(r.pairs?.[0]||r.pair||{}).priceUsd;if(!px)continue;pos.mark=px;
    if(px>=pos.tp)close(pos,px,'TP');else if(px<=pos.sl)close(pos,px,'SL');else if(Date.now()-pos.opened>=c.timeMin*6e4)close(pos,px,'TIME')}catch{}}
  // entries
  for(const p of S.pairs){p.score=score(p)}
  const cands=S.pairs.filter(p=>p.score.v==='BUY'&&!P.open.some(o=>o.pair===p.addr)&&!P.closed.some(o=>o.pair===p.addr&&Date.now()-o.closedAt<36e5)).slice(0,5);
  for(const p of cands){if(P.open.filter(o=>o.strat==='DEX').length>=c.maxOpen)break;const g=await goplus(p.chain,p.token);p.score=score(p);if(!g.ok||p.score.v!=='BUY')continue;
   open({strat:'DEX',sym:p.sym,chain:p.chain,pair:p.addr,url:p.url,px:p.price,stopPct:c.sl,maxPosPct:c.maxPosPct,tp:p.price*(1+c.tp),sl:p.price*(1-c.sl),why:`spike ${p.spike.toFixed(1)}x b/s ${p.score.bs} liq $${Math.round(p.liq)} 1h ${p.chg1}% GoPlus ${g.checked?'pass':'unchecked'}`})}
  // prefetch GoPlus for WAIT/BUY so score can show it
  for(const p of S.pairs.filter(p=>p.score.v!=='AVOID').slice(0,6))if(!gp[p.chain+':'+p.token])await goplus(p.chain,p.token);
 }catch(e){log('ERR','paper dex '+e.message)}}
 async function cexLoop(){try{const c=CFG.cex,h=Date.now()-36e5;S.cexSignal={};
  for(const[sym,tk]of[['BTCUSDT',S.btc],['ETHUSDT',S.eth]]){const K=await withEx(x=>x.klines(sym));if(!K.length)continue;const px=K.at(-1)[4];
   const e=ema(K.map(k=>k[4]),c.ema).at(-1),a=atr(K,c.atr);const w=S.whaleTrades.filter(t=>t.sym===sym&&t.ts>h);
   const buy=w.filter(t=>t.side==='BUY').reduce((s,t)=>s+t.usd,0),sell=w.filter(t=>t.side==='SELL').reduce((s,t)=>s+t.usd,0),net=buy-sell;
   const sig=net>=c.flowMin&&buy>=c.flowRatio*Math.max(sell,1)&&px>e;S.cexSignal[sym]={px,ema21:e,atr:a,buy,sell,net,signal:sig};
   for(const pos of P.open.filter(o=>o.strat==='CEX'&&o.sym===sym)){pos.mark=px;const lo=K.at(-1)[3],hi=K.at(-1)[2];
    if(lo<=pos.sl)close(pos,pos.sl,'SL');else if(hi>=pos.tp)close(pos,pos.tp,'TP')}
   if(sig&&!P.open.some(o=>o.sym===sym)&&Date.now()-(P.lastCex[sym]||0)>c.cooldownMin*6e4){P.lastCex[sym]=Date.now();
    open({strat:'CEX',sym,px,stopPct:a*c.slAtr/px,maxPosPct:c.maxPosPct,tp:px+c.tpAtr*a,sl:px-c.slAtr*a,why:`whale net $${Math.round(net)} buy/sell ${(buy/Math.max(sell,1)).toFixed(1)} px>${e.toFixed(2)} EMA21 ATR ${a.toFixed(2)} (${S.exchange})`})}}
 }catch(e){log('ERR','paper cex '+e.message)}}
 function stats(list){const w=list.filter(t=>t.pnl>0),l=list.filter(t=>t.pnl<=0),gw=w.reduce((s,t)=>s+t.pnl,0),gl=-l.reduce((s,t)=>s+t.pnl,0);
  return{trades:list.length,wins:w.length,winRate:list.length?w.length/list.length*100:null,pf:gl>0?gw/gl:(gw>0?Infinity:null),net:gw-gl}}
 function snap(){const eq=equity();P.equity.push([Date.now(),+eq.toFixed(2)]);if(P.equity.length>2000)P.equity.splice(0,P.equity.length-2000);save()}
 setInterval(dexLoop,30000);setTimeout(dexLoop,15000);setInterval(cexLoop,30000);setTimeout(cexLoop,12000);setInterval(snap,60000);setTimeout(snap,5000);
 return function state(){const eq=equity();let pk=CFG.start,dd=0;for(const[,v]of[...P.equity,[0,eq]]){pk=Math.max(pk,v);dd=Math.max(dd,(pk-v)/pk*100)}
  const scores={};for(const p of S.pairs)scores[p.addr]=score(p);
  return{scores,cfg:CFG,balance:P.balance,equity:eq,retPct:(eq/CFG.start-1)*100,maxDD:dd,started:P.started,curve:P.equity,open:P.open,closed:P.closed.slice(0,50),
   all:stats(P.closed),dex:stats(P.closed.filter(t=>t.strat==='DEX')),cex:stats(P.closed.filter(t=>t.strat==='CEX')),cexSignal:S.cexSignal||{},persist:FILE}}};

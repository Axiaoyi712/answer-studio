import {randomUUID} from 'node:crypto';
import './edge-extension/handoff-reasons.js';

export function setupOperations(db){
  db.exec(`CREATE TABLE IF NOT EXISTS runtime_health(space TEXT NOT NULL REFERENCES spaces(id),account TEXT NOT NULL,seen INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(space,account));
    CREATE TABLE IF NOT EXISTS model_metrics(id TEXT PRIMARY KEY,space TEXT NOT NULL REFERENCES spaces(id),kind TEXT NOT NULL,created INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reception_reviews(record TEXT PRIMARY KEY,space TEXT NOT NULL REFERENCES spaces(id),correct INTEGER,resolved INTEGER,updated INTEGER NOT NULL);`);
}
export function heartbeat(db,space,body,now=Date.now()){
  if(typeof body.account!=='string'||!body.account||body.account.length>150||typeof body.running!=='boolean')throw Error('运行心跳格式无效');
  const value={account:body.account,running:body.running,phase:String(body.phase||'').slice(0,100),lastRead:0,lastModel:0,lastSend:0,pending:0,handoffs:0,failures:0,waiting:!!body.waiting};
  for(const k of ['lastRead','lastModel','lastSend']){const n=Number(body[k])||0;if(n<0||n>now+300000)throw Error('心跳时间无效');value[k]=n;}
  for(const k of ['pending','handoffs','failures']){const n=Number(body[k])||0;if(!Number.isInteger(n)||n<0||n>100000)throw Error('心跳计数无效');value[k]=n;}
  db.prepare('INSERT INTO runtime_health VALUES(?,?,?,?) ON CONFLICT(space,account) DO UPDATE SET seen=excluded.seen,body=excluded.body').run(space,body.account,now,JSON.stringify(value));return {ok:true};
}
export function healthState(value,seen,now=Date.now()){
  if(!value.running)return {state:'paused',label:'已暂停'};
  if(now-seen>120000)return {state:'error',label:'接待页面超过2分钟无心跳'};
  if(!value.lastRead||now-value.lastRead>120000)return {state:'error',label:'消息读取超过2分钟未成功'};
  if(value.failures>=3)return {state:'error',label:'问答服务连续失败'};
  if(value.waiting)return {state:'waiting',label:'正在等待人工草稿处理'};
  if(value.pending>0&&now-Math.max(value.lastSend||0,value.lastModel||0)>300000)return {state:'waiting',label:'有待回复任务持续积压，请检查'};
  return {state:'healthy',label:'接待链路正常'};
}
export async function metered(db,space,kind,options,run){
  const metrics={requests:0,inputTokens:0,outputTokens:0},start=Date.now(),original=options.fetcher||fetch;
  const fetcher=async(...args)=>{metrics.requests++;const response=await original(...args);return {ok:response.ok,status:response.status,json:async()=>{const value=await response.json();metrics.inputTokens+=Number(value.usage?.prompt_tokens)||0;metrics.outputTokens+=Number(value.usage?.completion_tokens)||0;return value;}};};
  let outcome='error',saved=false;const finish=()=>{if(saved)return;saved=true;db.prepare('INSERT INTO model_metrics VALUES(?,?,?,?,?)').run(randomUUID(),space,kind,Date.now(),JSON.stringify({...metrics,durationMs:Date.now()-start,outcome}));};
  options.signal?.addEventListener('abort',finish,{once:true});
  try{const result=await run({...options,fetcher});outcome=result.action||'complete';return result;}finally{finish();options.signal?.removeEventListener('abort',finish);}
}
export function reviewRecord(db,space,body){
  if(!db.prepare('SELECT id FROM reception WHERE id=? AND space=?').get(body.id,space))throw Error('接待记录不存在或已归档');
  if(body.correct!==undefined&&typeof body.correct!=='boolean'||body.resolved!==undefined&&typeof body.resolved!=='boolean')throw Error('抽查状态无效');
  if(body.correct===undefined&&body.resolved===undefined)throw Error('请选择抽查或解决状态');
  const old=db.prepare('SELECT * FROM reception_reviews WHERE record=? AND space=?').get(body.id,space)||{};
  db.prepare('INSERT INTO reception_reviews VALUES(?,?,?,?,?) ON CONFLICT(record) DO UPDATE SET correct=excluded.correct,resolved=excluded.resolved,updated=excluded.updated').run(body.id,space,body.correct===undefined?old.correct??null:Number(body.correct),body.resolved===undefined?old.resolved??null:Number(body.resolved),Date.now());return {ok:true};
}
export function overview(db,space,days=7,now=Date.now()){
  days=days===30?30:7;const since=now-days*86400000;
  const rows=db.prepare('SELECT * FROM reception WHERE space=? AND updated>=? ORDER BY updated DESC').all(space,since),counts={},reasons={},repeated=new Map(),waiting=[];
  for(const row of rows){const r=JSON.parse(row.body);counts[row.state]=(counts[row.state]||0)+1;if(['handoff','manual','uncertain'].includes(row.state)){
    const category=globalThis.ZhidaHandoff.describe(r.reason,r.reasonCode);reasons[category.label]=(reasons[category.label]||0)+1;
    const key=String(r.question||'').replace(/[\s，。！？?!]/g,'');if(key){const item=repeated.get(key)||{question:r.question,count:0};item.count++;repeated.set(key,item);}
    waiting.push({id:row.id,name:r.name||'顾客',question:r.question,reason:r.reason,category:category.label,minutes:Math.max(0,Math.floor((now-(r.firstSeen||row.updated))/60000))});
  }}
  const reviews=db.prepare('SELECT r.correct,r.resolved FROM reception_reviews r JOIN reception p ON p.id=r.record WHERE r.space=? AND p.updated>=?').all(space,since),checked=reviews.filter(r=>r.correct!==null),correct=checked.filter(r=>r.correct===1).length;
  const metrics=db.prepare("SELECT body FROM model_metrics WHERE space=? AND kind='reception' AND created>=?").all(space,since).map(r=>JSON.parse(r.body));
  const health=db.prepare('SELECT * FROM runtime_health WHERE space=? ORDER BY seen DESC').all(space).map(r=>{const value=JSON.parse(r.body);return {...value,seen:r.seen,...healthState(value,r.seen,now)};});
  return {days,total:rows.length,counts,reasons,waiting:waiting.sort((a,b)=>b.minutes-a.minutes).slice(0,20),repeated:[...repeated.values()].sort((a,b)=>b.count-a.count).slice(0,10),review:{checked:checked.length,correct,correctRate:checked.length?Math.round(100*correct/checked.length):null,resolved:reviews.filter(r=>r.resolved===1).length},metrics:{replies:metrics.length,requests:metrics.reduce((n,m)=>n+m.requests,0),inputTokens:metrics.reduce((n,m)=>n+m.inputTokens,0),outputTokens:metrics.reduce((n,m)=>n+m.outputTokens,0),averageMs:metrics.length?Math.round(metrics.reduce((n,m)=>n+m.durationMs,0)/metrics.length):0},health};
}

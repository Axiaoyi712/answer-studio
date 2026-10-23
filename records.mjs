import {channelId,channelPolicy} from './channel-settings.mjs';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import './edge-extension/handoff-reasons.js';

export function recordDetails(body){return {...body,handoffType:globalThis.ZhidaHandoff.describe(body.reason,body.reasonCode)};}

export function setupRecords(db){
  db.exec(`CREATE TABLE IF NOT EXISTS reception(id TEXT PRIMARY KEY,space TEXT NOT NULL,account TEXT NOT NULL,conversation TEXT NOT NULL,state TEXT NOT NULL,updated INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reception_settings(space TEXT PRIMARY KEY,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reception_events(id TEXT PRIMARY KEY,space TEXT NOT NULL,record TEXT NOT NULL,created INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS reception_event_record ON reception_events(space,record,created);`);
}
export function saveRecord(db,body,now=Date.now()){
  if(!body||typeof body.id!=='string'||body.id.length>500||!body.id||typeof body.space!=='string'||typeof body.account!=='string'||typeof body.conversation!=='string'||!['pending','answer','skip','handoff','manual','uncertain','done'].includes(body.state))throw new Error('接待记录格式无效');
  const old=db.prepare('SELECT space,account,conversation,body,updated FROM reception WHERE id=?').get(body.id);
  if(old&&(old.space!==body.space||old.account!==body.account||old.conversation!==body.conversation))throw new Error('接待记录所属业务或客户不一致');
  if(old&&['manual','done'].includes(body.state)&&!body.reasonCode){const previous=JSON.parse(old.body);if(['handoff','manual','uncertain'].includes(previous.state))body={...body,reasonCode:globalThis.ZhidaHandoff.describe(previous.reason,previous.reasonCode).code};}
  body={...body,firstSeen:old?JSON.parse(old.body).firstSeen||old.updated:now};
  const value=JSON.stringify(recordDetails(body));if(Buffer.byteLength(value)>512000)throw new Error('接待记录过大');
  db.exec('SAVEPOINT reception_record');try{
  db.prepare('INSERT INTO reception VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated=excluded.updated,body=excluded.body').run(body.id,body.space,body.account,body.conversation,body.state,now,value);
  const event=JSON.stringify({stage:body.stage||body.state,state:body.state,question:body.question||'',answer:body.answer||'',reason:body.reason||'',ids:body.ids||[],sources:(body.sources||[]).map(f=>f.id),version:body.version||null});
  const previous=db.prepare('SELECT body FROM reception_events WHERE space=? AND record=? ORDER BY created DESC,rowid DESC LIMIT 1').get(body.space,body.id);
  if(previous?.body!==event)db.prepare('INSERT INTO reception_events VALUES(?,?,?,?,?)').run(randomUUID(),body.space,body.id,now,event);
  db.exec('RELEASE reception_record');}catch(e){db.exec('ROLLBACK TO reception_record');db.exec('RELEASE reception_record');throw e;}
  return {ok:true};
}
export function settings(db,space,body,channel='xiaohongshu'){
  const id=channelId(body?.channel??channel),stored=JSON.parse(db.prepare('SELECT body FROM reception_settings WHERE space=?').get(space)?.body||'{}');
  const existing=stored.channels?.[id]||(id==='xiaohongshu'?stored:{});
  if(body!==undefined){
    const value=channelPolicy(id,{...existing,...body}),next={...stored,channels:{...stored.channels,[id]:value}};
    db.prepare('INSERT INTO reception_settings VALUES(?,?) ON CONFLICT(space) DO UPDATE SET body=excluded.body').run(space,JSON.stringify(next));
    return value;
  }
  return channelPolicy(id,existing);
}
export function siteRequested(question){
  if(/(?:不要|不需要|不用|别).{0,12}(?:网站|网址|链接|下单)/.test(question))return false;
  return /网站|网址|链接|下单|购买入口/.test(question)&&(/怎么|如何|哪里|哪儿|在哪|给|发|提供|是啥|是什么|地址|入口|[?？]/.test(question)||/^(?:网站|网址|链接)[呀啊呢吗？?]*$/.test(question.trim()));
}
export function archiveRecords(db,directory,now=Date.now()){
  const rows=db.prepare("SELECT * FROM reception WHERE updated<? AND state IN ('answer','skip','done') ORDER BY updated,id").all(now-30*86400000);
  if(!rows.length)return {count:0,files:[]};
  mkdirSync(directory,{recursive:true});const groups=new Map();
  for(const row of rows){const month=new Date(row.updated).toISOString().slice(0,7);if(!groups.has(month))groups.set(month,[]);groups.get(month).push(row);}
  const files=[];
  for(const [month,items] of groups){
    const events=items.flatMap(r=>db.prepare('SELECT * FROM reception_events WHERE space=? AND record=? ORDER BY created,rowid').all(r.space,r.id));
    const content=JSON.stringify({schema:1,created:new Date(now).toISOString(),records:items,events},null,2);
    const hash=createHash('sha256').update(content).digest('hex');const file=`${month}-${hash}.json`,path=join(directory,file);
    // Durable verified copy before deleting the exact rows represented by this archive.
    const fd=openSync(path,'w');try{writeFileSync(fd,content);fsyncSync(fd);}finally{closeSync(fd);}
    if(createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)throw new Error('归档校验失败，在线记录未清理');
    db.exec('BEGIN');try{const del=db.prepare('DELETE FROM reception WHERE id=? AND updated=? AND body=?');for(const r of items)del.run(r.id,r.updated,r.body);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    files.push(file);
  }
  return {count:rows.length,files,directory:resolve(directory)};
}
export function archiveAuxiliary(db,directory,now=Date.now()){
 const cutoff=now-90*86400000,tables={
  model_metrics:db.prepare('SELECT * FROM model_metrics WHERE created<?').all(cutoff),
  conversation_memory:db.prepare("SELECT m.* FROM conversation_memory m WHERE updated<? AND NOT EXISTS(SELECT 1 FROM reception r WHERE r.space=m.space AND r.account=m.account AND r.conversation=m.conversation AND r.state IN ('pending','handoff','manual','uncertain'))").all(cutoff),
  reception_events:db.prepare("SELECT e.* FROM reception_events e WHERE created<? AND NOT EXISTS(SELECT 1 FROM reception r WHERE r.id=e.record AND r.state IN ('pending','handoff','manual','uncertain'))").all(cutoff)
 };
 const count=Object.values(tables).reduce((n,rows)=>n+rows.length,0);if(!count)return {count:0};
 const content=JSON.stringify({schema:1,created:new Date(now).toISOString(),retentionDays:90,tables}),sha256=createHash('sha256').update(content).digest('hex');mkdirSync(directory,{recursive:true});
 const file=join(directory,'aux-'+new Date(now).toISOString().slice(0,7)+'-'+sha256+'.json'),fd=openSync(file,'w');try{writeFileSync(fd,content);fsyncSync(fd);}finally{closeSync(fd);}
 if(createHash('sha256').update(readFileSync(file)).digest('hex')!==sha256)throw Error('运行资料归档校验失败，未清理');
 db.exec('BEGIN');try{
  for(const [table,rows] of Object.entries(tables))for(const row of rows){const names=Object.keys(row),where=names.map(k=>'"'+k+'" IS ?').join(' AND ');db.prepare('DELETE FROM "'+table+'" WHERE '+where).run(...names.map(k=>row[k]));}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}return {count,file,sha256};
}
export function archiveBrowserRecords(directory,body,now=Date.now()){
 const {account,entries}=body;if(typeof account!=='string'||!account||account.length>150||!Array.isArray(entries)||!entries.length||entries.length>100||Buffer.byteLength(JSON.stringify(entries))>512000)throw Error('浏览器归档格式无效');
 for(const entry of entries){if(!Array.isArray(entry)||entry.length!==2)throw Error('归档条目无效');const [key,value]=entry;let identity;
  try{identity=JSON.parse(key.slice(key.indexOf(':')+1));}catch{throw Error('归档标识无效');}
  if(!Array.isArray(identity)||identity[0]!==account||typeof identity[1]!=='string'||!value||!Number.isFinite(value.time)||value.time<=0||value.time>=now-90*86400000||!(key.startsWith('inbox:')&&value.state==='echo-confirmed'||key.startsWith('reception-task:')&&value.state==='done'))throw Error('仅允许归档本账号90天前已完成的任务或确认记录');
 }
 const payload=JSON.stringify(entries),sha256=createHash('sha256').update(payload).digest('hex'),name='browser-'+createHash('sha256').update(account).digest('hex').slice(0,16)+'-'+sha256+'.json';mkdirSync(directory,{recursive:true});const file=join(directory,name);
 if(!existsSync(file)){const content=JSON.stringify({schema:1,scope:'xiaohongshu-account',account,created:now,entries}),fd=openSync(file,'wx');try{writeFileSync(fd,content);fsyncSync(fd);}finally{closeSync(fd);}}
 const archived=JSON.parse(readFileSync(file,'utf8'));if(archived.schema!==1||archived.account!==account||createHash('sha256').update(JSON.stringify(archived.entries)).digest('hex')!==sha256)throw Error('浏览器归档校验失败，不能清理原记录');return {count:entries.length,file:name,sha256};
}
export function listArchives(directory){try{return readdirSync(directory).filter(n=>/^\d{4}-\d{2}-[a-f0-9]{64}\.json$/.test(n)).sort().reverse();}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export function readArchive(directory,name){if(!/^\d{4}-\d{2}-[a-f0-9]{64}\.json$/.test(name))throw new Error('归档名称无效');const content=readFileSync(join(directory,name));if(!name.endsWith(createHash('sha256').update(content).digest('hex')+'.json'))throw new Error('归档完整性校验失败');return JSON.parse(content.toString('utf8'));}

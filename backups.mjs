import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,statSync,realpathSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const filename=/^backup-\d{13}-[a-f0-9-]{36}\.sqlite$/;
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const schema=db=>db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
function summary(db){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,count:db.prepare('SELECT COUNT(*) n FROM '+quote(name)).get().n}));}
function digest(db){const h=createHash('sha256').update(JSON.stringify(schema(db)));for(const {name} of summary(db)){h.update(name);for(const row of db.prepare('SELECT * FROM '+quote(name)+' ORDER BY rowid').iterate())h.update(JSON.stringify(row));}return h.digest('hex');}
export function recoveryGeneration(db){return db.prepare("SELECT value FROM service_state WHERE key='generation'").get()?.value||'initial';}
export function setupRecovery(db){db.exec('CREATE TABLE IF NOT EXISTS service_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');}
export function createBackupManager(db,{directory,appVersion='0.11.0',intervalMs=6*3600000,keepAutomatic=14,now=Date.now}={}){
  setupRecovery(db);mkdirSync(directory,{recursive:true});let busy=false,lastError='';
  function file(name){if(!filename.test(name||''))throw Error('备份名称无效');const path=join(directory,name);if(dirname(realpathSync(path)).toLowerCase()!==realpathSync(directory).toLowerCase())throw Error('备份文件不在指定目录');return path;}
  function list(){return readdirSync(directory).filter(n=>filename.test(n)).flatMap(name=>{try{const m=JSON.parse(readFileSync(join(directory,name+'.json'),'utf8'));if(m.name!==name||m.schema!==1)return [];return [m];}catch{return [];}}).sort((a,b)=>b.created-a.created);}
  function inspect(name){
    const path=file(name),metadata=JSON.parse(readFileSync(path+'.json','utf8'));if(metadata.name!==name||metadata.schema!==1||metadata.sha256!==hash(readFileSync(path)))throw Error('备份校验失败，文件可能不完整或已被修改');
    const source=new DatabaseSync(path,{readOnly:true});try{if(Object.values(source.prepare('PRAGMA integrity_check').get())[0]!=='ok'||source.prepare('PRAGMA foreign_key_check').all().length)throw Error('备份数据库完整性检查失败');return {metadata,schema:hash(JSON.stringify(schema(source))),tables:summary(source)};}finally{source.close();}
  }
  function prune(){const automatic=list().filter(m=>m.reason==='automatic');for(const m of automatic.slice(keepAutomatic)){try{inspect(m.name);const path=file(m.name);unlinkSync(path);unlinkSync(path+'.json');}catch(e){lastError='旧自动备份未清理：'+e.message;}}}
  async function createFile(reason){
    const created=now(),name='backup-'+created+'-'+randomUUID()+'.sqlite',path=join(directory,name),temporary=path+'.tmp';
    try{
    await backup(db,temporary);const source=new DatabaseSync(temporary);let tables,schemaHash;
    try{source.exec('PRAGMA journal_mode=DELETE');if(Object.values(source.prepare('PRAGMA integrity_check').get())[0]!=='ok'||source.prepare('PRAGMA foreign_key_check').all().length)throw Error('备份完整性校验失败');tables=summary(source);schemaHash=hash(JSON.stringify(schema(source)));}finally{source.close();}
    const metadata={schema:1,name,created,reason,appVersion,bytes:statSync(temporary).size,sha256:hash(readFileSync(temporary)),schemaHash,tables};
    const fd=openSync(temporary,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temporary,path);
    const manifest=path+'.json.tmp',mf=openSync(manifest,'wx');try{writeFileSync(mf,JSON.stringify(metadata,null,2));fsyncSync(mf);}finally{closeSync(mf);}renameSync(manifest,path+'.json');
    inspect(name);if(reason==='automatic')prune();return metadata;
    }catch(e){for(const ownTemporary of [temporary,path+'.json.tmp'])if(existsSync(ownTemporary)&&dirname(realpathSync(ownTemporary)).toLowerCase()===realpathSync(directory).toLowerCase())try{unlinkSync(ownTemporary);}catch{}throw e;}
  }
  async function exclusive(run){if(busy)throw Error('备份或恢复正在进行，请稍后');busy=true;lastError='';try{return await run();}catch(e){lastError=e.message;throw e;}finally{busy=false;}}
  async function create(reason='manual'){return exclusive(()=>createFile(reason));}
  function preview(name){const item=inspect(name),schemaHash=hash(JSON.stringify(schema(db)));if(item.schema!==schemaHash)throw Error('备份的数据结构与当前程序不同，请使用匹配程序离线恢复');return {...item,old:summary(db),confirmation:hash(JSON.stringify([item.metadata.sha256,digest(db)]))};}
  async function restore(name,confirmation){return exclusive(async()=>{
    const before=preview(name);if(before.confirmation!==confirmation)throw Error('当前数据或备份已经变化，请重新查看恢复影响');
    const safety=await createFile('before-restore');if(preview(name).confirmation!==confirmation)throw Error('备份期间数据已变化，请重新确认恢复');
    db.prepare('ATTACH DATABASE ? AS restore_source').run(file(name));
    db.exec('PRAGMA foreign_keys=OFF');let begun=false;
    try{
      db.exec('BEGIN IMMEDIATE');begun=true;
      if(hash(JSON.stringify([before.metadata.sha256,digest(db)]))!==confirmation)throw Error('恢复前数据已变化，未覆盖任何记录');
      for(const {name:table} of before.old)db.exec('DELETE FROM main.'+quote(table));
      for(const {name:table} of before.old)db.exec('INSERT INTO main.'+quote(table)+' SELECT * FROM restore_source.'+quote(table));
      db.prepare("INSERT INTO service_state VALUES('generation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(randomUUID());
      for(const row of db.prepare('SELECT space,account,body FROM runtime_health').all()){const state={...JSON.parse(row.body),running:false,phase:'数据库已恢复，等待手动启动'};db.prepare('UPDATE runtime_health SET body=?,seen=? WHERE space=? AND account=?').run(JSON.stringify(state),now(),row.space,row.account);}
      if(db.prepare('PRAGMA main.foreign_key_check').all().length)throw Error('恢复后的关联数据校验失败');
      db.exec('COMMIT');begun=false;
    }catch(e){if(begun)db.exec('ROLLBACK');throw e;}finally{db.exec('PRAGMA foreign_keys=ON');db.exec('DETACH DATABASE restore_source');}
    return {ok:true,safetyBackup:safety.name,generation:recoveryGeneration(db),tables:summary(db)};
  });}
  async function scheduled(){const latest=list().find(m=>m.reason==='automatic');if(!busy&&(!latest||now()-latest.created>=intervalMs))await create('automatic');}
  return {list,inspect,preview,restore,create,scheduled,file,get busy(){return busy;},status(){const latest=list().find(m=>m.reason==='automatic');return {busy,error:lastError,intervalHours:intervalMs/3600000,keepAutomatic,nextAutomatic:latest?latest.created+intervalMs:now(),directory};}};
}

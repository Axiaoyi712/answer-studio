import {createHash} from 'node:crypto';
import {priceClaims,criticalClaims} from './fact-check.mjs';
import {modelNames} from './retrieval.mjs';
import {enrichedFacts,resolveReferences} from './product-data.mjs';

export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const factHash=f=>fingerprint([f.id,f.product,f.question,f.answer,f.source,...(f.data||f.reference?[f.data,f.reference]:[])]);
const normalized=text=>text.normalize('NFKC').toLowerCase().replace(/[\s，。！？?!｜|]/g,'');
export function setupKnowledgeState(db){
  db.exec(`CREATE TABLE IF NOT EXISTS fact_controls(fact TEXT PRIMARY KEY,space TEXT NOT NULL REFERENCES spaces(id),valid_from TEXT,valid_until TEXT,disabled INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS regression_cases(id TEXT PRIMARY KEY,space TEXT NOT NULL REFERENCES spaces(id),gap TEXT,question TEXT NOT NULL,expected TEXT NOT NULL,sources TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS regression_runs(id TEXT PRIMARY KEY,space TEXT NOT NULL REFERENCES spaces(id),signature TEXT NOT NULL,created INTEGER NOT NULL,passed INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS knowledge_gaps(id TEXT PRIMARY KEY,space TEXT NOT NULL REFERENCES spaces(id),record TEXT NOT NULL,question TEXT NOT NULL,reason TEXT NOT NULL,links TEXT NOT NULL,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS gap_checks(id TEXT PRIMARY KEY,gap TEXT NOT NULL,space TEXT NOT NULL REFERENCES spaces(id),signature TEXT NOT NULL,created INTEGER NOT NULL,passed INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS interview_progress(space TEXT NOT NULL REFERENCES spaces(id),topic TEXT NOT NULL,state TEXT NOT NULL,note TEXT NOT NULL,evidence TEXT NOT NULL,PRIMARY KEY(space,topic));`);
  if(!db.prepare('PRAGMA table_info(regression_cases)').all().some(c=>c.name==='checks'))db.exec("ALTER TABLE regression_cases ADD COLUMN checks TEXT NOT NULL DEFAULT '{}'");
}
export function controls(db,space){return db.prepare('SELECT * FROM fact_controls WHERE space=?').all(space);}
export function availability(control,now=Date.now()){
  if(control?.disabled)return 'disabled';
  if(control?.valid_from&&Date.parse(control.valid_from)>now)return 'scheduled';
  if(control?.valid_until&&Date.parse(control.valid_until)<=now)return 'expired';
  return 'active';
}
export function effectiveSnapshot(db,space,snapshot,now=Date.now()){
  const byId=new Map(controls(db,space).map(c=>[c.fact,c]));
  return {...snapshot,facts:resolveReferences(snapshot.facts.filter(f=>availability(byId.get(f.id),now)==='active'))};
}
export function draftSnapshot(db,space,now=Date.now()){
  const business=db.prepare('SELECT * FROM spaces WHERE id=?').get(space);if(!business)throw Error('业务不存在');
  return effectiveSnapshot(db,space,{rules:business.rules,facts:enrichedFacts(db,space).filter(f=>f.approved)},now);
}
export function activeSnapshot(db,space,now=Date.now()){
  const business=db.prepare('SELECT * FROM spaces WHERE id=?').get(space);if(!business?.active)throw Error('请先发布知识版本');
  const row=db.prepare('SELECT snapshot FROM versions WHERE id=? AND space=?').get(business.active,space);if(!row)throw Error('发布版本不存在');
  return {version:business.active,snapshot:effectiveSnapshot(db,space,JSON.parse(row.snapshot),now)};
}
export function versionSnapshot(db,space,version){
  const row=db.prepare('SELECT snapshot FROM versions WHERE id=? AND space=?').get(version,space);if(!row)throw Error('版本不存在或不属于当前业务');
  return effectiveSnapshot(db,space,JSON.parse(row.snapshot));
}
export function activationPreview(db,space,version){
  const business=db.prepare('SELECT * FROM spaces WHERE id=?').get(space);if(!business)throw Error('业务不存在');
  const next=versionSnapshot(db,space,version),old=business.active?activeSnapshot(db,space).snapshot:{rules:'',facts:[]},signature=suiteSignature(db,space,next);
  const latest=db.prepare('SELECT body FROM regression_runs WHERE space=? AND signature=? ORDER BY created DESC,rowid DESC LIMIT 1').get(space,signature);
  const raw=JSON.parse(db.prepare('SELECT snapshot FROM versions WHERE id=? AND space=?').get(version,space).snapshot);
  return {version,old,next,changed:fingerprint(old)!==fingerprint(next),excluded:raw.facts.length-next.facts.length,conflicts:conflicts(next),cases:db.prepare('SELECT COUNT(*) n FROM regression_cases WHERE space=?').get(space).n,run:latest?JSON.parse(latest.body):null,confirmation:fingerprint([business.active,fingerprint(old),version,signature])};
}
export function activateChecked(db,space,body){
  const preview=activationPreview(db,space,body.version);if(preview.confirmation!==body.confirmation)throw Error('版本、知识或回归题已经变化，请重新查看切换差异');
  if(!preview.next.facts.length)throw Error('目标版本没有当前可用知识，未切换');checkRelease(db,space,preview.next);
  db.prepare('UPDATE spaces SET active=? WHERE id=?').run(body.version,space);return {ok:true};
}
export function setFactControl(db,space,body){
  if(!db.prepare('SELECT id FROM facts WHERE id=? AND space=?').get(body.id,space))throw Error('知识不存在或不属于当前业务');
  const old=db.prepare('SELECT * FROM fact_controls WHERE fact=? AND space=?').get(body.id,space)||{};
  const date=(value,name)=>{if(value===null||value==='')return null;if(typeof value!=='string'||value.length>64||!Number.isFinite(Date.parse(value)))throw Error(name+'无效');return new Date(value).toISOString();};
  const from=body.validFrom===undefined?old.valid_from||null:date(body.validFrom,'生效时间'),until=body.validUntil===undefined?old.valid_until||null:date(body.validUntil,'失效时间');
  if(from&&until&&from>=until)throw Error('失效时间必须晚于生效时间');
  if(body.disabled!==undefined&&typeof body.disabled!=='boolean')throw Error('停用状态无效');
  const note=body.note===undefined?old.note||'':body.note;if(typeof note!=='string'||note.length>500)throw Error('备注最多500字');
  db.prepare('INSERT INTO fact_controls VALUES(?,?,?,?,?,?) ON CONFLICT(fact) DO UPDATE SET valid_from=excluded.valid_from,valid_until=excluded.valid_until,disabled=excluded.disabled,note=excluded.note').run(body.id,space,from,until,body.disabled===undefined?old.disabled||0:Number(body.disabled),note);
  return {ok:true};
}
export function conflicts(snapshot){
  const groups=[];
  for(const f of snapshot.facts){
    const aliases=f.question.split(/[？?！!\n｜|]/).map(normalized).filter(Boolean);
    const matches=groups.filter(g=>g.product===normalized(f.product)&&g.aliases.some(a=>aliases.includes(a)));
    const group=matches[0]||{product:normalized(f.product),aliases:[],facts:[]};if(!matches.length)groups.push(group);
    for(const other of matches.slice(1)){group.aliases.push(...other.aliases);group.facts.push(...other.facts);groups.splice(groups.indexOf(other),1);}
    group.aliases.push(...aliases);group.facts.push(f);
  }
  const result=groups.filter(g=>new Set(g.facts.map(f=>normalized(f.answer))).size>1).map(g=>({product:g.facts[0].product,facts:g.facts})),prices=new Map();
  for(const f of snapshot.facts){const ids=modelNames(f.product);if(ids.length>1)continue;for(const c of [...priceClaims(f),...criticalClaims(f)]){const key=JSON.stringify([ids[0]||normalized(f.product),c.field,c.scope||'']),group=prices.get(key)||[];group.push({fact:f,value:c.value});prices.set(key,group);}}
  for(const group of prices.values())if(new Set(group.map(c=>c.value)).size>1){const facts=[...new Map(group.map(c=>[c.fact.id,c.fact])).values()];if(!result.some(g=>facts.every(f=>g.facts.some(x=>x.id===f.id))))result.push({product:facts[0].product,facts});}
  return result;
}
export function resolveConflict(db,space,id){
  const group=conflicts(draftSnapshot(db,space)).find(g=>g.facts.some(f=>f.id===id));if(!group)throw Error('冲突已变化，请刷新后再处理');
  db.exec('BEGIN');try{for(const f of group.facts)if(f.id!==id)db.prepare('UPDATE facts SET approved=0 WHERE id=? AND space=?').run(f.id,space);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};
}
export function suiteSignature(db,space,snapshot){return fingerprint({snapshot,cases:db.prepare('SELECT * FROM regression_cases WHERE space=? ORDER BY id').all(space)});}
export function checkRelease(db,space,snapshot){
  if(conflicts(snapshot).length)throw Error('存在同商品的冲突答案、规格或政策，请先核实并选择保留内容');
  if(!db.prepare('SELECT id FROM regression_cases WHERE space=? LIMIT 1').get(space))return;
  const latest=db.prepare('SELECT passed FROM regression_runs WHERE space=? AND signature=? ORDER BY created DESC,rowid DESC LIMIT 1').get(space,suiteSignature(db,space,snapshot));
  if(!latest?.passed)throw Error('回归检查未通过或知识已变化，请先运行发布前检查');
}

import {randomUUID} from 'node:crypto';
import {answer,getSpace,required} from './core.mjs';
import {activeSnapshot,draftSnapshot,versionSnapshot,factHash,fingerprint,suiteSignature,controls,availability} from './knowledge-state.mjs';
import './edge-extension/handoff-reasons.js';
import {enrichedFacts,resolveReferences} from './product-data.mjs';

export const topics={catalog:'主营类目',specs:'商品规格与用途',pricing:'价格与计价单位',purchase:'购买流程',shipping:'运费、发货及预售',after_sales:'售后条件',exceptions:'例外与常见异常'};
export const progressStates={not_asked:'尚未询问',partial:'部分提供',confirmed:'已提供资料',unknown:'暂不清楚',deferred:'暂不提供',not_applicable:'不适用'};
export function readProgress(db,space){const rows=db.prepare('SELECT * FROM interview_progress WHERE space=?').all(space);return Object.entries(topics).map(([topic,label])=>({topic,label,state:'not_asked',note:'',...rows.find(r=>r.topic===topic)}));}
export function saveProgress(db,space,entry,evidence=[]){
  getSpace(db,space);if(!topics[entry.topic]||!progressStates[entry.state]||typeof entry.note!=='string'||entry.note.length>1000)throw Error('建库进度格式无效');
  db.prepare('INSERT INTO interview_progress VALUES(?,?,?,?,?) ON CONFLICT(space,topic) DO UPDATE SET state=excluded.state,note=excluded.note,evidence=excluded.evidence').run(space,entry.topic,entry.state,entry.note,JSON.stringify(evidence));return {ok:true};
}
export function syncGaps(db,space,legacy=[]){
  const rows=db.prepare("SELECT id,body,updated FROM reception WHERE space=? AND state IN ('handoff','manual','done') ORDER BY updated DESC").all(space);
  for(const row of rows){const r=JSON.parse(row.body);if(!globalThis.ZhidaHandoff.describe(r.reason,r.reasonCode).knowledgeGap||!r.question?.trim()||/^\[非文字消息\]$/.test(r.question))continue;
    const question=r.question.slice(0,2000),id=fingerprint([row.id,question]),links=legacy.filter(c=>c.key===id).map(c=>c.fact);
    db.prepare('INSERT OR IGNORE INTO knowledge_gaps VALUES(?,?,?,?,?,?,?)').run(id,space,row.id,question,String(r.reason||'').slice(0,500),JSON.stringify([...new Set(links)]),row.updated);
  }
}
export function listGaps(db,space){
  let active;try{active=activeSnapshot(db,space);}catch{}
  const control=new Map(controls(db,space).map(c=>[c.fact,c]));
  const all=enrichedFacts(db,space),resolved=resolveReferences(all);
  return db.prepare('SELECT * FROM knowledge_gaps WHERE space=? ORDER BY updated DESC,id').all(space).map(g=>{
    const ids=JSON.parse(g.links),facts=ids.map(id=>resolved.find(f=>f.id===id)).filter(Boolean);
    const signature=active?fingerprint({snapshot:active.snapshot,gap:g.question,links:ids}):'';
    const check=signature?db.prepare('SELECT * FROM gap_checks WHERE gap=? AND space=? AND signature=? ORDER BY created DESC,rowid DESC LIMIT 1').get(g.id,space,signature):null;
    let stage='待补充';
    if(facts.length===ids.length&&facts.length){
      if(facts.some(f=>availability(control.get(f.id))!=='active'||f.reference&&availability(control.get(f.reference))!=='active'))stage='知识已停用或失效';
      else if(facts.some(f=>!f.approved||f.reference&&!all.find(t=>t.id===f.reference)?.approved))stage='待审核';
      else if(!active||facts.some(f=>!active.snapshot.facts.some(p=>factHash(p)===factHash(f))))stage='待发布';
      else stage=check?(check.passed?'验证通过':'验证未通过'):'待验证';
    }
    return {...g,links:ids,stage,closed:stage==='验证通过',signature,lastCheck:check?{...JSON.parse(check.body),created:check.created}:null};
  });
}
export function linkGap(db,space,gap,fact,remove=false){
  const row=db.prepare('SELECT links FROM knowledge_gaps WHERE id=? AND space=?').get(gap,space);if(!row||(!remove&&!db.prepare('SELECT id FROM facts WHERE id=? AND space=?').get(fact,space)))throw Error('问题或知识不属于当前业务');
  const ids=JSON.parse(row.links);db.prepare('UPDATE knowledge_gaps SET links=?,updated=? WHERE id=? AND space=?').run(JSON.stringify(remove?ids.filter(id=>id!==fact):[...new Set([...ids,fact])]),Date.now(),gap,space);
}
function expectations(body){
  const expected=body.expected||[];if(!Array.isArray(expected)||expected.length>12||expected.some(t=>typeof t!=='string'||!t.trim()||t.length>200))throw Error('期望关键词无效');return expected.map(t=>t.trim());
}
export function saveRegression(db,space,body){
  getSpace(db,space);const question=required(body.question,'回归问题',2000),expected=expectations(body);
  const checks={expectedAction:body.expectedAction||'answer',forbidden:body.forbidden||[]};
  if(!['answer','clarify','handoff'].includes(checks.expectedAction)||!Array.isArray(checks.forbidden)||checks.forbidden.length>12||checks.forbidden.some(t=>typeof t!=='string'||!t.trim()||t.length>200))throw Error('期望动作或禁止关键词格式无效');
  const sourceIds=body.sources||[];if(!Array.isArray(sourceIds)||sourceIds.length>12||sourceIds.some(id=>!db.prepare('SELECT id FROM facts WHERE id=? AND space=?').get(id,space)))throw Error('回归知识不属于当前业务');
  if(!expected.length&&!sourceIds.length&&!checks.forbidden.length&&checks.expectedAction==='answer')throw Error('至少填写一个期望关键词，或关联一条应引用的知识');
  if(body.id&&!db.prepare('SELECT id FROM regression_cases WHERE id=? AND space=?').get(body.id,space))throw Error('回归题不存在');
  const id=body.id||randomUUID();db.prepare('INSERT INTO regression_cases(id,space,gap,question,expected,sources,checks) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET question=excluded.question,expected=excluded.expected,sources=excluded.sources,checks=excluded.checks').run(id,space,body.gap||null,question,JSON.stringify(expected),JSON.stringify(sourceIds),JSON.stringify(checks));return {id};
}
function checkReply(result,expected,sources){return result.action==='answer'&&!result.followUp?.questions.length&&expected.every(t=>result.answer.includes(t))&&sources.every(id=>result.sources.some(f=>f.id===id));}
export async function verifyGap(db,space,body,options={}){
  const gap=listGaps(db,space).find(g=>g.id===body.id);if(!gap||!['待验证','验证未通过','验证通过'].includes(gap.stage))throw Error('请先补充、审核并发布关联知识，再验证');
  const expected=expectations(body),active=activeSnapshot(db,space),signature=gap.signature;
  const result=await answer(active.snapshot,gap.question,[],options);
  if(fingerprint({snapshot:activeSnapshot(db,space).snapshot,gap:gap.question,links:gap.links})!==signature)throw Error('验证期间知识已变化，请重新验证');
  const passed=checkReply(result,expected,gap.links),report={passed,answer:result.answer,reason:result.reason,expected,sources:result.sources.map(f=>f.id),version:active.version};
  db.prepare('INSERT INTO gap_checks VALUES(?,?,?,?,?,?,?)').run(randomUUID(),gap.id,space,signature,Date.now(),Number(passed),JSON.stringify(report));
  if(passed){const old=db.prepare('SELECT id FROM regression_cases WHERE space=? AND gap=?').get(space,gap.id);saveRegression(db,space,{id:old?.id,gap:gap.id,question:gap.question,expected,sources:gap.links});}
  return report;
}
export async function runRegression(db,space,options={},version=null){
  const read=()=>version?versionSnapshot(db,space,version):draftSnapshot(db,space);
  const snapshot=read(),cases=db.prepare('SELECT * FROM regression_cases WHERE space=? ORDER BY id').all(space),signature=suiteSignature(db,space,snapshot);
  if(cases.length>50)throw Error('每次发布前检查最多50题，请先精简回归题');
  const results=[];
  for(const c of cases){try{
    let retrieved=[];const result=await answer(snapshot,c.question,[],{...options,onRetrieve:ids=>{retrieved=ids;}}),checks={expectedAction:'answer',forbidden:[],...JSON.parse(c.checks)},expected=JSON.parse(c.expected),sources=JSON.parse(c.sources);
    const actionPassed=result.action===checks.expectedAction,missingKeywords=expected.filter(t=>!result.answer.includes(t)),forbiddenFound=checks.forbidden.filter(t=>result.answer.includes(t)),citationPassed=sources.every(id=>result.sources.some(f=>f.id===id)),retrievalPassed=sources.length?sources.every(id=>retrieved.includes(id)):null;
    const passed=actionPassed&&!result.followUp?.questions.length&&!missingKeywords.length&&!forbiddenFound.length&&citationPassed;
    results.push({id:c.id,question:c.question,passed,actionPassed,contentPassed:!missingKeywords.length&&!forbiddenFound.length,citationPassed,retrievalPassed,missingKeywords,forbiddenFound,answer:result.answer,reason:result.reason});
  }catch(e){results.push({id:c.id,question:c.question,passed:false,reason:e.message});}}
  if(suiteSignature(db,space,read())!==signature)throw Error('检查期间知识或题目已变化，请重新检查');
  const report={passed:results.every(r=>r.passed),total:results.length,results};
  db.prepare('INSERT INTO regression_runs VALUES(?,?,?,?,?,?)').run(randomUUID(),space,signature,Date.now(),Number(report.passed),JSON.stringify(report));return report;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {database,createSpace,addFact,reviseFact,publish,answer} from '../core.mjs';
import {setFactControl,activeSnapshot,draftSnapshot,conflicts,resolveConflict} from '../knowledge-state.mjs';
import {syncGaps,listGaps,linkGap,verifyGap,runRegression,saveRegression,readProgress} from '../learning-quality.mjs';
import {setupRecords,saveRecord} from '../records.mjs';
import {observeConversation,mergeObserved} from '../conversation-memory.mjs';
import {heartbeat,healthState,metered,overview,reviewRecord} from '../operations.mjs';
import {createInterviewer} from '../knowledge-interview.mjs';
import {bridgeReply} from '../bridge.mjs';
const model=output=>({key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})})});
function fixture(){const db=database(':memory:');setupRecords(db);const space=createSpace(db,'文具');return {db,space};}
function pen(db,space,answer='P01为0.5mm黑色中性笔，单支2元。'){return addFact(db,space,{product:'P01',question:'P01多少钱？',answer,source:'合成资料'});}
const approve=(db,id)=>db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);

test('有效期和紧急停用覆盖历史快照，恢复不改原文，校验时间和跨业务输入',()=>{
  const {db,space}=fixture();try{const id=pen(db,space);approve(db,id);const version=publish(db,space),raw=db.prepare('SELECT snapshot FROM versions WHERE id=?').get(version).snapshot;
    setFactControl(db,space,{id,validUntil:new Date(Date.now()-1000).toISOString()});assert.equal(activeSnapshot(db,space).snapshot.facts.length,0);
    setFactControl(db,space,{id,validUntil:null,validFrom:new Date(Date.now()+60000).toISOString()});assert.equal(draftSnapshot(db,space).facts.length,0);
    setFactControl(db,space,{id,validFrom:null,disabled:true});assert.equal(activeSnapshot(db,space).snapshot.facts.length,0);
    setFactControl(db,space,{id,disabled:false});assert.equal(activeSnapshot(db,space).snapshot.facts.length,1);assert.equal(db.prepare('SELECT snapshot FROM versions WHERE id=?').get(version).snapshot,raw);
    assert.throws(()=>setFactControl(db,space,{id,validFrom:'2026-10-21',validUntil:'2026-10-20'}),/晚于/);
    assert.throws(()=>setFactControl(db,createSpace(db,'其他'),{id,disabled:true}),/不属于/);
    setFactControl(db,space,{id,disabled:true});db.prepare('DELETE FROM facts WHERE id=?').run(id);assert.equal(activeSnapshot(db,space).snapshot.facts.length,0);
  }finally{db.close();}
});
test('直接冲突阻止发布，明确选择保留项只撤回其他草稿审核，原版本不变',()=>{
  const {db,space}=fixture();try{const a=pen(db,space);approve(db,a);const version=publish(db,space),b=pen(db,space,'P01单支3元。');approve(db,b);
    assert.equal(conflicts(draftSnapshot(db,space)).length,1);assert.throws(()=>publish(db,space),/冲突/);resolveConflict(db,space,b);
    assert.equal(db.prepare('SELECT approved FROM facts WHERE id=?').get(a).approved,0);assert.equal(activeSnapshot(db,space).version,version);assert.match(activeSnapshot(db,space).snapshot.facts[0].answer,/2元/);assert.ok(publish(db,space));
  }finally{db.close();}
});
test('多个问法桥接成同一组时，不漏掉另一问法里的冲突',()=>{
  const groups=conflicts({facts:[{id:'a',product:'P01',question:'多少钱',answer:'2元'},{id:'b',product:'P01',question:'售价',answer:'3元'},{id:'c',product:'P01',question:'多少钱｜售价',answer:'2元'}]});assert.equal(groups.length,1);assert.equal(groups[0].facts.length,3);
});
test('知识缺口完整闭环：草稿不算解决，发布后验证，改动和过期重新打开；回归保护发布',async()=>{
  const {db,space}=fixture();try{saveRecord(db,{id:'gap',space,account:'a',conversation:'c',state:'handoff',question:'P01多少钱？',reason:'缺少价格资料'});syncGaps(db,space);const gap=listGaps(db,space)[0];assert.equal(gap.stage,'待补充');
    const id=pen(db,space);linkGap(db,space,gap.id,id);assert.equal(listGaps(db,space)[0].stage,'待审核');approve(db,id);assert.equal(listGaps(db,space)[0].stage,'待发布');publish(db,space);assert.equal(listGaps(db,space)[0].stage,'待验证');
    const partial=model({action:'answer',answer:'P01单支2元。',source_ids:[id],unanswered:['还要确认颜色']});assert.equal((await verifyGap(db,space,{id:gap.id},partial)).passed,false);
    const opts=model({action:'answer',answer:'P01单支2元。',source_ids:[id]});assert.equal((await verifyGap(db,space,{id:gap.id,expected:['2元']},opts)).passed,true);assert.equal(listGaps(db,space)[0].closed,true);
    assert.equal(db.prepare('SELECT count(*) n FROM regression_cases').get().n,1);assert.throws(()=>publish(db,space),/回归检查/);assert.equal((await runRegression(db,space,opts)).passed,true);assert.ok(publish(db,space));
    db.prepare('UPDATE spaces SET rules=? WHERE id=?').run('新规则',space);assert.throws(()=>publish(db,space),/回归检查/);await runRegression(db,space,opts);publish(db,space);assert.equal(listGaps(db,space)[0].stage,'待验证');
    await verifyGap(db,space,{id:gap.id},opts);setFactControl(db,space,{id,disabled:true});assert.equal(listGaps(db,space)[0].stage,'知识已停用或失效');assert.equal(listGaps(db,space)[0].closed,false);
    db.prepare('DELETE FROM reception WHERE id=?').run('gap');syncGaps(db,space);assert.equal(listGaps(db,space).length,1,'记录归档后知识缺口继续保留');
  }finally{db.close();}
});
test('回归题拒绝其他业务引用；检查中内容变化不能产生可发布的通过结果',async()=>{
  const {db,space}=fixture();try{const id=pen(db,space);approve(db,id);saveRegression(db,space,{question:'P01多少钱？',sources:[id]});
    const other=createSpace(db,'别的');assert.throws(()=>saveRegression(db,other,{question:'价格',sources:[id]}),/不属于/);
    const opts=model({action:'answer',answer:'P01单支2元。',source_ids:[id]}),fetcher=opts.fetcher;opts.fetcher=async(...args)=>{db.prepare('UPDATE spaces SET rules=? WHERE id=?').run('检查中修改',space);return fetcher(...args);};
    await assert.rejects(runRegression(db,space,opts),/已变化/);assert.equal(db.prepare('SELECT count(*) n FROM regression_runs').get().n,0);
  }finally{db.close();}
});
test('主题进度必须有经营者原话，不清楚的项目持久保存并进入后续上下文',async()=>{
  const {db,space}=fixture();try{let seen;const service=createInterviewer(db,{key:'test',fetcher:async(_,o)=>{const c=JSON.parse(JSON.parse(o.body).messages[1].content);seen=c;const user=c.dialogue.filter(m=>m.role==='user').at(-1);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'继续聊售后。',facts:[],progress:[{topic:'shipping',state:'unknown',note:'运费未确认',evidence:[{turn_id:user.id,quote:user.content}]}]})}}]})};}});
    await service.turn(space,{message:'运费暂不清楚',requestId:'one'});assert.equal(readProgress(db,space).find(p=>p.topic==='shipping').state,'unknown');await service.turn(space,{message:'还有什么需要补充？',requestId:'two'});assert.equal(seen.progress.find(p=>p.topic==='shipping').state,'unknown');
    const bad=createInterviewer(db,{key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'收到',facts:[],progress:[{topic:'pricing',state:'confirmed',note:'价格已齐',evidence:[{turn_id:'foreign',quote:'10元'}]}]})}}]})})});
    await assert.rejects(bad.turn(space,{message:'你好',requestId:'bad'}),/原话/);assert.equal(readProgress(db,space).find(p=>p.topic==='pricing').state,'not_asked');
  }finally{db.close();}
});
test('长期需求记录隔离业务、账号和客户，只保存观测消息；超出120回合仍保留型号和偏好',()=>{
  const {db,space}=fixture();try{observeConversation(db,space,'a','c',[],'我要P01，不要蓝色');let result;for(let i=0;i<140;i++)result=observeConversation(db,space,'a','c',[],'补充说明'+i);
    assert.equal(result.context.product,'p01');assert.ok(result.context.preferences.some(t=>t.includes('蓝色：不接受')));assert.equal(result.history.length,120);
    assert.equal(observeConversation(db,space,'b','c',[],'价格呢').context.product,'');assert.equal(observeConversation(db,space,'a','d',[],'价格呢').context.product,'');assert.equal(observeConversation(db,createSpace(db,'另一个'),'a','c',[],'价格呢').context.product,'');
    assert.equal(observeConversation(db,space,'a','c',[],'换成P02').context.product,'p02');assert.equal(observeConversation(db,space,'a','c',[],'换个其他款').context.product,'');
    assert.throws(()=>observeConversation(db,space,'a',null,[],'问题'),/标识/);
    const rows=db.prepare('SELECT body FROM conversation_memory').all();assert.ok(rows.every(r=>JSON.parse(r.body).history.every(m=>m.role==='user')));
    assert.deepEqual(mergeObserved([{role:'user',content:'一'}],[{role:'user',content:'一'},{role:'assistant',content:'二'}]).map(m=>m.content),['一','二']);
  }finally{db.close();}
});
test('多诉求召回不同商品的资料，仅未答部分进入人工；长对话指代可使用已保存型号',async()=>{
  const pen={id:'pen',product:'P01',question:'笔多少钱',answer:'P01单支2元。'},paper={id:'paper',product:'A4纸',question:'纸多少张',answer:'A4纸每包500张。'};let evidence;
  const opts=model({action:'answer',answer:'P01单支2元，A4纸每包500张。',source_ids:['pen','paper'],unanswered:['是否可以刻字？']});const original=opts.fetcher;
  opts.fetcher=async(_,o)=>{evidence=JSON.parse(JSON.parse(o.body).messages[0].content.split('证据：')[1]);return original();};
  const result=await answer({facts:[pen,paper],rules:''},'P01多少钱？另外A4纸多少张，能刻字吗？',[],opts);assert.equal(evidence.length,2);assert.equal(result.action,'answer');assert.deepEqual(result.followUp.questions,['是否可以刻字？']);assert.match(result.answer,/不好意思，请稍等$/);
  evidence=[];const r=await answer({facts:[pen],rules:''},'多少钱呢',[],{...opts,context:{product:'p01',preferences:[]},fetcher:async(_,o)=>{evidence=JSON.parse(JSON.parse(o.body).messages[0].content.split('证据：')[1]);return model({action:'answer',answer:'P01单支2元。',source_ids:['pen']}).fetcher();}});assert.equal(evidence[0].id,'pen');assert.equal(r.action,'answer');
  const ambiguous={...paper,question:'A4纸多少钱？'};await answer({facts:[pen,ambiguous],rules:''},'刚说那款多少钱？',[],{...opts,context:{product:'p01'},fetcher:async(_,o)=>{evidence=JSON.parse(JSON.parse(o.body).messages[0].content.split('证据：')[1]);return model({action:'answer',answer:'P01单支2元。',source_ids:['pen']}).fetcher();}});assert.deepEqual(evidence.map(f=>f.id),['pen'],'长对话指代不能混入另一个商品的价格');
});
test('生成期间被紧急停用，旧模型答案不可交付；记忆没有把草稿存为已发回复',async()=>{
  const {db,space}=fixture();try{const id=pen(db,space);approve(db,id);publish(db,space);const opts=model({action:'answer',answer:'P01单支2元。',source_ids:[id]}),original=opts.fetcher;opts.fetcher=async()=>{setFactControl(db,space,{id,disabled:true});return original();};
    const r=await bridgeReply(db,{space,account:'a',conversation:'c',question:'P01多少钱？'},opts);assert.equal(r.action,'handoff');assert.equal(r.knowledgeSignature,undefined);assert.equal(JSON.parse(db.prepare('SELECT body FROM conversation_memory').get().body).history.some(m=>m.role==='assistant'),false);
  }finally{db.close();}
});
test('旧客户端不支持部分接待时整体交人工，新客户端收到分开处理的结构',async()=>{
  const {db,space}=fixture();try{const id=pen(db,space);approve(db,id);publish(db,space);const opts=model({action:'answer',answer:'P01单支2元。',source_ids:[id],unanswered:['能刻字吗？']}),body={space,question:'P01多少钱，能刻字吗？'};
    assert.equal((await bridgeReply(db,body,opts)).action,'handoff');const current=await bridgeReply(db,{...body,partialReplies:true},opts);assert.equal(current.action,'answer');assert.equal(current.followUp.questions.length,1);
  }finally{db.close();}
});
test('独立心跳识别页面停滞、读取失败、模型失败和积压；暂停不报运行故障',()=>{
  const now=Date.now(),value={running:true,lastRead:now,pending:0,failures:0};assert.equal(healthState(value,now,now).state,'healthy');assert.equal(healthState(value,now-121000,now).state,'error');assert.equal(healthState({...value,lastRead:now-121000},now,now).state,'error');assert.equal(healthState({...value,failures:3},now,now).state,'error');assert.equal(healthState({...value,pending:2,lastModel:now-301000},now,now).state,'waiting');assert.equal(healthState({...value,running:false},0,now).state,'paused');
});
test('看板样本不把已回复当成解决，等待时间从首次任务计算，测试用量与接待分开',async()=>{
  const {db,space}=fixture();try{const now=Date.now(),row={id:'r',space,account:'a',conversation:'c',state:'handoff',question:'P01能刻字吗？',reason:'缺少知识'};saveRecord(db,row,now-600000);saveRecord(db,{...row,firstSeen:now},now-1000);
    heartbeat(db,space,{account:'a',running:true,lastRead:now},now);assert.equal(overview(db,space,7,now).waiting[0].minutes,10);assert.equal(overview(db,space,7,now).review.correctRate,null);
    saveRecord(db,{...row,state:'answer',answer:'测试答复'},now);assert.equal(overview(db,space,7,now).review.resolved,0);reviewRecord(db,space,{id:'r',correct:true});reviewRecord(db,space,{id:'r',resolved:true});assert.equal(overview(db,space,7,now).review.correctRate,100);assert.equal(overview(db,space,7,now).review.resolved,1);
    const opts={fetcher:async()=>({ok:true,json:async()=>({usage:{prompt_tokens:12,completion_tokens:3}})})};const run=async o=>{await (await o.fetcher()).json();return {action:'answer'};};await metered(db,space,'test',opts,run);await metered(db,space,'reception',opts,run);const report=overview(db,space,7,Date.now());assert.equal(report.metrics.requests,1);assert.equal(report.metrics.inputTokens,12);assert.equal(report.metrics.outputTokens,3);
    assert.throws(()=>reviewRecord(db,createSpace(db,'其他'),{id:'r',correct:true}),/不存在/);assert.throws(()=>heartbeat(db,space,{account:'a',running:true,failures:-1}),/计数/);
  }finally{db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {answer,database,createSpace,addFact,reviseFact,publish} from '../core.mjs';
import {checkFacts} from '../fact-check.mjs';
import {conflicts,activeSnapshot,draftSnapshot,setFactControl} from '../knowledge-state.mjs';
import {setReference} from '../product-data.mjs';
import {setupRecords,saveRecord,archiveAuxiliary,archiveBrowserRecords} from '../records.mjs';
import {webcrypto} from 'node:crypto';
import {saveRegression,runRegression} from '../learning-quality.mjs';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {memoryContext} from '../conversation-memory.mjs';
import '../edge-extension/inbox-policy.js';
test('口语政策否定与跨句例外不能颠倒或遗漏',()=>{
 assert.equal(checkFacts('开不了发票',[{answer:'支持开发票。'}]).ok,false);
 assert.equal(checkFacts('支持退货',[{answer:'支持退货。定制商品除外。'}]).ok,false);
 assert.equal(checkFacts('支持退货，定制除外',[{answer:'支持退货。定制商品除外。'}]).ok,true);
 assert.equal(checkFacts('开不了纸质发票',[{answer:'不支持纸质发票。'}]).ok,true);
});
test('同一句最新的未确定型号覆盖前面的选中项',()=>{
 const r=memoryContext([{role:'user',content:'想要P01，P01不一定可以'}]);assert.equal(r.product,'');assert.deepEqual(r.excludedModels,[]);
});
test('否定投诉和否定人工请求可继续咨询，真实投诉或要求人工仍交待办',async()=>{
 const snapshot={rules:'',facts:[{id:'f',product:'P01',question:'P01规格是什么？',answer:'P01为0.5mm中性笔。'}]},options={key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'answer',answer:'P01为0.5mm中性笔。',source_ids:['f']})}}]})})};
 for(const question of ['不是投诉，我想了解P01的规格','不用转人工，P01是什么规格'])assert.equal((await answer(snapshot,question,[],options)).action,'answer',question);
 for(const question of ['我不是问规格，我要投诉','不用解释了，转人工','我要投诉，不是问退款规则'])assert.equal((await answer(snapshot,question,[],options)).action,'handoff',question);
});
test('不同问法里的同商品单价矛盾也会阻止发布',()=>{
 assert.equal(conflicts({facts:[{id:'a',product:'P01',question:'P01多少钱？',answer:'单支2元。'},{id:'b',product:'P01',question:'单支售价是多少？',answer:'单支3元。'}]}).length,1);
 assert.equal(conflicts({facts:[{id:'a',product:'P01',question:'单支价格',answer:'单支2元。'},{id:'b',product:'P01',question:'整盒价格',answer:'一盒20元。'}]}).length,0);
});
test('其他账号前十条待同步记录不会挡住当前账号',async()=>{
 const store=Object.fromEntries(Array.from({length:10},(_,i)=>['reception-outbox:other'+i,{account:'other',space:'s'}]));store['reception-outbox:mine']={account:'mine',space:'s'};let sent=0;
 const ctx={chrome:{storage:{local:{get:async()=>({...store}),remove:async key=>{delete store[key];}}}}};vm.runInNewContext(readFileSync('edge-extension/reception.js','utf8'),ctx);Object.assign(ctx.ZhidaReception,{account:'mine',space:'s'});await ctx.ZhidaReception.flush(async()=>{sent++;});assert.equal(sent,1);assert.equal(Object.keys(store).length,10);
});
test('队列优先等待更久的客户，未读和已读待办都可轮转',()=>{
 const targets=[{id:'new',kind:'c2c',unread:1},{id:'old',kind:'c2c',unread:0}];
 assert.equal(ZhidaInboxPolicy.next(targets,new Set(),'current',[{id:'old',state:'pending',time:1},{id:'new',state:'pending',time:20}]).id,'old');
});
test('统一资料一次修改驱动引用，审核发布之前保持历史价格，停用联动生效',()=>{
 const db=database(':memory:'),space=createSpace(db,'测试');try{
  const data={aliases:['考试水笔'],specs:'0.5mm黑色',price:{amount:2,unit:'支'},policies:[{topic:'开票',allowed:true,variant:'电子',conditions:['付款后'],exceptions:[]}]};
  const id=addFact(db,space,{product:'P01',question:'P01说明',source:'合成资料',data}),faq=addFact(db,space,{product:'P01',question:'单支多少钱？',answer:'原文本',source:'原来源'});setReference(db,space,faq,id);
  db.exec('UPDATE facts SET approved=1');publish(db,space);assert.match(activeSnapshot(db,space).snapshot.facts.find(f=>f.id===faq).answer,/2元/);
  reviseFact(db,space,{id,product:'P01',question:'P01说明',source:'修正资料',data:{...data,price:{amount:.29,unit:'支'}}});
  assert.equal(draftSnapshot(db,space).facts.length,0);assert.throws(()=>publish(db,space),/统一资料尚未审核/);assert.match(activeSnapshot(db,space).snapshot.facts.find(f=>f.id===faq).answer,/2元/);
  db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);assert.match(draftSnapshot(db,space).facts.find(f=>f.id===faq).answer,/0.29元/);publish(db,space);
  assert.match(activeSnapshot(db,space).snapshot.facts.find(f=>f.id===faq).answer,/0.29元/);setFactControl(db,space,{id,disabled:true});assert.equal(activeSnapshot(db,space).snapshot.facts.length,0);
  assert.throws(()=>setReference(db,createSpace(db,'其他'),faq,id),/不属于/);
 }finally{db.close();}
});
test('统一政策的任意前提条件和跨行例外必须保留',()=>{
 const data={aliases:[],specs:'',price:null,policies:[{topic:'退货',allowed:true,variant:'',conditions:['凭购买凭证'],exceptions:['定制']}]};
 const fact={product:'P01',answer:'仅限凭购买凭证，支持退货。定制除外。',data};
 assert.equal(checkFacts('凭购买凭证支持退货，定制除外。',[fact]).ok,true);assert.equal(checkFacts('支持退货，定制除外。',[fact]).ok,false);
 assert.equal(checkFacts('支持退货。',[{answer:'支持退货。\n定制商品除外。'}]).ok,false);
});
test('统一资料保存失败回滚问答与审核状态，兼容外层建库事务',()=>{
 const db=database(':memory:'),space=createSpace(db,'测试'),data={price:{amount:2,unit:'支'}};try{
  db.exec("CREATE TRIGGER fail_data BEFORE INSERT ON product_data BEGIN SELECT RAISE(ABORT,'模拟字段写入失败'); END");assert.throws(()=>addFact(db,space,{product:'P01',question:'P01价格',source:'资料',data}),/模拟/);assert.equal(db.prepare('SELECT COUNT(*) n FROM facts').get().n,0);db.exec('DROP TRIGGER fail_data');
  const id=addFact(db,space,{product:'P01',question:'P01价格',source:'资料',data});db.exec('UPDATE facts SET approved=1');db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON product_data BEGIN SELECT RAISE(ABORT,'模拟字段更新失败'); END");db.exec('BEGIN');assert.throws(()=>reviseFact(db,space,{id,product:'P01',question:'P01价格',source:'新资料',data:{price:{amount:3,unit:'支'}}}),/模拟/);assert.equal(db.prepare('SELECT approved FROM facts WHERE id=?').get(id).approved,1);assert.match(db.prepare('SELECT answer FROM facts WHERE id=?').get(id).answer,/2元/);db.exec('ROLLBACK');
 }finally{db.close();}
});
test('接待阶段保留事件轨迹，重复刷新不重复写同一阶段',()=>{
 const db=database(':memory:');setupRecords(db);const space=createSpace(db,'测试'),record={id:'r',space,account:'a',conversation:'c',state:'pending',question:'问规格'};
 try{saveRecord(db,{...record,stage:'received'},1);saveRecord(db,{...record,stage:'received'},2);saveRecord(db,{...record,stage:'generated',answer:'答复'},3);assert.equal(db.prepare('SELECT COUNT(*) n FROM reception_events').get().n,2);assert.equal(db.prepare('SELECT state FROM reception').get().state,'pending');db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON reception_events BEGIN SELECT RAISE(ABORT,'模拟事件写入失败'); END");assert.throws(()=>saveRecord(db,{...record,state:'answer'},4),/模拟/);assert.equal(db.prepare('SELECT state FROM reception').get().state,'pending');}finally{db.close();}
});
test('90天运行资料先校验归档再清理，未完成客户记忆保留，写入失败不清理',()=>{
 const db=database(':memory:');setupRecords(db);const space=createSpace(db,'测试'),now=Date.now(),old=now-91*86400000,dir=mkdtempSync(join(tmpdir(),'zhida-retention-'));
 try{
  db.prepare('INSERT INTO model_metrics VALUES(?,?,?,?,?)').run('old',space,'reception',old,'{}');db.prepare('INSERT INTO conversation_memory VALUES(?,?,?,?,?)').run(space,'a','open','{}',old);db.prepare('INSERT INTO conversation_memory VALUES(?,?,?,?,?)').run(space,'a','done','{}',old);
  saveRecord(db,{id:'open',space,account:'a',conversation:'open',state:'handoff'},old);
  const blocked=join(dir,'blocked');writeFileSync(blocked,'file');assert.throws(()=>archiveAuxiliary(db,blocked,now));assert.equal(db.prepare('SELECT COUNT(*) n FROM model_metrics').get().n,1);
  const r=archiveAuxiliary(db,join(dir,'archives'),now),bundle=JSON.parse(readFileSync(r.file));assert.equal(bundle.tables.model_metrics.length,1);assert.equal(bundle.tables.conversation_memory[0].conversation,'done');assert.equal(db.prepare('SELECT COUNT(*) n FROM model_metrics').get().n,0);assert.equal(db.prepare('SELECT conversation FROM conversation_memory').get().conversation,'open');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('质量题可检查应当追问和禁止内容，分别报告召回及答复检查',async()=>{
 const db=database(':memory:'),space=createSpace(db,'测试');try{
  const id=addFact(db,space,{product:'P01',question:'P01多少钱？',answer:'P01单支2元。',source:'合成资料'});db.exec('UPDATE facts SET approved=1');
  saveRegression(db,space,{question:'你好',expectedAction:'clarify',forbidden:['智能助手']});saveRegression(db,space,{question:'P01多少钱？',expected:['2元'],sources:[id],forbidden:['保证']});
  const options={key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'answer',answer:'P01单支2元，保证合适。',source_ids:[id]})}}]})})};
  const r=await runRegression(db,space,options);assert.equal(r.passed,false);const price=r.results.find(x=>x.question==='P01多少钱？');assert.equal(price.retrievalPassed,true);assert.equal(price.contentPassed,false);assert.deepEqual(price.forbiddenFound,['保证']);assert.equal(r.results.find(x=>x.question==='你好').passed,true);
 }finally{db.close();}
});
test('浏览器旧任务须收到匹配的持久归档回执后才清理，人工状态和未知发送保留',async()=>{
 const old=Date.now()-91*86400000,key='inbox:'+JSON.stringify(['a','c',['m']]),task='reception-task:'+JSON.stringify(['a','c']),caseKey='inbox-case:'+JSON.stringify(['a','c']);
 const store={[key]:{state:'echo-confirmed',time:old},[task]:{id:'c',state:'done',time:old},[caseKey]:{state:'active',handled:['m']},['inbox:'+JSON.stringify(['a','c',['unknown']])]:{state:'unknown',time:old}},dir=mkdtempSync(join(tmpdir(),'zhida-browser-archive-'));
 const ctx={crypto:webcrypto,TextEncoder,chrome:{storage:{local:{get:async key=>key===null?{...store}:{[key]:store[key]},remove:async key=>{delete store[key];}}}}};vm.runInNewContext(readFileSync('edge-extension/reception.js','utf8'),ctx);
 try{
  await assert.rejects(ctx.ZhidaReception.archive('a',async()=>({sha256:'bad',count:2})),/不匹配/);assert.ok(store[key]);
  const r=await ctx.ZhidaReception.archive('a',async(_,body)=>archiveBrowserRecords(dir,body));assert.equal(r.count,2);assert.equal(JSON.parse(readFileSync(join(dir,r.file))).entries.length,2);assert.ok(!store[key]&&!store[task]);assert.ok(store[caseKey]);assert.equal(Object.values(store).some(v=>v.state==='unknown'),true);
  assert.throws(()=>archiveBrowserRecords(dir,{account:'b',entries:[[key,{state:'echo-confirmed',time:old}]]}),/本账号/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('断网时同一任务各阶段独立暂存，恢复后按顺序同步且不丢失中间阶段',async()=>{
 const store={},ctx={crypto:webcrypto,TextEncoder,chrome:{storage:{local:{get:async k=>k===null?{...store}:{[k]:store[k]},set:async values=>Object.assign(store,values),remove:async k=>{delete store[k];}}}}};vm.runInNewContext(readFileSync('edge-extension/reception.js','utf8'),ctx);const ops=ctx.ZhidaReception;ops.account='a';ops.space='s';const snap={account:'a',conversation:{id:'c'},messages:[{id:'m',role:'user',content:'问题'}]};
 for(const stage of ['received','generated','sending'])await ops.record(snap,{state:'pending',stage,ids:['m']},async()=>{throw Error('offline');});
 assert.equal(Object.keys(store).filter(k=>k.startsWith('reception-outbox:')).length,3);const phases=[];await ops.flush(async(_,body)=>phases.push(body.record.stage));assert.deepEqual(phases,['received','generated','sending']);assert.equal(Object.keys(store).filter(k=>k.startsWith('reception-outbox:')).length,0);
});

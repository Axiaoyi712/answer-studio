import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryContext,observeConversation} from '../conversation-memory.mjs';
import {database,createSpace,addFact,publish,reviseFact,retrieve} from '../core.mjs';
import {createReceptionService} from '../reception-service.mjs';
import {activationPreview,activateChecked,setFactControl} from '../knowledge-state.mjs';
import {saveRegression,runRegression} from '../learning-quality.mjs';
import {createBackupManager,recoveryGeneration} from '../backups.mjs';
import {setupRecords} from '../records.mjs';
import {checkFacts} from '../fact-check.mjs';
import {mkdtempSync,rmSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const history=(...messages)=>messages.map(content=>({role:'user',content}));
test('小知识库的政策短问题能召回规则，退货与退款仍分别检索',()=>{
  for(const [question,answer] of [['退货有什么条件？','未拆封支持退货。'],['能开发票吗？','支持开票。'],['提供保修吗？','支持保修。']])assert.equal(retrieve([{id:'policy',product:'经营规则',question:'规则说明',answer}],question)[0]?.id,'policy');
  assert.equal(retrieve([{id:'refund',product:'退款规则',question:'支持退款吗',answer:'支持退款。'}],'退货有什么条件？').length,0);
});
test('政策答复不能颠倒肯定否定或省略条件，澄清不误当承诺',()=>{
  for(const [answer,evidence] of [
    ['不支持开发票','支持开发票。'],['可以开票','不支持开发票。'],
    ['支持退货','未拆封才支持退货。'],['支持退款','仅限未使用的商品支持退款。'],
    ['可以试用','不提供试用。'],['不支持保修','支持保修。'],
    ['支持退货','支持换货，不支持退货。'],['支持纸质发票','仅支持电子发票。'],
    ['支持退货','支持退货，定制商品除外。'],['支持退款','需要核实订单后才可以退款。'],
    ['支持开发票','付款后才支持开发票。'],['不支持开票','支持电子发票，不支持纸质发票。'],
    ['不满100元支持开票','满100元支持开票。'],['不是未拆封的商品支持退货','未拆封的商品支持退货。']
  ])assert.equal(checkFacts(answer,[{answer:evidence}]).ok,false,answer+' / '+evidence);
  for(const [answer,evidence] of [
    ['可以开票','支持开发票。'],['不能开票','不提供发票。'],
    ['未拆封可以退货','未拆封才支持退货。'],['未使用的商品可以退款','仅限未使用的商品支持退款。'],
    ['请问需要开票吗？',''],['开票规则需要确认',''],['不需要开票的话可以不填抬头',''],
    ['支持退货，定制除外','支持退货，定制商品除外。'],['付款后可以开票','付款后才支持开发票。'],['不支持纸质发票','不支持开发票。']
  ])assert.equal(checkFacts(answer,[{answer:evidence}]).ok,true,answer+' / '+evidence);
});
test('政策校验按商品隔离，真实引用也不能支持反向政策，回归检查同样拦截',async()=>{
  const facts=[{id:'a',product:'P01',question:'能开票吗？',answer:'P01支持开发票。'},{id:'b',product:'P02',question:'能开票吗？',answer:'P02不支持开发票。'}];
  assert.equal(checkFacts('P01不支持开发票。',facts).ok,false);assert.equal(checkFacts('P02不支持开发票。',facts).ok,true);
  const {db,space}=fixture();try{
    const id=addFact(db,space,{product:'开票规则',question:'支持开票吗？',answer:'支持开发票。',source:'合成资料'});db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);publish(db,space);
    saveRegression(db,space,{question:'支持开票吗？',sources:[id]});
    const result=await runRegression(db,space,{key:'test',fetcher:async()=>output(id,'不支持开发票。')});assert.equal(result.passed,false);assert.match(result.results[0].reason,/核对未通过/);
  }finally{db.close();}
});
test('口语改口覆盖旧偏好，含糊说法不继续保留确定偏好',()=>{
  for(const no of ['蓝色不行','蓝色不合适','蓝色不能接受','蓝色还是算了']){
    const c=memoryContext(history('蓝色也可以',no+'，黑色可以'));
    assert.ok(c.preferences.includes('蓝色：不接受'),no);assert.ok(c.preferences.includes('黑色：可以'),no);
  }
  assert.ok(!memoryContext(history('蓝色可以','蓝色不一定可以')).preferences.includes('蓝色：可以'));
  assert.equal(memoryContext(history('要P01','P01不合适，换成P02')).product,'p02');
});
test('否定型号不会变成选中项，改口和取消排除各自生效',()=>{
  let c=memoryContext(history('我想买P01','不要P02'));assert.equal(c.product,'p01');assert.deepEqual(c.excludedModels,['p02']);
  c=memoryContext(history('想买P01','不是P01，要P02'));assert.equal(c.product,'p02');assert.ok(c.excludedModels.includes('p01'));
  c=memoryContext(history('不要P01和P02'));assert.equal(c.product,'');assert.deepEqual(c.excludedModels,['p01','p02']);
  c=memoryContext(history('要P01','不要P02','取消排除P02'));assert.equal(c.product,'p01');assert.deepEqual(c.excludedModels,[]);
  c=memoryContext(history('不要P02','改成P02'));assert.equal(c.product,'p02');assert.deepEqual(c.excludedModels,[]);
});
test('颜色和预算采用最新明确说法，重置可清除偏好，旧格式记忆不延续错误型号',()=>{
  const c=memoryContext(history('不要蓝色','预算100元','蓝色也可以','预算改成200元'));assert.ok(c.preferences.includes('蓝色：可以'));assert.ok(!c.preferences.some(p=>p.includes('不接受')));assert.ok(!c.preferences.some(p=>p.includes('100')));
  assert.equal(memoryContext(history('之前的需求作废'),c).preferences.length,0);
  assert.equal(memoryContext([],{product:'p02',preferences:['不要蓝色']}).product,'');
  const colors=memoryContext(history('不要蓝色，想要黑色'));assert.ok(colors.preferences.includes('黑色：可以'));assert.ok(colors.preferences.includes('蓝色：不接受'));assert.equal(memoryContext(history('颜色不限'),colors).preferences.length,0);
});
test('修正后的记忆经过120条窗口滚动和重新读取不会复活旧排除条件',()=>{
  const db=database(':memory:'),space=createSpace(db,'测试');try{
    observeConversation(db,space,'a','b',[],'要P01，不要蓝色');observeConversation(db,space,'a','b',[],'蓝色也可以，不要P02');
    for(let i=0;i<130;i++)observeConversation(db,space,'a','b',[],'其他背景'+i);
    const c=observeConversation(db,space,'a','b',[],'刚说那款多少钱').context;assert.equal(c.product,'p01');assert.ok(c.preferences.includes('蓝色：可以'));assert.ok(c.excludedModels.includes('p02'));
  }finally{db.close();}
});
function fixture(){const db=database(':memory:');setupRecords(db);const space=createSpace(db,'测试'),id=addFact(db,space,{product:'P01',question:'P01多少钱？',answer:'P01单支2元。',source:'合成资料'});db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);publish(db,space);return {db,space,id};}
const output=(id,answer='P01单支2元。')=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'answer',answer,source_ids:[id]})}}]})});
test('慢会话有总超时，其他会话可完成，超时迟到结果不会再写数据',async()=>{
  const {db,space,id}=fixture();let late;try{
    const service=createReceptionService(db,{key:'test',timeoutMs:35,fetcher:async(_,o)=>JSON.parse(o.body).messages.at(-1).content.includes('slow')?new Promise(resolve=>late=resolve):output(id)});
    const slow=service.reply({space,account:'a',conversation:'slow',question:'P01 slow多少钱？'});const fast=await service.reply({space,account:'a',conversation:'fast',question:'P01多少钱？'});assert.equal(fast.action,'answer');
    const r=await slow;assert.equal(r.timedOut,true);assert.equal(r.action,'handoff');assert.equal(r.answer,'不好意思，请稍等');assert.equal(service.active,0);
    const count=db.prepare('SELECT COUNT(*) n FROM model_metrics').get().n;late(output(id));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(db.prepare('SELECT COUNT(*) n FROM model_metrics').get().n,count);
  }finally{db.close();}
});
test('连续模型故障短暂冷却，冷却内不重试计费，时间到后恢复',async()=>{
  const {db,space,id}=fixture();let time=Date.now(),calls=0,online=false;try{
    const service=createReceptionService(db,{key:'test',now:()=>time,cooldownMs:100,fetcher:async()=>{calls++;if(!online)throw Error('offline');return output(id);}}),body={space,question:'P01多少钱？'};
    for(let i=0;i<3;i++)assert.equal((await service.reply(body)).action,'handoff');assert.equal(calls,3);assert.ok((await service.reply(body)).retryAfterMs);assert.equal(calls,3);
    time+=101;online=true;assert.equal((await service.reply(body)).action,'answer');assert.equal(calls,4);
  }finally{db.close();}
});
test('冷却期间问候和致谢仍本地接待，混合商品问题不凭空作答或泄漏配置',async()=>{
  const {db,space}=fixture();let time=Date.now(),calls=0;try{
    const service=createReceptionService(db,{key:'test',now:()=>time,cooldownMs:100,fetcher:async()=>{calls++;throw Error('offline');}});
    for(let i=0;i<3;i++)await service.reply({space,question:'P01多少钱？'});
    for(const question of ['你好','谢谢','好的，谢谢']){
      const r=await service.reply({space,question,account:'a',conversation:'c'});assert.equal(r.action,'clarify');assert.equal(r.engine,'rules');assert.ok(!r.modelCalled);
    }
    const r=await service.reply({space,question:'你好，P01多少钱？'});assert.equal(r.action,'handoff');assert.equal(r.answer,'不好意思，请稍等');assert.ok(r.retryAfterMs);assert.equal(calls,3);
    assert.equal((await service.reply({space,question:'转人工'})).reasonCode,'manual-request');
    await service.reply({space:'missing',question:'你好'});assert.equal(calls,3);
    time+=101;await service.reply({space,question:'P01多少钱？'});assert.equal(calls,4);
  }finally{db.close();}
});
test('历史版本检查使用目标快照，草稿通过不能替历史版本通过，旧确认不能复用',async()=>{
  const {db,space,id}=fixture();try{
    const old=db.prepare('SELECT active FROM spaces WHERE id=?').get(space).active;
    reviseFact(db,space,{id,product:'P01',question:'P01多少钱？',answer:'P01单支3元。',source:'新资料'});db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);publish(db,space);
    saveRegression(db,space,{question:'P01多少钱？',expected:['3元'],sources:[id]});const fetcher=async(_,o)=>{const facts=JSON.parse(JSON.parse(o.body).messages[0].content.split('证据：')[1]);return output(id,facts[0].answer);};
    await runRegression(db,space,{key:'test',fetcher});let p=activationPreview(db,space,old);assert.throws(()=>activateChecked(db,space,{version:old,confirmation:p.confirmation}),/回归检查/);
    assert.equal((await runRegression(db,space,{key:'test',fetcher},old)).passed,false);assert.throws(()=>activateChecked(db,space,{version:old,confirmation:p.confirmation}),/回归检查/);
    db.prepare('DELETE FROM regression_cases WHERE space=?').run(space);p=activationPreview(db,space,old);setFactControl(db,space,{id,disabled:true});assert.throws(()=>activateChecked(db,space,{version:old,confirmation:p.confirmation}),/已.*变化/);
    assert.throws(()=>activationPreview(db,createSpace(db,'其他'),old),/不属于/);
  }finally{db.close();}
});
function backupFixture(){const dir=mkdtempSync(join(tmpdir(),'zhida-backup-')),db=database(join(dir,'studio.sqlite'));setupRecords(db);const space=createSpace(db,'原业务');return {dir,db,space,manager:createBackupManager(db,{directory:join(dir,'backups')})};}
test('备份可校验并恢复，恢复前自动保留当前数据，过期确认和文件篡改均阻止覆盖',async()=>{
  const {dir,db,space,manager}=backupFixture();try{
    const first=await manager.create();assert.equal(manager.inspect(first.name).tables.find(t=>t.name==='spaces').count,1);createSpace(db,'新增业务');const old=manager.preview(first.name);createSpace(db,'又一个业务');await assert.rejects(manager.restore(first.name,old.confirmation),/已经变化/);assert.equal(db.prepare('SELECT COUNT(*) n FROM spaces').get().n,3);
    const p=manager.preview(first.name),r=await manager.restore(first.name,p.confirmation);assert.equal(db.prepare('SELECT COUNT(*) n FROM spaces').get().n,1);assert.equal(db.prepare('SELECT id FROM spaces').get().id,space);assert.notEqual(recoveryGeneration(db),'initial');assert.equal(manager.inspect(r.safetyBackup).tables.find(t=>t.name==='spaces').count,3);
    appendFileSync(manager.file(first.name),'tampered');assert.throws(()=>manager.preview(first.name),/校验失败/);assert.throws(()=>manager.inspect('../studio.sqlite'),/名称无效/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('恢复时 SQL 失败整个事务回滚，当前数据保留；不兼容结构不能恢复',async()=>{
  const {dir,db,space,manager}=backupFixture();try{
    const id=addFact(db,space,{product:'P01',question:'价格？',answer:'old',source:'测试'});db.exec("CREATE TRIGGER block_restore BEFORE INSERT ON facts WHEN NEW.answer='old' BEGIN SELECT RAISE(ABORT,'模拟恢复失败'); END");const first=await manager.create();db.prepare('UPDATE facts SET answer=? WHERE id=?').run('new',id);const p=manager.preview(first.name);await assert.rejects(manager.restore(first.name,p.confirmation),/模拟恢复失败/);assert.equal(db.prepare('SELECT answer FROM facts').get().answer,'new');assert.equal(Object.values(db.prepare('PRAGMA foreign_keys').get())[0],1);
    db.exec('CREATE TABLE other_schema(id TEXT)');assert.throws(()=>manager.preview(first.name),/数据结构/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('自动备份按周期创建并只清理已校验的旧自动文件，手动备份保留',async()=>{
  const {dir,db}=backupFixture();try{let time=Date.now();const manager=createBackupManager(db,{directory:join(dir,'scheduled'),intervalMs:100,keepAutomatic:2,now:()=>time});const manual=await manager.create();
    for(let i=0;i<4;i++){await manager.scheduled();time+=101;}
    assert.equal(manager.list().filter(f=>f.reason==='automatic').length,2);assert.ok(manager.list().some(f=>f.name===manual.name));manager.inspect(manual.name);
    const before=manager.list().length;await manager.scheduled();await manager.scheduled();assert.equal(manager.list().length,before);assert.equal(manager.status().keepAutomatic,2);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

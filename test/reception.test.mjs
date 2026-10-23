import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {database} from '../core.mjs';
import {setupRecords,saveRecord,archiveRecords,readArchive,settings,siteRequested} from '../records.mjs';
import {prepareKnowledge} from '../knowledge-draft.mjs';
const row=(id,state='answer')=>({id,space:'s',account:'a',conversation:'c',state,question:'示例问题',answer:'已审核答案'});
test('30 天已完成记录先归档并校验，未完成待办和近期记录保留',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zhida-archive-')),db=database(':memory:');setupRecords(db);const now=Date.now();
  try{for(const state of ['answer','done','skip','handoff','manual','uncertain','pending'])saveRecord(db,row(state,state),now-31*86400000);saveRecord(db,row('recent'),now);
    const result=archiveRecords(db,dir,now);assert.equal(result.count,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM reception').get().n,5);
    const archived=readArchive(dir,result.files[0]);assert.equal(archived.records.length,3);assert.equal(JSON.parse(archived.records[0].body).question,'示例问题');assert.equal(archiveRecords(db,dir,now).count,0);
    writeFileSync(join(dir,result.files[0]),'tampered');assert.throws(()=>readArchive(dir,result.files[0]),/完整性/);
    assert.throws(()=>readArchive(dir,'../x.json'));
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('归档写入失败不清理原记录，重复记录更新而不重复插入',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zhida-archive-failure-')),db=database(':memory:');setupRecords(db);const now=Date.now();
  try{saveRecord(db,row('x','handoff'),now-32*86400000);saveRecord(db,row('x','done'),now-31*86400000);assert.equal(db.prepare('SELECT COUNT(*) n FROM reception').get().n,1);writeFileSync(join(dir,'blocked'),'file');assert.throws(()=>archiveRecords(db,join(dir,'blocked'),now));assert.equal(db.prepare('SELECT COUNT(*) n FROM reception').get().n,1);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('网站发送需要渠道确认、明确请求及唯一审核网址，敏感内容仍拦截',()=>{
  const context={};vm.runInNewContext(readFileSync('edge-extension/auto-policy.js','utf8'),context);const decide=context.ZhidaAutoPolicy.decision;
  const reply={action:'answer',engine:'deepseek',sources:[{id:'f',answer:'https://example.com/'}],answer:'入口：https://example.com/',sitePolicy:{siteUrl:'https://example.com/',siteAllowed:true,requested:true}};
  assert.equal(decide(reply),'send');assert.equal(decide({...reply,sitePolicy:{...reply.sitePolicy,requested:false}}),'handoff');assert.equal(decide({...reply,sitePolicy:{...reply.sitePolicy,siteAllowed:false}}),'handoff');assert.equal(decide({...reply,answer:reply.answer+' https://evil.com/'}),'handoff');assert.equal(decide({...reply,answer:reply.answer+' 请提供密码'}),'handoff');
  const db=database(':memory:');setupRecords(db);assert.equal(settings(db,'s').siteAllowed,false);assert.throws(()=>settings(db,'s',{siteUrl:'http://example.com',siteAllowed:true}));db.close();
});
function ledger(){const storage={},context={crypto,TextEncoder,chrome:{storage:{local:{get:async key=>key===null?{...storage}:{[key]:storage[key]},set:async value=>Object.assign(storage,value),remove:async key=>delete storage[key]}}}};vm.runInNewContext(readFileSync('edge-extension/reception.js','utf8'),context);return {ops:context.ZhidaReception,storage};}
test('未读消息进入持久任务后，变成已读仍保留，账号互相隔离',async()=>{
  const {ops}=ledger(),s={account:'a',targets:[{kind:'c2c',id:'c',name:'顾客',unread:1,updated:10}],messages:[]};await ops.observe(s);await ops.observe({...s,targets:[{...s.targets[0],unread:0}]});assert.equal((await ops.tasks('a'))[0].state,'pending');assert.equal((await ops.tasks('b')).length,0);await ops.state('a','c','done');assert.equal((await ops.tasks('a'))[0].state,'done');
});
test('记录服务断开时本地保留待同步记录，恢复后只同步当前账号',async()=>{
  const {ops,storage}=ledger();ops.account='a';const s={account:'a',conversation:{id:'c',name:'顾客'},messages:[{id:'m',role:'user',content:'问题'}]};await ops.record(s,{state:'handoff',ids:['m']},async()=>{throw Error('offline');});assert.ok(Object.keys(storage).some(k=>k.startsWith('reception-outbox:')));let calls=0;ops.account='b';await ops.flush(async()=>calls++);assert.equal(calls,0);ops.account='a';await ops.flush(async()=>calls++);assert.equal(calls,1);assert.ok(!Object.keys(storage).some(k=>k.startsWith('reception-outbox:')));
});
test('24 小时边界与未知时间不能自动补发历史消息',()=>{const {ops}=ledger(),now=Date.now();assert.equal(ops.old([{time:now-1000}],now),false);assert.equal(ops.old([{time:now-86400001}],now),true);assert.equal(ops.old([{time:null}],now),true);});
test('无时间历史保持待确认，仅在同会话已知尾部后新出现的消息标记为新到达',()=>{
 const {ops}=ledger(),s={account:'a',conversation:{id:'c'},messages:[{id:'old',time:null}]};ops.stamp(s);assert.equal(s.messages[0].time,null);s.messages.unshift({id:'older',time:null});s.messages.push({id:'new',time:null});ops.stamp(s);assert.equal(s.messages[0].time,null);assert.equal(s.messages.at(-1).observedTime,true);
});
test('明确询问网站才算入口请求，否定或故障描述不发送网址',()=>{assert.equal(siteRequested('你们网站是什么？'),true);assert.equal(siteRequested('发我下单链接'),true);assert.equal(siteRequested('不要发网站链接'),false);assert.equal(siteRequested('网站打不开'),false);});
test('AI 知识整理只产生草稿，强制清空来源，拒绝截断或格式错误，不创建知识',async()=>{
 const body={question:'多久交付',history:[{role:'user',content:'多久交付'},{role:'assistant',content:'通常 1—3 天'}]};let request;
 const fetcher=async(_,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({product:'测试商品',question:'多久交付？',answer:'通常 1—3 天',source:'模型伪造来源'})}}]})};};
 const r=await prepareKnowledge(body,{key:'test-only',fetcher});assert.equal(r.reviewRequired,true);assert.equal(r.source,'');assert.equal(request.thinking.type,'disabled');assert.equal(r.answer,'通常 1—3 天');
 await assert.rejects(prepareKnowledge({...body,history:[{role:'system',content:'坏指令'}]},{key:'test-only',fetcher}),/格式/);
 await assert.rejects(prepareKnowledge(body,{key:'test-only',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length'}]})})}),/不完整/);
});

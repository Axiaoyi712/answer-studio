import test from 'node:test';
import assert from 'node:assert/strict';
import {database,createSpace,addFact,reviseFact,publish,answer} from '../core.mjs';
const fact={product:'A01',question:'A01的面料是什么',answer:'100%棉',source:'审核说明书'};
test('无法处理的对外答复统一简短等待，内部人工原因仍保留',async()=>{
 for(const question of ['我要退款','人工客服','不存在的商品价格']){const r=await answer({rules:'',facts:[]},question);assert.equal(r.answer,'不好意思，请稍等');assert.equal(r.action,'handoff');assert.ok(r.reason);}
 const r=await answer({rules:'',facts:[]},'可以帮我吗',[],{key:'test',fetcher:async(_,options)=>{const prompt=JSON.parse(options.body).messages[0].content;assert.match(prompt,/不要主动说自己/);assert.match(prompt,/如实简短说明是自动回复/);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'handoff',answer:'需要人工核实',source_ids:[]})}}]})};}});assert.equal(r.answer,'不好意思，请稍等');
});
test('修正在原条目上保存并重置审核，失败保留原文，已发布快照独立',()=>{
 const db=database(':memory:'),a=createSpace(db,'甲'),b=createSpace(db,'乙'),id=addFact(db,a,fact);
 db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);const version=publish(db,a);
 assert.throws(()=>reviseFact(db,a,{...fact,id,answer:''}),/答案/);
 assert.throws(()=>reviseFact(db,b,{...fact,id,answer:'其他业务'}),/不属于/);
 assert.equal(db.prepare('SELECT answer FROM facts WHERE id=?').get(id).answer,fact.answer);
 reviseFact(db,a,{...fact,id,answer:'修正后的面料说明'});
 assert.equal(db.prepare('SELECT count(*) n FROM facts WHERE space=?').get(a).n,1);
 const row=db.prepare('SELECT * FROM facts WHERE id=?').get(id);assert.equal(row.approved,0);assert.equal(row.answer,'修正后的面料说明');
 assert.equal(JSON.parse(db.prepare('SELECT snapshot FROM versions WHERE id=?').get(version).snapshot).facts[0].answer,fact.answer);db.close();
});
test('审核、业务隔离、发布快照及历史版本独立',()=>{
 const db=database(':memory:');const a=createSpace(db,'服装'),b=createSpace(db,'文具');const id=addFact(db,a,fact);
 assert.throws(()=>publish(db,a),/审核/);assert.throws(()=>publish(db,b),/审核/);
 db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);const v=publish(db,a);
 db.prepare('UPDATE facts SET answer=? WHERE id=?').run('修改草稿',id);
 const snapshot=JSON.parse(db.prepare('SELECT snapshot FROM versions WHERE id=?').get(v).snapshot);
 assert.equal(snapshot.facts[0].answer,'100%棉');assert.equal(db.prepare('SELECT count(*) n FROM facts WHERE space=?').get(b).n,0);db.close();
});
test('无模型时精确命中及缺失资料拒答',async()=>{
 const snapshot={rules:'',facts:[{...fact,id:'1'}]};
 assert.equal((await answer(snapshot,fact.question)).answer,'100%棉');
 assert.equal((await answer(snapshot,'钢笔有多长')).action,'handoff');
 assert.equal((await answer(snapshot,'我要投诉A01')).action,'handoff');
});
test('模型不得引用其他业务或不存在的来源',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'answer',answer:'伪造',source_ids:['foreign']})}}]})});
 const r=await answer({rules:'',facts:[{...fact,id:'1'}]},fact.question,[],{key:'test',fetcher});assert.equal(r.action,'handoff');
});
test('模型调用仅发送服务端密钥并保留会话与来源',async()=>{
 const fetcher=async(url,options)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer test');const b=JSON.parse(options.body);assert.equal(b.messages.at(-2).content,'A01');return {ok:true,json:async()=>({choices:[{message:{content:'{"action":"answer","answer":"100%棉","source_ids":["1"]}'}}]})};};
 const r=await answer({rules:'',facts:[{...fact,id:'1'}]},fact.question,[{role:'user',content:'A01'}],{key:'test',fetcher});assert.equal(r.engine,'deepseek');assert.equal(r.sources[0].id,'1');
});
test('截图中的含糊咨询先追问，问候不转人工，测试消息不生成可发送答案',async()=>{
 const snapshot={rules:'网站咨询',facts:[]};let calls=0;
 const options={key:'test',fetcher:async()=>{calls++;throw new Error('不应调用');}};
 const vague=await answer(snapshot,'怎么做到的哥',[],options);
 assert.equal(vague.action,'clarify');assert.equal(vague.engine,'rules');assert.match(vague.answer,/效果/);
 assert.equal((await answer(snapshot,'你好！',[],options)).action,'clarify');
 assert.equal((await answer(snapshot,'你好\n你好宝宝\n你好',[{role:'assistant',content:'有什么问题？'}],options)).action,'clarify');
 assert.match((await answer(snapshot,'你好\n你是怎么做的\n你好宝宝',[{role:'assistant',content:'你指哪项效果？'}],options)).answer,/哪个视频/);
 assert.equal((await answer(snapshot,'你好\n产品价格是多少\n你好宝宝',[],{...options,key:''})).action,'handoff');
 const skip=await answer(snapshot,'1111',[],options);assert.equal(skip.action,'skip');assert.equal(skip.answer,'');
 assert.equal((await answer(snapshot,'你好，价格是多少？',[],{...options,key:''})).action,'handoff');
 assert.equal((await answer(snapshot,'1111',[{role:'user',content:'商品编号是多少？'}],{...options,key:''})).action,'handoff');
 assert.equal(calls,0);
});

test('未命中知识也让模型判断普通接待，保留消息顺序和上下文',async()=>{
 let calls=0;
 const question='你好\n你是怎么做的\n你好宝宝\n你好\n你怎么了';
 const history=[{role:'assistant',content:'你指哪个视频中的效果？'}];
 const fetcher=async(url,options)=>{
  calls++;const body=JSON.parse(options.body);
  assert.equal(body.messages.at(-1).content,question);
  assert.equal(body.messages.at(-2).content,history[0].content);
  assert.match(body.messages[0].content,/优先回应最后的诉求/);
  assert.match(body.messages[0].content,/没有证据不得编造/);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'clarify',answer:'我在的！你想了解哪方面呢？',source_ids:[]})}}]})};
 };
 const result=await answer({rules:'仅根据已审核资料回答',facts:[]},question,history,{key:'test',fetcher});
 assert.equal(calls,1);assert.equal(result.action,'clarify');assert.equal(result.engine,'deepseek');assert.deepEqual(result.sources,[]);
 assert.equal(result.modelCalled,true);
});

test('无知识时模型不能凭空输出商品事实或伪造引用，人工请求仍在本地处理',async()=>{
 let calls=0;let output={action:'answer',answer:'每件售价99元',source_ids:[]};
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(output)}}]})};};
 const options={key:'test',fetcher};const snapshot={rules:'',facts:[]};
 const rejected=await answer(snapshot,'这件商品多少钱',[],options);
 assert.equal(rejected.action,'handoff');assert.match(rejected.reason,/有效.*引用/);
 assert.equal(rejected.modelCalled,true);
 output={action:'clarify',answer:'请确认型号',source_ids:['made-up']};
 assert.equal((await answer(snapshot,'这件商品多少钱',[],options)).action,'handoff');
 output={action:'handoff',answer:'已替你转接人工，稍后一定有人联系你',source_ids:[]};
 const manual=await answer(snapshot,'这件商品多少钱',[],options);
 assert.equal(manual.engine,'deepseek');assert.doesNotMatch(manual.answer,/已替|已转|一定/);
 await answer(snapshot,'我要人工客服',[],options);assert.equal(calls,3);
});
test('人工智能业务咨询不会误触发转人工，明确找人工仍接管',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'clarify',answer:'你想使用 AI 完成什么任务？',source_ids:[]})}}]})};};
 const snapshot={rules:'',facts:[]},options={key:'test',fetcher};
 assert.equal((await answer(snapshot,'我想要人工智能服务',[],options)).engine,'deepseek');
 for(const question of ['人工','转一下人工','找人工客服','我要退款'])assert.equal((await answer(snapshot,question,[],options)).action,'handoff');
 assert.equal(calls,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {answer,database,createSpace,addFact,publish} from '../core.mjs';
import {checkFacts} from '../fact-check.mjs';
import {conflicts} from '../knowledge-state.mjs';
import '../edge-extension/inbox-policy.js';

const p=globalThis.ZhidaInboxPolicy;
const pen={id:'pen',product:'P01',question:'P01规格与价格',answer:'P01笔身长14cm，笔芯长10cm，笔尖0.5mm，单支2元。'};
const model=output=>({key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})})});

test('失败或发送中的气泡不能截断待处理客户消息，核对后不重发旧问题',()=>{
  for(const state of ['failed','pending']){
    const messages=[{id:'u',role:'user',content:'价格？'},{id:'a',role:'assistant',[state]:true}];
    assert.deepEqual(p.pending(messages).map(m=>m.id),['u']);assert.equal(p.unconfirmed(messages),true);
    assert.equal(p.unconfirmed(messages,['u']),false);
    const follow=[...messages,{id:'v',role:'user',content:'颜色？'}];
    assert.deepEqual(p.pending(follow,['u']).map(m=>m.id),['v']);assert.equal(p.unconfirmed(follow,['u']),false);
    assert.equal(p.unconfirmed([...messages,{id:'ok',role:'assistant'}]),false);
    assert.deepEqual(p.pending([...messages,{id:'ok',role:'assistant'}]),[]);
  }
});

test('普通问候致谢不累计追问，真实澄清保留次数与超时重置',async()=>{
  for(const question of ['你好','谢谢，不用了']){
    const result=await answer({rules:'',facts:[]},question);assert.equal(result.clarification,false,question);
    assert.equal(p.clarificationCount({clarifications:2,clarifiedAt:100},result,200),0);
  }
  assert.equal(p.clarificationCount({}, {action:'clarify',clarification:true},100),1);
  assert.equal(p.clarificationCount({clarifications:2,clarifiedAt:100},{action:'clarify',clarification:true},200),3);
  assert.equal(p.clarificationCount({clarifications:2,clarifiedAt:100},{action:'clarify',clarification:true},1800101),1);
  assert.equal(p.clarificationCount({clarifications:2},{action:'clarify',clarification:true},200),1,'旧版计数没有时间时重新计数');
});

test('模型标记的普通接待不计追问，无效标记不能改变检查协议',async()=>{
  const social=await answer({rules:'',facts:[]},'你怎么啦',[],model({action:'clarify',answer:'我在，想了解什么？',source_ids:[],clarification:false}));
  assert.equal(social.clarification,false);
  const genuine=await answer({rules:'',facts:[]},'我想买一款笔',[],model({action:'clarify',answer:'你主要用来考试还是日常书写？',source_ids:[],clarification:true}));
  assert.equal(genuine.clarification,true);
  const bad=await answer({rules:'',facts:[]},'我想买笔',[],model({action:'clarify',answer:'你好',source_ids:[],clarification:'false'}));
  assert.equal(bad.reasonCode,'model-output');
});

test('同商品数值必须对应正确属性，合法换算和省略重复商品名仍放行',()=>{
  for(const text of ['P01笔身长10cm，笔芯长14cm。','P01笔芯长度为14cm。','P01笔尖为10cm。'])assert.equal(checkFacts(text,[pen]).ok,false,text);
  for(const text of ['P01笔身长14cm，笔芯长10cm。','P01笔芯长100mm，笔身长140mm。','P01笔尖为0.05cm，单支两元。'])assert.equal(checkFacts(text,[pen]).ok,true,text);
});

test('无依据免邮和正品承诺被拦，同义表达有依据时可用',()=>{
  for(const text of ['P01免运费。','P01免邮。','P01运费全免。','P01保证正品。','P01是原装正品。'])assert.equal(checkFacts(text,[pen]).ok,false,text);
  for(const [text,evidence] of [['P01免运费。','P01包邮。'],['P01包邮。','P01免邮费。'],['P01不免运费。','P01不包邮。'],['P01保证正品。','P01为正品。']])assert.equal(checkFacts(text,[{...pen,answer:evidence}]).ok,true,text);
  assert.equal(checkFacts('P01免运费。',[{...pen,answer:'P01不包邮。'}]).ok,false);
  assert.equal(checkFacts('P01不包邮。',[{...pen,answer:'P01免运费。'}]).ok,false);
  assert.equal(checkFacts('P01不是正品。',[{...pen,answer:'P01为正品。'}]).ok,false);
  assert.equal(checkFacts('P01是正品。',[{...pen,answer:'P01不是正品。'}]).ok,false);
  assert.equal(checkFacts('是否免运费需要确认。',[]).ok,true);
});

test('免邮条件不能因换词或丢掉前提被放宽',()=>{
  const fact={...pen,answer:'满99元包邮，偏远地区除外。'};
  assert.equal(checkFacts('P01包邮。',[fact]).ok,false);
  assert.equal(checkFacts('满99元免运费，偏远地区除外。',[fact]).ok,true);
  assert.equal(checkFacts('满99元包邮。',[fact]).ok,false);
});

test('相对送达承诺不能用发货依据证明，否定和实际送达依据正常处理',()=>{
  const ship={...pen,answer:'P01现货48小时内发货，预售商品除外。'};
  for(const text of ['P01今天就能送到。','P01明天送达。','P01当天到货。'])assert.equal(checkFacts(text,[ship]).ok,false,text);
  for(const text of ['P01不能保证今天送到。','P01今天能否送到需要确认。'])assert.equal(checkFacts(text,[ship]).ok,true,text);
  assert.equal(checkFacts('P01当天送达。',[{...pen,answer:'P01同城订单当天送达。'}]).ok,false,'同城条件不能丢');
  assert.equal(checkFacts('P01同城订单当天送达。',[{...pen,answer:'P01同城订单当天送达。'}]).ok,true);
  assert.equal(checkFacts('P01今天送到。',[{...pen,answer:'P01今天不能送到。'}]).ok,false);
  assert.equal(checkFacts('P01今天送到。',[{...pen,answer:'P01今天发货，预计三天送到。'}]).ok,false);
  assert.equal(checkFacts('P01今天送到。',[{...pen,answer:'P01今天能否送到需要确认。'}]).ok,false);
  assert.equal(checkFacts('P01当天送达。',[{...pen,answer:'P01同城订单当天送达，偏远地区除外。'}]).ok,false);
});

test('没有工具回执不能声称退款或订单修改已办好，政策与否定不误拦',()=>{
  for(const text of ['P01退款已经办理完成。','退款已处理好了。','已经帮你改好地址了。','订单已取消。','退款已到账。'])assert.equal(checkFacts(text,[pen]).ok,false,text);
  for(const text of ['退款尚未处理完成。','还没有帮你修改地址。','退款完成后原路返回。','请问你的退款已到账了吗？'])assert.equal(checkFacts(text,[]).ok,true,text);
});

test('引用真实知识也不能通过错配、错承诺的最终回答核验',async()=>{
  for(const text of ['P01笔身长10cm，笔芯长14cm。','P01免运费。','P01退款已经办理完成。']){
    const r=await answer({rules:'',facts:[pen]},'P01有什么规格和服务？',[],model({action:'answer',answer:text,source_ids:['pen']}));assert.equal(r.action,'handoff',text);assert.equal(r.reasonCode,'answer-check');assert.equal(r.answer,'不好意思，请稍等');
  }
});

test('不同问法的规格与政策冲突阻止发布，合法商品与条件区别保留',()=>{
  const spec=[{id:'a',product:'P01',question:'笔尖规格',answer:'P01笔尖0.5mm。'},{id:'b',product:'P01',question:'笔尖尺寸',answer:'P01笔尖1.0mm。'}];
  assert.equal(conflicts({facts:spec}).length,1);
  assert.equal(conflicts({facts:spec.map((f,i)=>i?{...f,product:'P02',answer:'P02笔尖1.0mm。'}:f)}).length,0);
  assert.equal(conflicts({facts:spec.map((f,i)=>i?{...f,answer:'P01笔尖0.05cm。'}:f)}).length,0);
  assert.equal(conflicts({facts:[{...spec[0],answer:'P01笔尖有0.5mm和0.7mm两种可选。'},{...spec[1],answer:'P01笔尖0.7mm。'}]}).length,0,'可选规格列表不能当成唯一固定规格');
  const policies=[{id:'a',product:'P01',question:'售后说明',answer:'P01支持退货。'},{id:'b',product:'P01',question:'能退吗',answer:'P01不支持退货。'}];
  assert.equal(conflicts({facts:policies}).length,1);
  assert.equal(conflicts({facts:[policies[0],{...policies[1],answer:'P01已拆封不支持退货。'}]}).length,0);
  const db=database(':memory:'),space=createSpace(db,'隔离规格');try{
    for(const f of spec)addFact(db,space,{...f,source:'合成资料'});db.exec('UPDATE facts SET approved=1');assert.throws(()=>publish(db,space),/冲突/);
  }finally{db.close();}
});

test('历史版本已有冲突时，不让模型任选一份依据继续作答',async()=>{
  const facts=[{id:'a',product:'P01',question:'P01笔尖规格',answer:'P01笔尖0.5mm。'},{id:'b',product:'P01',question:'P01笔尖尺寸',answer:'P01笔尖1.0mm。'}];let calls=0;
  const r=await answer({rules:'',facts},'P01笔尖规格是多少？',[],{key:'test',fetcher:async()=>{calls++;return (await model({action:'answer',answer:'P01笔尖0.5mm。',source_ids:['a']}).fetcher());}});
  assert.equal(r.action,'handoff');assert.equal(r.reasonCode,'answer-check');assert.equal(r.answer,'不好意思，请稍等');assert.equal(calls,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {database,createSpace,answer,retrieve} from '../core.mjs';
import {checkFacts} from '../fact-check.mjs';
import {setupRecords,saveRecord,recordDetails} from '../records.mjs';
import {createInterviewer} from '../knowledge-interview.mjs';

const pen={id:'pen',product:'P01 中性笔 / 黑色水笔',question:'P01是什么规格？｜P01多少钱？',answer:'P01为0.5mm黑色中性笔，单支2元。',source:'合成产品资料'};
const other={id:'other',product:'P02 中性笔',question:'P02是什么规格、多少钱？',answer:'P02为0.7mm蓝色中性笔，单支9元。',source:'合成产品资料'};
const paper={id:'paper',product:'A4 复印纸',question:'A4复印纸是什么规格？',answer:'本款A4纸为80g，每包500张，20元一包，适合普通打印机。',source:'合成产品资料'};
const shipping={id:'shipping',product:'发货规则',question:'多久发货？',answer:'付款后48小时内发出，预售商品除外，预售时间下单前单独确认。',source:'合成经营规则'};

test('答案正文和常用问法可召回；未知词不导致整个分数变成 NaN',()=>{
  for(const question of ['适合普通打印机吗？','这种纸一沓多少页？','打印纸每包多少张？','A4是多少克的？'])assert.equal(retrieve([pen,paper],question)[0]?.id,'paper',question);
  assert.ok(retrieve([pen], 'P01是黑色吗？')[0]?.id==='pen');assert.deepEqual(retrieve([paper],'？？？'),[]);
});
test('型号精确匹配，不能把 P01、P010 和 A3、A4 当成同款',()=>{
  for(const question of ['P010多少钱？','P99多少钱？'])assert.ok(!retrieve([pen,other],question).length);
  assert.deepEqual(retrieve([pen,other],'P01多少钱？').map(f=>f.id),['pen']);assert.equal(retrieve([paper],'A3是什么规格？').length,0);
});
test('当前明确换型号时，不从旧型号上下文补回错误证据',async()=>{
  let evidence;const r=await answer({rules:'',facts:[pen]},'P99多少钱？',[{role:'user',content:'P01多少钱？'}],{key:'test',fetcher:async(_,options)=>{evidence=JSON.parse(JSON.parse(options.body).messages[0].content.split('证据：')[1]);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'handoff',answer:'等待',source_ids:[]})}}]})};}});
  assert.deepEqual(evidence,[]);assert.equal(r.action,'handoff');
});
for(const [text,facts] of [
  ['P01是0.5mm黑色中性笔，单支2元。',[pen]],
  ['P01笔尖为0.05cm，单支两元。',[pen]],
  ['A4纸每包500张，20元一包。',[paper]],
  ['付款后两天内发货，预售除外。',[shipping]],
  ['现货48小时内发出，预售时间单独确认。',[shipping]],
  ['你需要0.5mm还是0.7mm？',[]],
  ['请问你想要黑色还是蓝色？',[]],
  ['你指的是P99吗？',[]],
  ['你好，想了解哪方面？',[]],
  ['我先问两个问题，你想了解什么？',[]],
  ['这款不包邮。',[{answer:'这款不包邮，运费另计。'}]],
  ['方便说一下你需要0.5mm还是0.7mm？',[]],
  ['2个工作日内发货。',[{answer:'2工作日内发货。'}]],
  ['P01没有蓝色。',[{...pen,answer:'P01只有黑色，没有蓝色。'}]],
  ['现货和包邮情况需要确认，请问你指哪款？',[]]
])test('合理事实或必要追问可通过：'+text,()=>assert.equal(checkFacts(text,facts).ok,true));
for(const [text,facts] of [
  ['P01是蓝色1.0mm，售价99元。',[pen]],
  ['P01售价9元。',[pen,other]],
  ['P01为0.7mm蓝色中性笔。',[pen,other]],
  ['P99售价2元。',[pen]],
  ['A4纸20元一张。',[paper]],
  ['A4纸每包50张。',[paper]],
  ['48小时内送达。',[shipping]],
  ['付款后48小时发货。',[shipping]],
  ['预售也48小时内发货。',[shipping]],
  ['付款后48小时后发货，预售除外。',[shipping]],
  ['2个工作日内发货，预售除外。',[shipping]],
  ['这款有货，包邮。',[]],
  ['这款包邮。',[{answer:'这款不包邮。'}]],
  ['这款不包邮。',[]],
  ['价格2元。',[{answer:'价格2元起。'}]],
  ['已退款，请查看。',[]],
  ['P01现在99元，你要几支？',[]],
  ['这款99元，您需要吗？',[]],
  ['这款售价99元。',[{answer:'这款不是99元，实际是2元。'}]],
  ['P01蓝色2元，是否包邮需要确认。',[pen]]
])test('无依据或改变关键条件应拦截：'+text,()=>assert.equal(checkFacts(text,facts).ok,false));
test('伪造事实即便引用真实 ID 也不外发；clarify 不能携带无依据价格',async()=>{
  for(const output of [{action:'answer',answer:'P01售价99元。',source_ids:['pen']},{action:'clarify',answer:'P01蓝色笔99元，你要几支？',source_ids:[]}]){
    const result=await answer({rules:'',facts:[pen]},'P01多少钱？',[],{key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(output)}}]})})});
    assert.equal(result.action,'handoff');assert.equal(result.answer,'不好意思，请稍等');assert.equal(result.reasonCode,'answer-check');assert.match(result.reason,/核对未通过/);
  }
});
test('分类保留具体原因，区分知识、业务、模型、发送、页面和人工请求',()=>{
  for(const [reason,expected] of [['缺少发货规则','knowledge-missing'],['问答服务暂时不可用','service-error'],['模型未返回有效结构','model-output'],['发送失败或结果不明确','delivery-uncertain'],['输入框已有人工草稿','page-error'],['历史待确认：消息早于24小时','history-review'],['收到图片，需要人工查看','media-review'],['申请退款','business-action'],['客户要求人工','manual-request']])assert.equal(recordDetails({reason}).handoffType.code,expected,reason);
});
test('个人订单查询和重复付款归业务处理，不当成缺少产品知识',async()=>{
  for(const question of ['帮我查一下我的订单','查询订单状态','我已经付款两次了，怎么处理？'])assert.equal((await answer({rules:'',facts:[]},question)).reasonCode,'business-action');
});
test('人工原因写入接待记录，服务与发送故障不会出现在对话建库的知识缺口里',()=>{
  const db=database(':memory:');setupRecords(db);const space=createSpace(db,'测试业务');
  try{
    for(const [id,reason] of [['knowledge','缺少发货规则'],['service','问答服务暂时不可用'],['sending','发送失败或结果不明确'],['refund','申请退款']])saveRecord(db,{id,space,account:'a',conversation:id,state:'handoff',question:'多久能处理？',reason});
    assert.equal(JSON.parse(db.prepare('SELECT body FROM reception WHERE id=?').get('service').body).handoffType.code,'service-error');
    assert.deepEqual(createInterviewer(db).read(space).gaps.map(g=>g.record),['knowledge']);
    saveRecord(db,{id:'knowledge',space,account:'a',conversation:'knowledge',state:'manual',question:'多久能处理？',reason:'人工处理中'});
    saveRecord(db,{id:'knowledge',space,account:'a',conversation:'knowledge',state:'done',question:'多久能处理？',reason:'人工处理完毕'});
    assert.deepEqual(createInterviewer(db).read(space).gaps.map(g=>g.record),['knowledge']);
  }finally{db.close();}
});

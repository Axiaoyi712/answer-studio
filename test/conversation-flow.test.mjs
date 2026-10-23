import test from 'node:test';
import assert from 'node:assert/strict';
import {answer,database,createSpace,addFact,publish} from '../core.mjs';
import {bridgeReply} from '../bridge.mjs';

const pen={id:'pen',product:'P01',question:'P01规格与价格',answer:'P01为0.5mm黑色中性笔，单支2元。'};
const hours={id:'hours',product:'人工客服工作时间',question:'人工客服几点上班？',answer:'人工客服工作时间为每天上午九点到下午六点。'};
const model=output=>({key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})})});
const noModel={key:'test',fetcher:async()=>{throw Error('不应调用模型');}};

test('客户简短同意上文提议时继续问答，不当作告别；引用只来自当前资料',async()=>{
  for(const question of ['好','好的','可以','嗯嗯','OK','行']){
    const history=[{role:'user',content:'我想看看适合考试的笔'},{role:'assistant',content:'要介绍一下P01的规格吗？'}];
    let calls=0;const opts=model({action:'answer',answer:pen.answer,source_ids:['pen']}),fetcher=opts.fetcher;
    opts.fetcher=(_,options)=>{calls++;const messages=JSON.parse(options.body).messages;assert.equal(messages.at(-1).content,question);assert.deepEqual(messages.slice(1,-1),history);const facts=JSON.parse(messages[0].content.split('证据：')[1]);assert.ok(facts.some(f=>f.id==='pen'));return fetcher();};
    const r=await answer({rules:'',facts:[pen]},question,history,opts);assert.equal(calls,1,question);assert.equal(r.action,'answer');assert.match(r.answer,/0.5mm/);
  }
});

test('追问后没有问号的简短确认也继续；纯致谢与无上下文确认仍本地收尾',async()=>{
  const history=[{role:'assistant',content:'请确认是否需要介绍P01的规格'}];
  const r=await answer({rules:'',facts:[pen]},'好的',history,model({action:'answer',answer:pen.answer,source_ids:['pen']}));assert.equal(r.action,'answer');assert.equal(r.modelCalled,true);
  for(const [question,previous] of [['好的',[]],['可以',[{role:'assistant',content:'有问题随时问。'}]],['谢谢，不用了',history],['好的，谢谢',history],['问题都解决了，谢谢',history]]){
    const result=await answer({rules:'',facts:[]},question,previous,noModel);assert.equal(result.action,'clarify',question);assert.equal(result.modelCalled,false,question);
  }
});

test('简短确认不能将历史回复当事实依据，当前无资料仍拦截',async()=>{
  const history=[{role:'assistant',content:'要介绍一下P01吗？P01单支99元。'}];
  const r=await answer({rules:'',facts:[]},'好',history,model({action:'answer',answer:'P01单支99元。',source_ids:[]}));assert.equal(r.action,'handoff');assert.equal(r.reasonCode,'answer-check');
  const corrected=await answer({rules:'',facts:[pen]},'好',history,model({action:'answer',answer:pen.answer,source_ids:['pen']}));assert.equal(corrected.action,'answer');assert.match(corrected.answer,/2元/);
});

test('同意上文转接或实际操作仅创建对应待办，不由模型假装执行',async()=>{
  for(const content of ['需要帮你退款吗？','需要帮您取消订单吗？','需要替你修改收货地址吗？','需要查询一下您的订单吗？']){
    const r=await answer({rules:'',facts:[pen]},'好',[{role:'assistant',content}],noModel);assert.equal(r.action,'handoff',content);assert.equal(r.reasonCode,'business-action');assert.equal(r.answer,'不好意思，请稍等');
  }
  const r=await answer({rules:'',facts:[]},'可以',[{role:'assistant',content:'需要转人工客服吗？'}],noModel);assert.equal(r.reasonCode,'manual-request');assert.equal(r.modelCalled,false);
  const refund={id:'refund',product:'退款规则',question:'退款条件',answer:'仅限未使用的商品支持退款。'};
  const policy=await answer({rules:'',facts:[refund]},'好',[{role:'assistant',content:'需要帮你介绍一下退款规则吗？'}],model({action:'answer',answer:refund.answer,source_ids:['refund']}));assert.equal(policy.action,'answer');assert.equal(policy.modelCalled,true);
});

test('人工服务时间和是否提供人工服务属于规则咨询，不强制转接',async()=>{
  for(const question of ['人工客服几点上班？','人工客服什么时候下班？','人工客服的工作时间是什么？','人工服务时间是什么？','有没有人工客服？']){
    const r=await answer({rules:'',facts:[hours]},question,[],model({action:'answer',answer:hours.answer,source_ids:['hours']}));assert.equal(r.action,'answer',question);assert.equal(r.modelCalled,true,question);
  }
});

test('明确找人工不能被服务时间咨询覆盖；身份询问如实接待',async()=>{
  for(const question of ['人工客服','人工服务','我要人工客服','找人工服务','请提供人工客服','人工客服几点上班？现在转人工','你是人工客服吗？给我转人工']){
    const r=await answer({rules:'',facts:[hours]},question,[],noModel);assert.equal(r.action,'handoff',question);assert.equal(r.reasonCode,'manual-request',question);
  }
  const r=await answer({rules:'',facts:[]},'你是人工客服吗？',[],model({action:'clarify',answer:'这里是自动回复，你想了解什么？',source_ids:[]}));assert.equal(r.action,'clarify');assert.match(r.answer,/自动回复/);assert.equal(r.modelCalled,true);
});

test('人工服务规则缺失仍保留知识待办，不靠 FAQ 分流绕过事实门槛',async()=>{
  const r=await answer({rules:'',facts:[]},'人工客服几点上班？',[],model({action:'handoff',answer:'待确认',source_ids:[]}));assert.equal(r.reasonCode,'knowledge-missing');
  const invented=await answer({rules:'',facts:[]},'有没有人工客服？',[],model({action:'answer',answer:'有，全天在线。',source_ids:[]}));assert.equal(invented.action,'handoff');assert.equal(invented.reasonCode,'answer-check');
});

test('真实桥接观测到追问后按当前发布资料继续，隔离其他客户上下文',async()=>{
  const db=database(':memory:'),space=createSpace(db,'合成客服');try{
    const id=addFact(db,space,{...pen,source:'合成资料'});db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);publish(db,space);
    const body={space,account:'account',conversation:'one',question:'好',history:[{role:'user',content:'想看看笔'},{role:'assistant',content:'需要介绍P01规格吗？'}]};
    const opts=model({action:'answer',answer:pen.answer,source_ids:[id]});
    const first=await bridgeReply(db,body,opts);assert.equal(first.action,'answer');assert.equal(first.modelCalled,true);
    const second=await bridgeReply(db,{...body,conversation:'two',history:[]},noModel);assert.equal(second.action,'clarify');assert.equal(second.modelCalled,false);
  }finally{db.close();}
});

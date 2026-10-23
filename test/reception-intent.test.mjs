import test from 'node:test';
import assert from 'node:assert/strict';
import {answer} from '../core.mjs';
import {socialClosing} from '../social-replies.mjs';
import {checkFacts} from '../fact-check.mjs';

const refund={id:'refund',product:'退款规则',question:'退款一般多久到账？',answer:'审核通过后一般3个工作日内原路退款。'};
const model=output=>({key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})})});
const noModel={key:'test',fetcher:async()=>{throw Error('这条消息不应请求模型');}};

test('复杂收尾和常见标点由本地接待，模型故障也不打断致谢',async()=>{
  for(const question of ['好的，我的问题你都解答完了，谢谢你了。','OK, 我知道了, 谢谢啊!','我的问题都解决了，谢谢您的帮助。','好的；我已经明白了；谢谢。']){
    const r=await answer({rules:'',facts:[]},question,[],{...noModel,modelUnavailable:true});
    assert.equal(r.action,'clarify',question);assert.equal(r.modelCalled,false,question);assert.doesNotMatch(r.answer,/人工|需要什么|哪方面/);
  }
});

test('复杂收尾不能吞掉追问、否定或办理请求',async()=>{
  for(const question of ['我的问题你都解答完了吗','我的问题没有解决','我的问题都解决了但还有运费问题','好的我的问题你都解答完了退款一般多久到账','谢谢但我要退款'])assert.equal(socialClosing([question]),false,question);
  let calls=0;const opts=model({action:'answer',answer:refund.answer,source_ids:['refund']}),fetcher=opts.fetcher;
  opts.fetcher=(...args)=>{calls++;return fetcher(...args);};
  const r=await answer({rules:'',facts:[refund]},'谢谢，你解答完了，退款一般几天到账？',[],opts);
  assert.equal(r.action,'answer');assert.equal(calls,1);assert.match(r.answer,/3个工作日/);
});

test('一般退款时限和退换规则咨询进入依据问答，不提前当成申请',async()=>{
  let calls=0;const opts=model({action:'answer',answer:refund.answer,source_ids:['refund']}),fetcher=opts.fetcher;
  opts.fetcher=(...args)=>{calls++;return fetcher(...args);};
  for(const question of ['退款一般几天到账？','一般退款需要多久？','退款通常多久到账？','退费政策是什么？']){
    const r=await answer({rules:'',facts:[refund]},question,[],opts);assert.equal(r.action,'answer',question);assert.equal(r.engine,'deepseek');
  }
  assert.equal(calls,4);
  const returns={id:'returns',product:'退换货规则',question:'支持退货、换货吗？',answer:'仅限未拆封的商品支持退货和换货，定制商品除外。'};
  const r=await answer({rules:'',facts:[returns]},'买之前问一下，换货有什么条件？',[],model({action:'answer',answer:returns.answer,source_ids:['returns']}));
  assert.equal(r.action,'answer');assert.match(r.answer,/未拆封/);assert.match(r.answer,/定制/);
});

test('实际退款、退换货、改地址和取消订单交业务待办，不由模型冒充办理',async()=>{
  for(const question of ['我要退款','我已付款，可以退款吗','订单退款规则是什么','我的退款一般几天到账？','我已经申请退款，一般多久到？','退款还没到账','我要退货','帮我换货','帮我取消订单','我要修改收货地址']){
    const r=await answer({rules:'',facts:[refund]},question,[],noModel);
    assert.equal(r.action,'handoff',question);assert.equal(r.reasonCode,'business-action',question);assert.equal(r.modelCalled,false);assert.equal(r.answer,'不好意思，请稍等');
  }
});

test('放行规则咨询不放松事实与引用检查，缺失依据仍等候',async()=>{
  const snapshot={rules:'',facts:[refund]};
  for(const output of [{action:'answer',answer:'立即到账。',source_ids:[]},{action:'clarify',answer:'一般1个工作日到账。',source_ids:[]},{action:'answer',answer:'一般1个工作日到账。',source_ids:['refund']}]){
    const r=await answer(snapshot,'退款一般几天到账？',[],model(output));assert.equal(r.action,'handoff');assert.equal(r.reasonCode,'answer-check');
  }
  const missing=await answer({rules:'',facts:[]},'退款一般几天到账？',[],model({action:'handoff',answer:'待确认',source_ids:[]}));
  assert.equal(missing.answer,'不好意思，请稍等');assert.equal(missing.reasonCode,'knowledge-missing');
});

test('未被本地规则覆盖的收尾明确交模型作普通接待，引用门槛仍保留',async()=>{
  const opts=model({action:'clarify',answer:'不客气，有问题随时问。',source_ids:[]}),fetcher=opts.fetcher;
  opts.fetcher=(_,options)=>{assert.match(JSON.parse(options.body).messages[0].content,/致谢、告别|感谢、告别/);return fetcher();};
  const r=await answer({rules:'',facts:[]},'服务很贴心，辛苦啦',[],opts);assert.equal(r.action,'clarify');assert.equal(r.modelCalled,true);
  const bad=await answer({rules:'',facts:[]},'服务很贴心，辛苦啦',[],model({action:'answer',answer:'这是赠品。',source_ids:[]}));
  assert.equal(bad.action,'handoff');assert.equal(bad.reasonCode,'answer-check');
});

test('否定办理和退换货费用咨询不误触发业务接管',async()=>{
  const pen={id:'pen',product:'P01',question:'P01单支多少钱？',answer:'P01单支2元。'};
  for(const question of ['不需要退款，P01单支多少钱？','我不想换货，只问P01单支多少钱','不用退货，P01单支多少钱？']){
    const r=await answer({rules:'',facts:[pen]},question,[],model({action:'answer',answer:pen.answer,source_ids:['pen']}));assert.equal(r.action,'answer',question);
  }
  const fee={id:'fee',product:'退换货运费',question:'退货运费由谁承担？',answer:'非质量问题的退换货运费由买家承担。'};
  for(const question of ['退货运费由谁承担？','换货有什么费用？']){
    const r=await answer({rules:'',facts:[fee]},question,[],model({action:'answer',answer:fee.answer,source_ids:['fee']}));assert.equal(r.action,'answer',question);
  }
  assert.equal((await answer({rules:'',facts:[]},'不需要换货，我要退款',[],noModel)).reasonCode,'business-action');
});

test('并列退换货政策允许单项回答，但条件和例外不能丢失',()=>{
  const fact={answer:'仅限未拆封的商品支持退货和换货，定制商品除外。'};
  assert.equal(checkFacts('未拆封的商品支持换货，定制商品除外。',[fact]).ok,true);
  assert.equal(checkFacts('支持换货，定制商品除外。',[fact]).ok,false);
  assert.equal(checkFacts('未拆封的商品支持换货。',[fact]).ok,false);
  assert.equal(checkFacts('未拆封的商品不支持换货，定制商品除外。',[fact]).ok,false);
});

test('并列否定不能反转，两项相反的政策分别核对',()=>{
  for(const join of ['和','与','及','以及','、']){
    const fact={answer:'不支持退货'+join+'换货。'};
    assert.equal(checkFacts('不支持换货。',[fact]).ok,true,join);
    assert.equal(checkFacts('支持换货。',[fact]).ok,false,join);
    assert.equal(checkFacts('支持退货'+join+'换货。',[fact]).ok,false,join);
  }
  const fact={answer:'支持退货，但不支持换货。'};
  assert.equal(checkFacts('不支持换货。',[fact]).ok,true);
  assert.equal(checkFacts('支持退货和换货。',[fact]).ok,false);
});

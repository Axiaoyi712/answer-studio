import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {database,createSpace,addFact,publish,answer} from '../core.mjs';
import {observeConversation} from '../conversation-memory.mjs';
import {bridgeReply} from '../bridge.mjs';
import {validateProductData,productAnswer} from '../product-data.mjs';
if(!process.env.DEEPSEEK_API_KEY)throw Error('需要已配置模型；只使用合成资料，不发送平台消息');
const traces=[];const options={fetcher:async(url,o)=>{const res=await fetch(url,o);const body=await res.json();traces.push({evidence:JSON.parse(JSON.parse(o.body).messages[0].content.split('证据：')[1]||'[]'),output:body.choices?.[0]?.message?.content});return {ok:res.ok,status:res.status,json:async()=>body};},key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'},results=[];
const dir=resolve('work/business-quality-model',String(Date.now()));mkdirSync(dir,{recursive:true});
const db=database(join(dir,'isolated.sqlite')),space=createSpace(db,'合成文具客服');
try{
  const pen=addFact(db,space,{product:'P01中性笔',question:'P01什么规格、多少钱？',answer:'P01为0.5mm黑色中性笔，单支2元。',source:'合成资料'});
  const paper=addFact(db,space,{product:'A4打印纸',question:'A4纸一包多少张、多少钱？',answer:'A4纸80g，每包500张，每包20元。',source:'合成资料'});
  db.prepare('UPDATE facts SET approved=1 WHERE space=?').run(space);const version=publish(db,space),snapshot=JSON.parse(db.prepare('SELECT snapshot FROM versions WHERE id=?').get(version).snapshot);
  observeConversation(db,space,'test','visitor',[],'我需要P01，不要蓝色');for(let i=0;i<140;i++)observeConversation(db,space,'test','visitor',[],'补充背景'+i);
  const long=await bridgeReply(db,{space,account:'test',conversation:'visitor',question:'刚说那款多少钱？',history:[]},options);results.push({case:'长期型号记忆',...long});assert.equal(long.action,'answer');assert.match(long.answer,/2元/);assert.ok(long.sources.some(f=>f.id===pen));
  observeConversation(db,space,'test','visitor',[],'不要P02，我还是看P01');observeConversation(db,space,'test','visitor',[],'蓝色也可以');
  const corrected=await bridgeReply(db,{space,account:'test',conversation:'visitor',question:'刚说那款多少钱？',history:[]},options);results.push({case:'否定型号与颜色改口',...corrected});assert.equal(corrected.action,'answer');assert.ok(!corrected.followUp?.questions.length,'不能把颜色偏好改口虚构成新的库存咨询');assert.match(corrected.answer,/2元/);assert.equal(corrected.context.product,'p01');assert.ok(corrected.context.excludedModels.includes('p02'));assert.ok(corrected.context.preferences.includes('蓝色：可以'));
  const multi=await answer(snapshot,'P01笔尖多粗，多少钱？A4纸每包多少张、多少钱？',[],options);results.push({case:'多商品多诉求',...multi});assert.equal(multi.action,'answer');assert.match(multi.answer,/0.5/);assert.match(multi.answer,/500/);assert.match(multi.answer,/20元/);assert.ok(multi.sources.some(f=>f.id===paper));
  const partial=await answer(snapshot,'P01单支多少钱？可以在笔上激光刻我的名字吗？',[],options);results.push({case:'部分回复与知识缺口',...partial});assert.equal(partial.action,'answer');assert.match(partial.answer,/2元/);assert.ok(partial.followUp?.questions.some(q=>/刻|名字/.test(q)));assert.match(partial.answer,/不好意思，请稍等/);
  const invoice={id:'invoice',product:'开票规则',question:'支持开发票吗？',answer:'付款后支持开具电子发票，不提供纸质发票。',source:'合成经营规则'};
  const billed=await answer({rules:'',facts:[invoice]},'付款后可以开电子发票吗？',[],options);results.push({case:'开票政策与条件',...billed});assert.equal(billed.action,'answer');assert.match(billed.answer,/电子/);assert.match(billed.answer,/付款后/);
  const paperInvoice=await answer({rules:'',facts:[invoice]},'付款后可以开纸质发票吗？',[],options);results.push({case:'明确否定纸质发票',...paperInvoice});assert.equal(paperInvoice.action,'answer');assert.match(paperInvoice.answer,/不提供|不能|不支持|不可以|不可|无法/);
  const returns={id:'returns',product:'退货规则',question:'支持退货吗？',answer:'仅限未拆封的商品支持退货，定制商品除外。',source:'合成经营规则'};
  const conditional=await answer({rules:'',facts:[returns]},'退货有什么条件？',[],options);results.push({case:'退货条件与例外',...conditional});assert.equal(conditional.action,'answer');assert.match(conditional.answer,/未拆封/);assert.match(conditional.answer,/定制/);
  observeConversation(db,space,'test','visitor',[],'蓝色不行，黑色可以');const oral=await bridgeReply(db,{space,account:'test',conversation:'visitor',question:'刚说那款多少钱？',history:[]},options);results.push({case:'口语改口后继续接待',...oral});assert.equal(oral.action,'answer');assert.ok(oral.context.preferences.includes('蓝色：不接受'));assert.ok(oral.context.preferences.includes('黑色：可以'));assert.match(oral.answer,/2元/);
  const data=validateProductData({aliases:['考试水笔'],price:{amount:3,unit:'支'},specs:'0.5mm黑色中性笔',policies:[{topic:'开票',allowed:true,variant:'电子',conditions:['付款后'],exceptions:[]}]}),typed={rules:'',facts:[{id:'typed',product:'P01',question:'P01价格和服务规则',answer:productAnswer('P01',data),source:'合成字段资料',data}]};
  for(const [name,question,pattern] of [['统一资料别名检索','考试水笔一支多少钱？',/3元/],['统一政策条件','P01付款后能开电子发票吗？',/付款后/],['否定投诉仍接待','不是投诉，考试水笔单支多少钱？',/3元/]]){const r=await answer(typed,question,[],options);results.push({case:name,...r});assert.equal(r.action,'answer',name);assert.match(r.answer,pattern,name);}
  console.log(JSON.stringify({ok:true,total:results.length,directory:dir}));
}finally{writeFileSync(join(dir,'result.json'),JSON.stringify(results,null,2));writeFileSync(join(dir,'traces.json'),JSON.stringify(traces,null,2));db.close();}

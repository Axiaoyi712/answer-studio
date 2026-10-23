// Only imported by the isolated workbench browser verifier; no external model requests.
const realFetch=globalThis.fetch;let failed=false;
globalThis.fetch=async(url,options)=>{
  if(url!=='https://api.deepseek.com/chat/completions')return realFetch(url,options);
  const request=JSON.parse(options.body);
  if(request.messages[0].content.includes('证据：')){const facts=JSON.parse(request.messages[0].content.split('证据：')[1]);return {ok:true,json:async()=>({usage:{prompt_tokens:100,completion_tokens:20},choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:facts.length?'answer':'handoff',answer:facts.map(f=>f.answer).join(' ')||'不好意思，请稍等',source_ids:facts.map(f=>f.id)})}}]})};}
  const context=JSON.parse(request.messages[1].content),user=context.dialogue.filter(m=>m.role==='user').at(-1),message=user?.content||'';
  const make=(product,question,answer,gap_ids=[])=>({product,question,answer,evidence:[{turn_id:user.id,quote:message}],gap_ids});
  let reply='你想做什么业务的客服，主要有哪些类目？',facts=[];
  if(context.mode==='gaps')reply='之前客户问“P01多久发货？”，你通常多久发出，是否有例外？';
  else if(context.mode==='summary')reply='已整理主营类目、笔和纸的规格价格，以及发货时间。售后规则仍待你确认。';
  else if(context.mode==='message'){
    if(message.includes('故障重试')&&!failed){failed=true;return {ok:false,status:503};}
    if(message.includes('主营中性笔')){reply='中性笔有哪些型号、笔尖和墨色？打印纸的尺寸、克重及每包数量是什么？';facts=[make('文具','主营哪些文具？','主营中性笔和打印纸。')];}
    else if(message.includes('0.5mm')){reply='已记录笔和纸的规格价格。通常多久发货，运费怎么算？';facts=[make('P01中性笔','P01中性笔是什么规格、多少钱？','P01是0.5mm黑色中性笔，单支2元。'),make('A4打印纸','A4打印纸是什么规格、多少钱？','A4打印纸为80g，500张一包20元。')];}
    else if(message.includes('48小时')){reply='已整理发货规则，售后退换有什么条件？';facts=[make('发货','P01多久发货？','付款后48小时内发出，预售除外。',context.gaps.map(g=>g.id))];}
    else reply='收到。还需要补充哪些售后规则？';
  }
  const progress=message.includes('48小时')?[{topic:'shipping',state:'confirmed',note:'预售除外',evidence:[{turn_id:user.id,quote:message}]}]:[];
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply,facts,progress})}}]})};
};

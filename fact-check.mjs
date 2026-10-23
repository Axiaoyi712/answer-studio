import {modelNames} from './retrieval.mjs';
const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const clauses=text=>text.split(/(?<=[，,。；;！？!?\n])/).map(s=>s.trim()).filter(Boolean);
function number(text){
  if(/^\d/.test(text))return Number(text);
  const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100,千:1000,万:10000};let sum=0,value=0;
  for(const c of text){if(c in digits)value=digits[c];else if(c==='万'){sum=(sum+value)*10000;value=0;}else{sum+=(value||1)*units[c];value=0;}}return sum+value;
}
const unitMap={元:['钱',1],块:['钱',1],块钱:['钱',1],人民币:['钱',1],rmb:['钱',1],mm:['长度',1],毫米:['长度',1],cm:['长度',10],厘米:['长度',10],m:['长度',1000],米:['长度',1000],g:['重量',1],克:['重量',1],kg:['重量',1000],千克:['重量',1000],公斤:['重量',1000],小时:['时长',1],天:['时长',24],日:['时长',24],分钟:['时长',1/60],工作日:['工作日',1],'%':['比例',1],张:['张',1],页:['页',1],支:['支',1],包:['包',1],盒:['盒',1],件:['件',1],个:['个',1],份:['份',1],次:['次',1]};
function quantityField(prefix,type){
  if(type!=='长度')return '';
  const part=prefix.split(/[，,。；;\n]/).at(-1),matches=[...part.matchAll(/(笔身|笔芯|笔尖|纸张厚度|厚度|直径|宽度|高度|长度)(?:的|长度|规格|尺寸|直径|长|为|是|约|[:：])*/g)],last=matches.at(-1);
  return last&&part.length-last.index-last[0].length<=4?last[1]:'';
}
function quantities(text){
  text=normalize(text).replace(/[一二两三123]个(?:问题|方面|信息|需求)/g,'').replace(/(\d+|[一二两三四五六七八九十]+)个工作日/g,'$1工作日');const values=[];
  for(const m of text.matchAll(/(?<![a-z\d.])(\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)(工作日|块钱|人民币|小时|分钟|毫米|厘米|千克|公斤|rmb|mm|cm|kg|元|块|天|日|米|克|张|页|支|包|盒|件|个|份|次|%|g\b|m\b)/g)){
    const [type,scale]=unitMap[m[2]],value=Number((number(m[1])*scale).toFixed(8));
    const around=text.slice(Math.max(0,m.index-8),m.index),after=text.slice(m.index+m[0].length,m.index+m[0].length+5);
    const per=type==='钱'?(after.match(/^(?:[/／]|一|每)([支包盒件张个份])/u)?.[1]||around.match(/(?:每|单|一)([支包盒件张个份])[^支包盒件张个份]*$/u)?.[1]||''):'';
    const relation=/^(?:以上|起)/.test(after)||/(?:至少|最低|不少于)$/.test(around)?'min':/^(?:以内|内|前)/.test(after)?'max':/^(?:之后|后)/.test(after)?'after':'';
    const negative=/(?:不是|并非|不为|不等于)$/.test(around);
    values.push({type,value,per,relation,negative,field:quantityField(text.slice(0,m.index),type),raw:m[0]});
  }
  for(const m of text.matchAll(/[¥￥](\d+(?:\.\d+)?)/g))values.push({type:'钱',value:Number(m[1]),per:'',raw:m[0]});
  return values;
}
function asking(text){return /[？?]$/.test(text)&&/^(?:请问|请确认|请告诉|请提供|请补充|麻烦|方便|能否说明|你(?:想|需要|要哪|要什么|要多少|要几|指的|说的|是想)|您(?:想|需要|要哪|要什么|要多少|要几|指的|说的|是想)|需要|想要|要多少|要几|是否需要)/.test(text);}
const shipping=text=>/发货|发出|寄出|发走|寄走/.test(text),arrival=text=>/送到|送达|到货|收到货|到达/.test(text);
function positive(text,claim){let index=-1;while((index=text.indexOf(claim,index+1))>=0){if(!/(?:不|没|没有|无|未|不能|无法|不支持|不保证|并非)$/.test(text.slice(Math.max(0,index-4),index)))return true;}return false;}
function uncertain(text,claim){
  const index=text.indexOf(claim),before=text.slice(0,index),after=text.slice(index+claim.length);
  return /(?:是否|能否|有没有|有无)(?:提供|支持|有)?$/.test(before)||/(?:确认|核实|核对)(?:一下)?$/.test(before)
    ||/^(?:的)?(?:情况|信息|规则|问题|政策)?(?:我|我们|这边)?(?:都|还|先|再|暂时)?(?:需(?:要)?|待|尚未|还未|无法|不能).{0,2}(?:确认|核实|核对|确定)/.test(after)
    ||/^(?:的)?(?:情况|信息|规则|政策)?(?:要看|以.{0,20}为准)/.test(after);
}
const policies=[['开票',/(?:开具|开|提供)?(?:电子|纸质)?发票|开票/g],['退货',/(?:无理由)?退货|退不了货/g],['换货',/换货|换不了货/g],['退款',/退款|退费|退不了款/g],['保修',/保修/g],['试用',/试用/g],['定制',/定制/g],['货到付款',/货到付款/g],['包邮',/包邮/g],['正品',/正品/g],['送达时间',/(?:今天|明天|当天|今日|明日)(?:就|可以|能够|能|会|可|保证)*(?:送到|送达|到货|到达|收到货)/g]];
const policyText=text=>normalize(text).replace(/免运费|免邮费|免邮|运费全免|运费免费/g,'包邮').replace(/原装正品/g,'正品');
function conditions(text){
  return [...text.matchAll(/未拆封|已拆封|未使用|已使用|未激活|已激活|质量问题|原包装|同城订单|同城|(?:满|不满|超过|达到)\d+(?:\.\d+)?元|(?:收货|签收|购买|下单|付款)(?:后|起)?\d+(?:天|日)内|(?:付款|下单|收货|签收|发货|审核通过)后|(?:仅限|限于|只有|仅在|只在)([^，,。；;]{1,24}?)(?=才|支持|可以|可|能|时|[，,]|$)|(?:需要|必须|须|需)([^，,。；;]{1,24}?)(?=才|后|方可)|(?:偏远地区|港澳台|预售|定制)(?:商品|产品)?除外/g)].map(m=>m[1]||m[2]||m[0]);
}
function policyClaims(text,initialModels=[]){
  const claims=[];
  let models=initialModels,previous=[];
  for(const rawSentence of text.split(/[。；;！!？?\n]/)){
    const sentence=policyText(rawSentence).replace(/(预售|定制)(?:商品|产品)除外/g,'$1除外');
    if(!sentence)continue;
    if(/^(?:但|其中)?[^，,]{1,40}除外$/.test(sentence)&&!policies.some(([,p])=>[...sentence.matchAll(p)].some(m=>m[0]!=='定制'))){const exception=sentence.replace(/^(?:但|其中)/,'');for(const c of previous){c.conditions.push(exception);c.text+=exception;}continue;}
    const start=claims.length;
    const exceptions=sentence.match(/(?:偏远地区|港澳台|预售|定制)除外/g)||[];
    let context='';
    for(const part of sentence.split(/[，,]/)){
      const ids=modelNames(part);if(ids.length)models=ids;
      let found=false;
      for(const [topic,pattern] of policies)for(const m of part.matchAll(pattern)){
        found=true;const before=part.slice(0,m.index),after=part.slice(m.index+m[0].length);
        // Questions, conditional requests and statements awaiting verification are not commitments.
        if(uncertain(part,m[0])||/是否|能否|能不能|可不可以/.test(before)||/^(?:吗|么|的话|时|规则|政策|条件|流程)/.test(after))continue;
        if(topic==='送达时间'&&/(?:不|不能|无法|没法)(?:保证|承诺)?$/.test(before))continue;
        // A shared verb applies across explicit conjunctions, e.g. "不支持退货和换货".
        const governed=before.replace(/(?:(?:退货|换货|退款|退费)(?:和|与|及|以及|、))+$/,'');
        const prefix=governed.match(/(?:开不了|提供不了|办理不了|没法|不支持|不提供|不接受|不允许|不享受|不能|不可以|不可|无法|没有|无需|不需要|不是|并非|支持|提供|接受|允许|享受|可以|可|能|不)(?:申请|办理|进行)?$/)?.[0];
        const suffix=after.match(/^(?:暂时|目前)?(?:不支持|不提供|不接受|不允许|不可以|不能|不可|不行|可以|支持|允许)/)?.[0];
        const cue=m[0].includes('不了')?'不能':suffix||prefix||(['包邮','正品','送达时间'].includes(topic)?'支持':'');if(!cue)continue;
        claims.push({topic,models,allowed:!/^不|^并非|^无法|^没有|^无需|^没法|不了$/.test(cue.replace(/^(?:暂时|目前)/,'')),variant:m[0].match(/电子|纸质|无理由|今天|明天|当天|今日|明日/)?.[0]||'',text:context+part+exceptions.join('，'),conditions:[...conditions(context+part),...exceptions]});
      }
      context=!found&&conditions(part).length?context+part+'，':'';
    }
    previous=claims.slice(start);
  }
  return claims;
}

export function priceClaims(fact){
  if(/满|起|以上|以下|阶梯|活动|会员|批发|零售|至少/.test(fact.answer))return [];
  return quantities(fact.answer).filter(v=>v.type==='钱'&&v.per&&!v.negative).map(v=>({field:'单价/'+v.per,value:v.value}));
}

// Compare only explicitly named attributes and policies with the same conditions.
export function criticalClaims(fact){
  const specs=clauses(fact.answer).filter(c=>!/可选|或者|或是|两种|多种|[～~至]/.test(c)).flatMap(c=>quantities(c).filter(v=>v.field&&!v.negative).map(v=>({field:v.type+'/'+v.field,scope:[...new Set(conditions(normalize(c)))].sort().join('|'),value:JSON.stringify([v.value,v.relation])})));
  return [...specs,...policyClaims(fact.answer).map(c=>({field:'政策/'+c.topic+'/'+c.variant,scope:[...new Set(c.conditions)].sort().join('|'),value:c.allowed}))];
}

// Deterministic checks for explicit critical facts; this is not a full semantic proof.
export function checkFacts(text,sources){
  const knownPolicies=sources.flatMap(f=>[...policyClaims(f.answer,modelNames((f.product||'')+' '+(f.question||''))).filter(c=>!f.data?.policies.some(p=>p.topic===c.topic)),...(f.data?f.data.policies.map(p=>({topic:p.topic,models:modelNames(f.product),allowed:p.allowed,variant:p.variant,conditions:[...p.conditions.map(normalize),...p.exceptions.map(e=>normalize(e).replace(/(?:商品|产品)?除外$/,'')+'除外')]})):[])]);
  for(const claim of policyClaims(text)){
    const supported=knownPolicies.some(k=>k.topic===claim.topic&&k.allowed===claim.allowed&&(!claim.models.length||!k.models.length||claim.models.some(id=>k.models.includes(id)))&&(claim.allowed?(!claim.variant||k.variant===claim.variant):(!k.variant||k.variant===claim.variant))&&k.conditions.every(c=>{const i=claim.text.indexOf(c);return i>=0&&!/(?:不|不是|并非|非)$/.test(claim.text.slice(0,i));}));
    if(!supported)return {ok:false,detail:'回复中的'+claim.topic+'政策肯定、否定或适用条件没有对应依据'};
  }
  let scope=[];
  for(const clause of clauses(text)){
    if(asking(clause))continue;
    const ids=modelNames(clause);if(ids.length)scope=ids;
    const relevant=scope.length?sources.filter(f=>{const models=modelNames(f.product+' '+f.question);return !models.length||scope.some(id=>models.includes(id));}):sources;
    const evidence=relevant.map(f=>f.answer).join('\n'),normalized=normalize(evidence),values=quantities(clause),known=quantities(evidence);
    for(const id of ids)if(!relevant.some(f=>modelNames(f.product+' '+f.question+' '+f.answer).includes(id)))return {ok:false,detail:'回复包含无依据的型号 '+id};
    for(const v of values){
      const matches=known.filter(k=>k.type===v.type&&k.value===v.value&&!!k.negative===!!v.negative&&(!v.field||!k.field||k.field===v.field));
      if(!matches.length||v.per&&matches.every(k=>k.per&&k.per!==v.per))return {ok:false,detail:'回复中的数值或计价单位没有对应依据：'+v.raw+(v.per?'/'+v.per:'')};
      if(v.type==='钱'&&matches.every(k=>k.relation==='min')&&v.relation!=='min')return {ok:false,detail:'不能把起步价改成确定售价'};
      if(v.type==='时长'&&v.relation==='after'&&matches.every(k=>k.relation==='max'))return {ok:false,detail:'不能把时间上限改成之后才处理'};
      if(v.type==='时长'&&arrival(clause)&&!relevant.some(f=>arrival(f.answer)&&quantities(f.answer).some(k=>k.type===v.type&&k.value===v.value)))return {ok:false,detail:'不能把发货时间当作送达时间'};
    }
    for(const color of normalize(clause).match(/[红蓝黑白绿黄紫粉橙灰棕]色/g)||[])if(!uncertain(clause,color)&&(!normalized.includes(color)||positive(normalized,color)!==positive(normalize(clause),color)))return {ok:false,detail:'回复中的颜色没有对应依据：'+color};
    for(const claim of normalize(clause).match(/有现货|有货|现货充足|库存充足|永久有效|不限量|无限次|不洇墨/g)||[])if(!uncertain(clause,claim)&&(!normalized.includes(claim)||positive(normalize(clause),claim)!==positive(normalized,claim)))return {ok:false,detail:'回复包含未经确认的承诺：'+claim};
    if(!/尚未|还未|还没|没有|未曾|并未|尚无|是否|能否|了吗[？?]|完成后|办好后|到账后|取消后/.test(clause)&&/已(?:经)?(?:帮你|帮您|为你|为您)?(?:办理|处理)?(?:退款|退费|取消订单|修改地址|修改订单|联系人工|催单|改好地址)|(?:退款|退费|订单|地址).{0,8}已(?:经)?(?:办理|处理|修改)?(?:完成|好|取消|到账)/.test(clause))return {ok:false,detail:'当前没有业务执行依据，不能声称已经操作完成'};
    if(values.some(v=>v.type==='时长')&&shipping(clause)&&relevant.some(f=>/预售/.test(f.answer)&&/除外|另行|单独/.test(f.answer))&&!/现货|预售[^。；\n]*(?:除外|另行|单独|不适用)|不含预售/.test(text))return {ok:false,detail:'发货答复遗漏了预售例外条件'};
  }
  return {ok:true};
}

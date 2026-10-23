import {modelNames} from './retrieval.mjs';

function suffixPreference(text){
  text=text.replace(/^(?:我觉得|现在|暂时|还是|的也|也|都|就)/,'');
  if(/^(?:不一定|不确定|没想好|再考虑|待定|行不行|可不可以|能不能)/.test(text))return 'uncertain';
  if(/^(?:不(?:要|需要|考虑|选|喜欢|合适|行|可以|接受)|不能接受|接受不了|算了)/.test(text))return 'deny';
  if(/^(?:可以|行|合适|接受|能接受|没问题)/.test(text))return 'allow';
  return null;
}

export function setupMemory(db){db.exec('CREATE TABLE IF NOT EXISTS conversation_memory(space TEXT NOT NULL REFERENCES spaces(id),account TEXT NOT NULL,conversation TEXT NOT NULL,body TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(space,account,conversation))');}
export function mergeObserved(previous,incoming){
  let overlap=0;
  for(let count=Math.min(previous.length,incoming.length);count>0;count--)if(JSON.stringify(previous.slice(-count))===JSON.stringify(incoming.slice(0,count))){overlap=count;break;}
  return [...previous,...incoming.slice(overlap)].slice(-120);
}
export function memoryContext(history,seed={}){
  const user=history.filter(m=>m.role==='user'),slots={...(seed.version===2?seed.preferenceSlots:{})};
  let selected=seed.version===2?modelNames(seed.product||''):[],excluded=new Set(seed.version===2?seed.excludedModels||[]:[]);
  const negative=/(?:不要|不需要|不考虑|不想买|不买|不选|不喜欢|不用|排除|不是)/g;
  for(const message of user){
    const text=message.content.normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g,'');
    if(/清空需求|重新开始选|之前的需求作废/.test(text)){selected=[];excluded.clear();for(const key of Object.keys(slots))delete slots[key];}
    if(/换个其他|换个别的|另外看看|先不买了|都不要了/.test(text))selected=[];
    if(/颜色不限|颜色随便|颜色都可以|不限制颜色/.test(text))for(const key of Object.keys(slots))if(key.startsWith('颜色:'))delete slots[key];
    let positive=[];
    for(const clause of text.split(/[，,。；;！!？?\n]/)){
      let previousEnd=0,reject=false;
      const matches=[...clause.matchAll(/[a-z]{1,12}[-_]?\d+(?:[._-][a-z0-9]+)*/g)];
      for(const [i,m] of matches.entries()){
        const before=clause.slice(previousEnd,m.index),after=clause.slice(m.index+m[0].length,matches[i+1]?.index),id=m[0];previousEnd=m.index+m[0].length;
        const suffix=suffixPreference(after);
        if(suffix==='uncertain'){positive=positive.filter(value=>value!==id);selected=selected.filter(value=>value!==id);excluded.delete(id);continue;}
        const cancelled=/取消.{0,6}排除|不再排除|重新考虑/.test(before)||suffix==='allow';
        const negatives=[...before.matchAll(negative)],clean=before.replace(negative,m=>' '.repeat(m.length));
        const positives=[...clean.matchAll(/改成|换成|改买|选|买|要|需要|想要|是/g)];
        if(negatives.length||positives.length)reject=(negatives.at(-1)?.index??-1)>(positives.at(-1)?.index??-1);
        if(cancelled){excluded.delete(id);continue;}
        if(reject||suffix==='deny'||/^(?:我)?(?:不要|不考虑|不买|不选)/.test(after)){excluded.add(id);selected=selected.filter(value=>value!==id);}
        else{positive.push(id);excluded.delete(id);}
      }
    }
    if(positive.length)selected=[...new Set(positive)];
    let classified=false;
    for(const color of ['黑色','蓝色','红色','白色','绿色','黄色','粉色','紫色','棕色','灰色']){
      const index=text.lastIndexOf(color);if(index<0)continue;const before=text.slice(0,index).split(/[，,。；;！!？?\n]/).at(-1).slice(-14),after=text.slice(index+color.length,index+color.length+12);
      const suffix=suffixPreference(after);
      if(suffix==='uncertain'){delete slots['颜色:'+color];classified=true;continue;}
      const reset=/取消.{0,6}排除|不再排除/.test(before),allow=suffix==='allow';
      const negatives=[...before.matchAll(negative)],positives=[...before.replace(negative,m=>' '.repeat(m.length)).matchAll(/改成|换成|想要|需要|选|要/g)];
      const deny=!reset&&!allow&&((negatives.at(-1)?.index??-1)>(positives.at(-1)?.index??-1)||suffix==='deny');
      if(deny||allow||reset||/改成|换成|想要|需要|选|要/.test(before)){const key='颜色:'+color;delete slots[key];slots[key]=color+'：'+(deny?'不接受':'可以');classified=true;}
    }
    for(const [key,pattern] of [['预算',/预算/],['用途',/用途|用来/]])if(pattern.test(text)){delete slots[key];slots[key]=message.content.slice(0,300);classified=true;}
    if(!classified&&!modelNames(text).length&&/不要|不需要|不考虑|需要/.test(text)){const key='其他:'+text.slice(0,50);slots[key]=message.content.slice(0,300);}
  }
  const preferenceSlots=Object.fromEntries(Object.entries(slots).slice(-12));
  return {version:2,product:selected.filter(id=>!excluded.has(id)).join('、'),excludedModels:[...excluded].slice(-20),preferenceSlots,preferences:Object.values(preferenceSlots).slice(-6),turns:history.length};
}
export function observeConversation(db,space,account,conversation,observed,question){
  if(!account&&!conversation)return {history:observed,context:memoryContext(observed)};
  for(const [name,value] of [['账号',account],['会话',conversation]])if(typeof value!=='string'||!value||value.length>150)throw Error(name+'标识无效');
  const old=db.prepare('SELECT body FROM conversation_memory WHERE space=? AND account=? AND conversation=?').get(space,account,conversation);
  const previous=old?JSON.parse(old.body):{};
  const history=mergeObserved(Array.isArray(previous)?previous:previous.history||[],observed);
  const stored=mergeObserved(history,[{role:'user',content:question}]);
  const context=memoryContext(stored,previous.context);
  db.prepare('INSERT INTO conversation_memory VALUES(?,?,?,?,?) ON CONFLICT(space,account,conversation) DO UPDATE SET body=excluded.body,updated=excluded.updated').run(space,account,conversation,JSON.stringify({history:stored,context}),Date.now());
  return {history,context};
}

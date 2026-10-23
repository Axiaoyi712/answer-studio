import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

export const digest=value=>createHash('sha256').update(value).digest('hex');
export const textKey=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const privateText=text=>/\b(?:sk-[a-zA-Z0-9]{16,}|1[3-9]\d{9})\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);

// These CSV files contain quoted commas, escaped quotes and multiline responses.
export function csv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!cell||quoted)quoted=!quoted;else throw Error('CSV 引号位置无效');}
    else if(!quoted&&(ch===','||ch==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(ch==='\n'){rows.push(row);row=[];}}
    else cell+=ch;
  }
  if(quoted)throw Error('CSV 引号未闭合');
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift()?.map(s=>s.replace(/^\uFEFF/,''));
  if(!header?.length||new Set(header).size!==header.length)throw Error('CSV 列名无效');
  return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==header.length)throw Error('CSV 列数不一致');return Object.fromEntries(header.map((h,i)=>[h,r[i]]));});
}

export function verifyBytes(bytes,file){
  if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw Error('数据校验失败：'+file.path);
  return bytes;
}
export function readSource(source,root){
  const files=new Map(source.files.map(file=>[file.path,verifyBytes(readFileSync(join(root,source.id,file.local)),file)]));
  return path=>{if(!files.has(path))throw Error('未登记数据文件');return files.get(path);};
}

export function intentRows(train,test){
  const seen=new Map(),quarantined=new Set(),rows=[];
  for(const row of [...train,...test]){
    if(typeof row.question!=='string'||!row.question.trim()||typeof row.label!=='string'||!row.label)throw Error('意图数据格式无效');
    const key=textKey(row.question);if(!key||privateText(row.question))continue;
    if(seen.has(key)&&seen.get(key)!==row.label)quarantined.add(key);
    seen.set(key,row.label);
  }
  const used=new Set();
  // Training/reference examples take precedence; exact duplicates never enter evaluation.
  for(const row of [...train,...test]){const key=textKey(row.question);if(!key||privateText(row.question)||used.has(key)||quarantined.has(key))continue;used.add(key);rows.push(row);}
  return {rows,quarantined:quarantined.size,removed:train.length+test.length-rows.length};
}

export function crosswoz(dialogues,split){
  const rows=[];
  for(const [id,d] of Object.entries(dialogues)){
    if(!Array.isArray(d.messages))throw Error('CrossWOZ 缺少 messages');
    const turns=d.messages.map((m,index)=>{
      if(!['usr','sys'].includes(m.role)||typeof m.content!=='string'||!Array.isArray(m.dialog_act))throw Error('CrossWOZ 对话格式无效');
      return {id:id+':'+index,role:m.role==='usr'?'user':'assistant',content:m.content,acts:m.dialog_act};
    });
    // Drop the entire dialogue if a contact/key pattern appears anywhere in the history.
    if(!turns.some(t=>privateText(t.content)))rows.push({id,split,turns});
  }
  return rows;
}
export function socialCases(dialogues){
  const seen=new Set(),cases=[];
  for(const d of dialogues)for(const t of d.turns){
    if(t.role!=='user'||!t.acts.length||!t.acts.every(a=>a[0]==='General'&&['greet','thank','bye'].includes(a[1])))continue;
    const key=textKey(t.content);if(seen.has(key))continue;seen.add(key);
    cases.push({id:t.id,question:t.content,split:d.split,labels:[...new Set(t.acts.map(a=>a[1]))]});
  }
  return cases;
}
export function drcd(body){
  const facts=[],cases=[];let invalid=0;
  for(const article of body.data||[])for(const p of article.paragraphs||[]){
    if(typeof p.context!=='string'||privateText(p.context))continue;
    const id=String(p.id);if(facts.some(f=>f.id===id))throw Error('DRCD 段落 ID 重复');
    facts.push({id,product:'',question:article.title||'',answer:p.context});
    for(const q of p.qas||[]){
      const answers=q.answers||[];
      if(!answers.length||typeof q.question!=='string'||privateText(q.question)||!answers.every(a=>typeof a.text==='string'&&a.text.trim()&&Number.isInteger(a.answer_start)&&p.context.slice(a.answer_start,a.answer_start+a.text.length)===a.text)){invalid++;continue;}
      cases.push({id:String(q.id),question:q.question,source:id,answers:[...new Set(answers.map(a=>a.text))],split:'upstream-dev'});
    }
  }
  return {facts,cases,invalid};
}
export function prepareSource(source,read){
  if(source.id==='banking77'){
    const parse=split=>csv(read('banking_data/'+split+'.csv').toString('utf8')).map((r,i)=>({id:split+':'+i,split,question:r.text,label:r.category}));
    return {kind:'intent',...intentRows(parse('train'),parse('test')),splitNote:'保留上游 train/test；去除规范化重复及冲突问法。'};
  }
  if(source.id==='bitext'){
    const rows=csv(read(source.files.find(f=>f.path.endsWith('.csv')).path).toString('utf8')).map((r,i)=>{
      const bucket=parseInt(digest(textKey(r.instruction)).slice(0,8),16)%10;
      return {id:String(i),split:bucket<7?'train':bucket<9?'dev':'test',question:r.instruction,label:r.intent,flags:r.flags};
    });
    return {kind:'intent',...intentRows(rows.filter(r=>r.split==='train'),rows.filter(r=>r.split!=='train')),splitNote:'原始文件无官方拆分；按规范化问题哈希自建 70/20/10 拆分。模板近似句仍可能跨集合，不能当独立真实客服测试。未使用原始 response。'};
  }
  if(source.id==='crosswoz'){
    const rows=[];
    for(const [name,split] of [['val','dev'],['test','test']]){
      // Read one named member to stdout; never extract archive paths onto the filesystem.
      const path='data/crosswoz/'+name+'.json.zip';read(path);
      const json=execFileSync('tar',['-xOf',source.rawFile(path),name+'.json'],{maxBuffer:64*1024*1024,windowsHide:true});
      rows.push(...crosswoz(JSON.parse(json),split));
    }
    const dev=socialCases(rows.filter(d=>d.split==='dev')),keys=new Set(dev.map(c=>textKey(c.question)));
    return {kind:'dialogue',rows,social:[...dev,...socialCases(rows.filter(d=>d.split==='test')).filter(c=>!keys.has(textKey(c.question)))],splitNote:'上游 val 用于开发；test 中与 val 规范化重复的纯社交问法不计入留出测试。旅游业务内容只保留为测试对话，不用作本站规则。'};
  }
  if(source.id==='drcd')return {kind:'reading',...drcd(JSON.parse(read('DRCD_dev.json'))),splitNote:'使用上游 dev 做通用依据检索探针；不是官方测试集成绩。检索文档只含标题、段落，不含参考问题或答案标签。'};
  throw Error('未支持的数据源');
}
export function sample(rows,n){return [...rows].sort((a,b)=>digest(a.id).localeCompare(digest(b.id))).slice(0,n);}
export function perLabel(rows,n){return [...new Set(rows.map(r=>r.label))].sort().flatMap(label=>sample(rows.filter(r=>r.label===label),n));}
export function loadDataset(source,root){
  return prepareSource({...source,rawFile:path=>join(root,source.id,source.files.find(f=>f.path===path).local)},readSource(source,root));
}

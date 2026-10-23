import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {answer} from '../core.mjs';
import {retrieve} from '../retrieval.mjs';
import {digest,loadDataset,perLabel,sample} from './public-datasets.mjs';

const args=process.argv.slice(2),value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
const split=value('--split','test'),withModel=args.includes('--model'),limit=Number(value('--limit','16'));
if(!['dev','test'].includes(split)||!Number.isInteger(limit)||limit<1||limit>40)throw Error('使用 --split dev|test，--limit 1–40');
if(withModel&&!process.env.DEEPSEEK_API_KEY)throw Error('真实模型检查需要服务端密钥；使用 node --env-file-if-exists=.env scripts/check-public-datasets.mjs --model');
const catalog=JSON.parse(readFileSync(new URL('../datasets/catalog.json',import.meta.url))),data=new Map();
for(const source of catalog.sources)data.set(source.id,loadDataset(source,resolve('work/public-datasets/raw')));
const report={created:new Date().toISOString(),split,codeHashes:Object.fromEntries(['core.mjs','retrieval.mjs','fact-check.mjs','social-replies.mjs','scripts/public-datasets.mjs','scripts/check-public-datasets.mjs'].map(path=>[path,digest(readFileSync(path))])),sources:catalog.sources.map(s=>({id:s.id,repo:s.repo,revision:s.revision,license:s.license,files:s.files.map(f=>({path:f.path,sha256:f.sha256}))})),metrics:[],results:[],limitations:['这是特定子任务的开发探针，不是模型置信概率、线上正确解决率或官方排行榜成绩。','英文银行/合成客服、中文旅游和百科资料与本站商品咨询存在领域差异。','未训练 DeepSeek 权重；未向正式知识库导入公开经营事实；未向平台发送消息。']};
const ratio=(n,total)=>total?n/total:null;
function retrievalProbe(id,facts,cases,expected,scope){
  const results=cases.map(c=>{const hits=retrieve(facts,c.question),rank=hits.findIndex(f=>expected(f,c))+1;return {dataset:id,id:c.id,question:c.question,expected:c.label||c.source,top:hits.map(h=>({id:h.id,label:h.label})),rank,passed:rank>0};});
  report.results.push(...results);const total=results.length;
  report.metrics.push({dataset:id,task:'retrieval',scope,total,referenceCount:facts.length,recallAt1:ratio(results.filter(r=>r.rank===1).length,total),recallAt5:ratio(results.filter(r=>r.rank>0).length,total),mrrAt5:ratio(results.reduce((n,r)=>n+(r.rank?1/r.rank:0),0),total)});
}
for(const id of ['banking77','bitext']){
  const d=data.get(id),reference=perLabel(d.rows.filter(r=>r.split==='train'),8),queries=perLabel(d.rows.filter(r=>r.split===(id==='bitext'?split:'test')),3);
  // Labels exist only in evaluation metadata; they are not indexed as query text.
  const facts=reference.map(r=>({...r,product:'',question:r.question,answer:''}));
  retrievalProbe(id,facts,queries,(f,c)=>f.label===c.label,d.splitNote+' 每个意图固定哈希选 8 条参考、3 条查询；只测同意图示例召回，不测订单执行或事实正确性。'+(id==='banking77'&&split==='dev'?' BANKING77 无 dev，本项仍用上游 test；不据此调参。':''));
}
const reading=data.get('drcd'),readingCases=sample(reading.cases,120);
retrievalProbe('drcd',reading.facts,readingCases,(f,c)=>f.id===c.source,reading.splitNote+' 固定哈希抽取 120 题；不把参考问题或答案标签放入被检索文档。');
const social=data.get('crosswoz').social.filter(c=>c.split===split),socialResults=[];
for(const c of social){
  const r=await answer({rules:'',facts:[]},c.question);
  const passed=['clarify','skip'].includes(r.action)&&!r.modelCalled&&!/请配置|密钥|智能助手|知识库|转人工|人工处理/.test(r.answer);
  socialResults.push({dataset:'crosswoz',id:c.id,question:c.question,labels:c.labels,passed,action:r.action,answer:r.answer,modelCalled:r.modelCalled,reason:r.reason});
}
report.results.push(...socialResults);report.metrics.push({dataset:'crosswoz',task:'local-social',scope:data.get('crosswoz').splitNote+' 仅测本地纯社交接待覆盖；不调用模型，不代表完整多轮任务成功。',total:social.length,passed:socialResults.filter(r=>r.passed).length,rate:ratio(socialResults.filter(r=>r.passed).length,social.length)});
if(withModel){
  let calls=0,promptTokens=0,completionTokens=0;
  const options={key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash',fetcher:async(url,o)=>{
    calls++;const response=await fetch(url,o),body=await response.json();promptTokens+=body.usage?.prompt_tokens||0;completionTokens+=body.usage?.completion_tokens||0;
    return {ok:response.ok,status:response.status,json:async()=>body};
  }},modelResults=[];
  // The production answer function is exercised; no independent toy QA prompt.
  for(const c of sample(readingCases,Math.ceil(limit/2))){
    try{
      const fact=reading.facts.find(f=>f.id===c.source),r=await answer({rules:'当前为阅读依据验证，回答保留资料原文用词与繁体字；简短回答。',facts:[fact]},c.question,[],options);
      const spanPassed=c.answers.some(a=>r.answer.includes(a)),citationPassed=r.sources.some(f=>f.id===c.source);
      modelResults.push({dataset:'drcd',id:c.id,question:c.question,passed:r.action==='answer'&&spanPassed&&citationPassed&&!r.followUp,spanPassed,citationPassed,answers:c.answers,...r});
    }catch(e){modelResults.push({dataset:'drcd',id:c.id,question:c.question,passed:false,error:e.message});}
    console.log('模型检查 '+modelResults.length+'/'+limit);
  }
  for(const c of sample(social,Math.floor(limit/2))){
    try{const r=await answer({rules:'',facts:[]},c.question,[],options);modelResults.push({dataset:'crosswoz',id:c.id,question:c.question,passed:['clarify','skip'].includes(r.action)&&!r.modelDiagnostic?.code?.match(/invalid|empty|truncated/)&&!r.reason?.includes('请配置')&&!/智能助手|知识库|转人工|人工处理/.test(r.answer),...r});}
    catch(e){modelResults.push({dataset:'crosswoz',id:c.id,question:c.question,passed:false,error:e.message});}
    console.log('模型检查 '+modelResults.length+'/'+limit);
  }
  report.model={model:options.model,calls,promptTokens,completionTokens,total:modelResults.length,passed:modelResults.filter(r=>r.passed).length,scope:'最多 '+limit+' 个公开样本；DRCD 指标为严格参考片段包含与有效引用，会把简繁转换/同义改写计作不匹配；社交样本可能由本地规则完成。无独立事实语义裁判。',results:modelResults};
}
const dir=resolve('work/public-datasets/reports',Date.now()+'-'+split+(withModel?'-model':''));mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2));
const percent=n=>n===null?'无样本':(n*100).toFixed(1)+'%',lines=['# 公开数据质量探针','',`时间：${report.created}；社交/Bitext 拆分：${split}。`,'','不将本报告数值当作业务正确解决率或模型置信概率。',''];
for(const m of report.metrics){lines.push(`## ${m.dataset} / ${m.task}`,'',m.scope,'',m.task==='retrieval'?`参考 ${m.referenceCount} 条，查询 ${m.total} 条；Recall@1 ${percent(m.recallAt1)}，Recall@5 ${percent(m.recallAt5)}，MRR@5 ${m.mrrAt5?.toFixed(3)}。`:`本地接待通过 ${m.passed}/${m.total}（${percent(m.rate)}）。`,'');}
if(report.model)lines.push('## 真实模型小样本','',`${report.model.passed}/${report.model.total}；实际请求 ${report.model.calls} 次，输入 ${report.model.promptTokens} Token，输出 ${report.model.completionTokens} Token。`,report.model.scope,'');
lines.push('## 未通过的本地社交用例','',...socialResults.filter(r=>!r.passed).slice(0,25).map(r=>'- '+r.question+' → '+r.action+'：'+r.answer),'','完整逐题结果、源码指纹、上游提交和校验值见同目录 report.json。');
writeFileSync(join(dir,'report.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({directory:dir,metrics:report.metrics.map(({scope,...m})=>m),model:report.model?{total:report.model.total,passed:report.model.passed,calls:report.model.calls}:undefined},null,2));

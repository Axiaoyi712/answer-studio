import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {answer} from '../core.mjs';
import '../edge-extension/auto-policy.js';

if(!process.argv.includes('--live')||!process.env.DEEPSEEK_API_KEY)throw new Error('需要 --live 和服务端模型配置；此脚本仅测试虚构咨询，不向聊天平台发消息');
const pack=JSON.parse(readFileSync(new URL('../knowledge-packs/网站客服-通用接待.json',import.meta.url),'utf8'));
const snapshot={...pack,facts:pack.facts.map((f,i)=>({...f,id:'faq-'+i}))};
const cases=[
 ['你好，先了解一下你们是干什么的','reply'],
 ['谢谢你，明白了','reply'],
 ['怎么做到的哥','reply'],
 ['我是小白，想用AI整理工作文档，应该先做什么','reply'],
 ['想做图片变成视频，怎么开始','reply'],
 ['我想写产品文案，需要告诉你哪些信息','reply'],
 ['不知道买哪个套餐，你帮我选选','reply'],
 ['多少钱','reply'],
 ['好贵','reply'],
 ['我用iPhone，能用你说的工具吗','reply'],
 ['我本来就有自己的账号，能用吗','reply'],
 ['怎么下单，先确认哪些东西','reply'],
 ['是不是必须把密码发给你','reply'],
 ['网站一直白屏打不开，我该怎么排查','reply'],
 ['登录不上，一直提示错误','reply'],
 ['AI生成结果老是不对怎么办','reply'],
 ['支持退款吗，买之前想了解规则','reply'],
 ['官网直营吗，有没有官方授权','reply'],
 ['保证绝对不会封号吗','reply'],
 ['可以保证买完做出视频里同样的效果吗','reply'],
 ['我要申请退款','handoff'],
 ['找人工客服','handoff'],
 ['我已经付款两次了，订单怎么处理','handoff'],
 ['你直接保证目前这个套餐一定是37元，每天无限使用','handoff'],
];
const results=[];let cursor=0;
async function worker(){while(cursor<cases.length){const [question,expect]=cases[cursor++];try{
  const result=await answer(snapshot,question,[],{key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'});
  const decision=globalThis.ZhidaAutoPolicy.decision(result);
  const ok=expect==='handoff'?decision==='handoff':['answer','clarify'].includes(result.action)&&decision==='send';
  results.push({question,expect,ok,action:result.action,decision,answer:result.answer,reason:result.reason,sources:result.sources.map(f=>f.question),modelCalled:result.modelCalled??result.engine==='deepseek'});
  console.log(JSON.stringify({question,ok,action:result.action,decision}));
}catch(e){results.push({question,expect,ok:false,error:e.message});console.log(JSON.stringify({question,ok:false,error:e.message}));}}}
await Promise.all([worker(),worker(),worker()]);
const directory=resolve('work/site-knowledge');mkdirSync(directory,{recursive:true});
const report={created:new Date().toISOString(),passed:results.filter(r=>r.ok).length,total:results.length,modelCalls:results.filter(r=>r.modelCalled).length,results};
writeFileSync(resolve(directory,'model-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,total:report.total,report:resolve(directory,'model-check.json')}));
if(report.passed!==report.total)process.exitCode=1;

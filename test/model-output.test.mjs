import test from 'node:test';
import assert from 'node:assert/strict';
import {answer} from '../core.mjs';

const valid={action:'clarify',answer:'请问你想了解哪项服务？',source_ids:[]};
const reply=(content,finish_reason='stop',extra={})=>({choices:[{finish_reason,message:{content,...extra}}]});
function setup(bodies){
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({body:JSON.parse(options.body),signal:options.signal});assert.ok(calls.length<=bodies.length,'不应额外请求模型');return {ok:true,json:async()=>bodies[calls.length-1]};};
 return {calls,run:()=>answer({rules:'简短接待，只根据资料提供商品事实',facts:[]},'你可以帮我吗',[],{key:'test',fetcher})};
}

test('完整 JSON 代码块和 BOM 可解析，但正文仍需通过字段校验',async()=>{
 const h=setup([reply('\uFEFF \n```json\n'+JSON.stringify(valid)+'\n```')]);
 const r=await h.run();assert.equal(r.action,'clarify');assert.equal(h.calls.length,1);assert.equal(r.modelDiagnostic.code,'ok');
 assert.deepEqual(h.calls[0].body.thinking,{type:'disabled'});
});
test('空内容只重新生成一次，共享超时预算，不使用思考文本代替回答',async()=>{
 const marker='private-reasoning-not-an-answer';
 const h=setup([reply('', 'stop',{reasoning_content:marker}),reply(JSON.stringify(valid))]);
 const r=await h.run();assert.equal(r.answer,valid.answer);assert.equal(r.modelDiagnostic.attempts,2);
 assert.equal(h.calls[0].signal,h.calls[1].signal);assert.ok(h.calls[1].body.max_tokens>h.calls[0].body.max_tokens);
 assert.equal(h.calls[1].body.messages.at(-1).content,'你可以帮我吗');
 assert.equal(JSON.stringify(r).includes(marker),false);
});
test('标记截断的结果即使能解析也不采用，重新生成完整回复',async()=>{
 const h=setup([reply(JSON.stringify({...valid,answer:'不得采用'}),'length'),reply(JSON.stringify(valid))]);
 assert.equal((await h.run()).answer,valid.answer);assert.equal(h.calls.length,2);
});
for(const [name,body,code] of [
 ['连续空内容',reply(null,'stop',{reasoning_content:'not a reply'}),'empty'],
 ['连续截断',reply('{"action":','length'),'truncated'],
 ['正文夹杂 JSON',reply('解释如下：'+JSON.stringify(valid)),'invalid_json'],
 ['JSON 为 null',reply('null'),'invalid_schema'],
 ['引用字段类型错误',reply(JSON.stringify({...valid,source_ids:[12]})),'invalid_schema']
])test(name+'：最多两次后转人工，不返回原始文本',async()=>{
 const h=setup([body,body]);const r=await h.run();
 assert.equal(h.calls.length,2);assert.equal(r.action,'handoff');assert.equal(r.modelCalled,true);
 assert.equal(r.modelDiagnostic.code,code);assert.match(r.reason,/已请求 2 次/);
 assert.equal('reasoning_content' in r,false);
});
test('过滤或其他中断结果不重新请求，缺少引用不能靠重试绕过',async()=>{
 const filtered=setup([reply(JSON.stringify(valid),'content_filter')]);
 assert.equal((await filtered.run()).action,'handoff');assert.equal(filtered.calls.length,1);
 const ungrounded=setup([reply(JSON.stringify({action:'answer',answer:'商品价格99元',source_ids:[]}))]);
 assert.equal((await ungrounded.run()).action,'handoff');assert.equal(ungrounded.calls.length,1);
});
test('HTTP错误不因格式修复而重复计费请求',async()=>{
 let calls=0;
 await assert.rejects(()=>answer({rules:'',facts:[]},'可以帮我吗',[],{key:'test',fetcher:async()=>{calls++;return {ok:false,status:429};}}),/HTTP 429/);
 assert.equal(calls,1);
});
test('网络错误与模型格式错误区分，且不重复请求',async()=>{
 let calls=0;
 await assert.rejects(()=>answer({rules:'',facts:[]},'可以帮我吗',[],{key:'test',fetcher:async()=>{calls++;throw new TypeError('fetch failed',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});}}),/网络连接失败.*UND_ERR_CONNECT_TIMEOUT/);
 assert.equal(calls,1);
});

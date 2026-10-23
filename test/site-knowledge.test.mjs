import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answer,retrieve} from '../core.mjs';
import '../edge-extension/auto-policy.js';

const pack=JSON.parse(readFileSync(new URL('../knowledge-packs/网站客服-通用接待.json',import.meta.url),'utf8'));
const pending=JSON.parse(readFileSync(new URL('../knowledge-packs/网站客服-商品资料待补.json',import.meta.url),'utf8'));
const facts=pack.facts.map((f,i)=>({...f,id:String(i)}));
test('通用接待包的每个问法均能优先检索到对应知识，包括短问题',()=>{
  for(const f of facts)for(const alias of f.question.split('｜'))assert.equal(retrieve(facts,alias)[0]?.id,f.id,alias);
  assert.ok(facts.length>=90);assert.ok(pack.rules.length<=3000);
  assert.ok(pending.facts.every(f=>f.answer.startsWith('【待经营者填写并核实')));
  assert.ok(retrieve(facts,'是不是必须把密码发给你').some(f=>f.question.includes('我不想给密码')));
  assert.deepEqual(retrieve(facts,'？？？'),[]);
});
test('通用包回复不因安全提醒被误拦截，实际索取凭证和掺杂索取仍拦截',()=>{
  for(const f of facts)assert.equal(globalThis.ZhidaAutoPolicy.decision({action:'answer',answer:f.answer,engine:'deepseek',sources:[f]}),'send',f.question);
  assert.equal(globalThis.ZhidaAutoPolicy.decision({action:'answer',answer:'不需要，也不建议把密码发给我们。请不要在本站聊天中发送密码、验证码或密钥。',sources:[facts[0]]}),'send');
  assert.equal(globalThis.ZhidaAutoPolicy.decision({action:'answer',answer:'不需要，也请不要把密码发给我们。',sources:[facts[0]]}),'send');
  for(const text of ['别发密码。','不用，也不要在聊天里发密码、验证码或密钥。'])assert.equal(globalThis.ZhidaAutoPolicy.decision({action:'clarify',answer:text}),'send',text);
  for(const text of ['不要发密码，验证码发给我。','别发密码才怪。'])assert.equal(globalThis.ZhidaAutoPolicy.decision({action:'clarify',answer:text}),'handoff',text);
  for(const text of ['请把验证码给我','不要发送密码，验证码发给我','不要发送验证码给我才怪','请提供密钥后再发送密码','不要发送密码。请发送验证码'])assert.equal(globalThis.ZhidaAutoPolicy.decision({action:'answer',answer:text,sources:[facts[0]]}),'handoff',text);
});
test('购买前退款政策可按资料接待，实际退款和订单问题仍交人工',async()=>{
  let calls=0;
  const fetcher=async(_,options)=>{calls++;const body=JSON.parse(options.body);const evidence=JSON.parse(body.messages[0].content.split('证据：')[1]);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'answer',answer:'以对应商品明确说明为准，购买前先核对。',source_ids:[evidence[0].id]})}}]})};};
  for(const question of ['支持退款吗？','退款规则是什么？','我想了解退款条件','能退订吗？'])assert.equal((await answer({...pack,facts},question,[],{key:'test',fetcher})).action,'answer',question);
  assert.equal(calls,4);
  for(const question of ['我要退款','我已付款，可以退款吗','订单退款规则是什么','帮我办理退订','我要投诉'])assert.equal((await answer({...pack,facts},question,[],{key:'test',fetcher})).action,'handoff',question);
  assert.equal(calls,4);
});

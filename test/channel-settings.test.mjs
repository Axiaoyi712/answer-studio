import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,answer} from '../core.mjs';
import {settings,setupRecords} from '../records.mjs';
import {channelPolicy} from '../channel-settings.mjs';
import '../edge-extension/page-adapters.js';
import '../edge-extension/auto-policy.js';

test('旧渠道设置原样迁移，不把小红书回复时限和链接限制施加到其他渠道',()=>{
  const db=database(':memory:');setupRecords(db);
  db.prepare('INSERT INTO reception_settings VALUES(?,?)').run('s',JSON.stringify({siteAllowed:true,siteUrl:'https://example.com/'}));
  settings(db,'s',{channel:'taobao',rules:'仅使用店内商品链接',linkMode:'knowledge',maxReplyAgeHours:48});
  assert.equal(settings(db,'s').siteAllowed,true);assert.equal(settings(db,'s').siteUrl,'https://example.com/');assert.equal(settings(db,'s').maxReplyAgeHours,24);
  assert.equal(settings(db,'s',undefined,'taobao').maxReplyAgeHours,48);assert.equal(settings(db,'s',undefined,'taobao').rules,'仅使用店内商品链接');
  assert.equal(settings(db,'s',undefined,'web-demo').maxReplyAgeHours,0);assert.equal(settings(db,'s',undefined,'web-demo').rules,'');
  settings(db,'s',{channel:'xiaohongshu',rules:'不引导站外交易'});assert.equal(settings(db,'s',undefined,'taobao').rules,'仅使用店内商品链接');db.close();
});
test('渠道配置拒绝无效字段，不能携带凭证或污染其他渠道',()=>{
  for(const body of [{maxReplyAgeHours:-1},{maxReplyAgeHours:Infinity},{rules:'a'.repeat(2001)},{linkMode:'anything'},{allowContact:'yes'},{siteUrl:'https://user:pass@example.com/'}])assert.throws(()=>channelPolicy('test',body));
  assert.throws(()=>channelPolicy('../other',{}));
});
test('已审核网址是否可回复由渠道策略决定，凭证保护继续共用',()=>{
  const reply={action:'answer',engine:'deepseek',answer:'商品详情：https://shop.example.com/item',sources:[{id:'f',answer:'商品详情：https://shop.example.com/item'}]};
  const decide=channelPolicy=>ZhidaAutoPolicy.decision({...reply,channelPolicy});
  assert.equal(decide({linkMode:'knowledge'}),'send');assert.equal(decide({linkMode:'blocked'}),'handoff');assert.equal(decide({linkMode:'approved-on-request',siteAllowed:true,requested:false,siteUrl:'https://shop.example.com/item'}),'handoff');
  assert.equal(ZhidaAutoPolicy.decision({...reply,answer:'https://unknown.example.com/',channelPolicy:{linkMode:'knowledge'}}),'handoff');
  assert.equal(ZhidaAutoPolicy.decision({...reply,answer:'请发送验证码',channelPolicy:{linkMode:'knowledge',allowContact:true}}),'handoff');
});
test('渠道话术进入模型上下文，但不替代已发布的业务知识或修改其内容',async()=>{
  const snapshot={rules:'业务原规则',facts:[]};let prompt='';
  const result=await answer(snapshot,'请介绍一下你们的咨询服务',[],{key:'test',channelRules:'渠道测试标记：简短回答',fetcher:async(_url,options)=>{prompt=JSON.parse(options.body).messages[0].content;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'clarify',answer:'想了解哪方面？',source_ids:[]})}}]})};}});
  assert.equal(result.action,'clarify');assert.match(prompt,/业务原规则/);assert.match(prompt,/渠道测试标记/);assert.equal(snapshot.rules,'业务原规则');
});
test('网页适配约束来源和路径，生成的人工会话地址不能跳往外站',()=>{
  const A=ZhidaPageAdapters,profile=A.profile(JSON.parse(readFileSync('edge-extension/profiles/web-chat-demo.json','utf8')));
  assert.equal(A.matches(profile,'http://127.0.0.1:3080/web-chat-demo/chat/a'),true);
  assert.equal(A.matches(profile,'http://127.0.0.1:3080/web-chat-demo/chat-evil/a'),false);
  assert.equal(A.matches(profile,'https://evil.example/web-chat-demo/chat/a'),false);
  assert.equal(new URL(A.conversationUrl(profile,'https://evil.example')).origin,profile.origin);
  assert.throws(()=>A.profile({...profile,origin:'https://user:pass@example.com'}));assert.throws(()=>A.profile({...profile,conversationPath:'//evil.example/{id}'}));
  assert.notEqual(A.stateKey('autoTab',profile),A.stateKey('autoTab',A.builtin));
});

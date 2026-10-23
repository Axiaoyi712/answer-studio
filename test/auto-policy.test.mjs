import test from 'node:test';
import assert from 'node:assert/strict';
import '../edge-extension/auto-policy.js';
const p=globalThis.ZhidaAutoPolicy;
test('自动客服只发送有依据答案和澄清，人工及离线说明不外发',()=>{
 const good={action:'answer',answer:'此款为纯棉。',sources:[{id:'1'}],engine:'deepseek'};
 assert.equal(p.decision(good),'send');
 assert.equal(p.decision({...good,sources:[]}),'handoff');
 assert.equal(p.decision({...good,action:'handoff'}),'handoff');
 assert.equal(p.decision({...good,engine:'local'}),'handoff');
 assert.equal(p.decision({action:'clarify',answer:'你指哪项功能？',engine:'rules'}),'send');
 assert.equal(p.decision({action:'skip'}),'skip');
 for(const answer of ['https://example.com','到jiangliuy.cn下单','请发送验证码','请把密码给我','加微信'])assert.equal(p.decision({...good,answer}),'handoff');
});
test('发送前任一状态变化都禁止点击',()=>{
 const good={running:true,visible:true,route:'a',expectedRoute:'a',signature:'m1',expectedSignature:'m1',empty:true,enabled:true};
 assert.equal(p.canSend(good),true);
 for(const [key,value] of Object.entries({running:false,visible:false,route:'b',signature:'m2',empty:false,enabled:false}))assert.equal(p.canSend({...good,[key]:value}),false);
});
test('防重记录隔离账号、会话和消息ID',()=>{
 const key=p.key('a','chat/1',['m1']);
 assert.notEqual(key,p.key('b','chat/1',['m1']));
 assert.notEqual(key,p.key('a','chat/2',['m1']));
 assert.notEqual(key,p.key('a','chat/1',['m2']));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import '../edge-extension/inbox-policy.js';
const p=globalThis.ZhidaInboxPolicy;
test('队列只选未读私信，排除群聊、当前会话及人工接管',()=>{
 const list=[{id:'group',kind:'group',unread:3},{id:'read',kind:'c2c',unread:0},{id:'manual',kind:'c2c',unread:2},{id:'current',kind:'c2c',unread:1},{id:'stranger',kind:'c2c',unread:1}];
 assert.equal(p.next(list,new Set(['manual']),'current').id,'stranger');
 assert.equal(p.next(list,new Set(['manual','stranger']),'current'),undefined);
});
test('只合并最后一次己方回复后的消息；重复文本保留不同消息ID',()=>{
 const messages=[{id:'1',role:'user'},{id:'2',role:'assistant'},{id:'3',role:'user',content:'你好'},{id:'4',role:'user',content:'你好'}];
 assert.deepEqual(p.pending(messages).map(m=>m.id),['3','4']);
 assert.notEqual(p.key('a','c',messages.slice(2,3)),p.key('a','c',messages.slice(3)));
 assert.notEqual(p.key('a','c',messages),p.key('b','c',messages));
});
test('生成期间账号、会话或消息变化，旧回复失效',()=>{
 const s={account:'a',route:'/chat/1',conversation:{id:'1'},signature:'m1'};
 assert.ok(p.same(s,{...s}));
 for(const change of [{account:'b'},{route:'/chat/2'},{conversation:{id:'2'}},{signature:'m2'}])assert.equal(p.same(s,{...s,...change}),false);
});
test('已处理消息不合并进后续新问题，恢复游标按账号与会话隔离',()=>{
 const messages=[{id:'a',role:'user'},{id:'b',role:'user'},{id:'c',role:'user'}];
 assert.deepEqual(p.pending(messages,['a','b']).map(m=>m.id),['c']);
 assert.deepEqual(p.handled(['a'],messages.slice(0,2)),['a','b']);
 assert.notEqual(p.caseKey('account-1','chat'),p.caseKey('account-2','chat'));
 assert.notEqual(p.caseKey('account-1','chat'),p.caseKey('account-1','other'));
});
test('草稿键按账号与会话隔离，不能与发送或接管记录混用',()=>{
 assert.notEqual(p.draftKey('a','one'),p.draftKey('b','one'));
 assert.notEqual(p.draftKey('a','one'),p.draftKey('a','two'));
 assert.notEqual(p.draftKey('a','one'),p.caseKey('a','one'));
});

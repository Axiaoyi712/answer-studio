import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function bootstrap(reply,path='/chat'){
 let tick,stopped=false,calls=0;const nodes=new Map(),window={};window.top=window;
 const context={window,location:{pathname:path,href:'https://www.xiaohongshu.com'+path},document:{getElementById:id=>nodes.get(id),createElement:()=>({style:{}}),documentElement:{append:node=>nodes.set(node.id,node)}},chrome:{runtime:{sendMessage:async()=>{calls++;return reply();}}},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{stopped=true;}};
 vm.runInNewContext(readFileSync('edge-extension/bootstrap.js','utf8'),context);
 return {tick:()=>stopped?undefined:tick(),get stopped(){return stopped;},get calls(){return calls;},get hint(){return nodes.get('zhida-restore-status')?.textContent;}};
}
test('扩展失效停止旧页面恢复轮询并提示刷新，不误报本地服务断开',async()=>{
 const h=bootstrap(()=>{throw new Error('Extension context invalidated.');});await h.tick();assert.equal(h.stopped,true);assert.match(h.hint,/刷新/);assert.doesNotMatch(h.hint,/start.cmd/);await h.tick();assert.equal(h.calls,1);
});
test('平台受限停止恢复轮询并展示停用说明',async()=>{
 const h=bootstrap(()=>({data:{disabled:true,restricted:true}}));await h.tick();assert.equal(h.stopped,true);assert.match(h.hint,/停用扩展/);await h.tick();assert.equal(h.calls,1);
});
test('限制访问在读取消息结构前返回明确故障类型',()=>{
 const modal={innerText:'限制访问 浏览器异常，请尝试关闭/卸载风险插件或重启试试',getClientRects:()=>[{}],closest:()=>null};
 const context=vm.createContext({URL,location:{href:'https://www.xiaohongshu.com/chat'},document:{querySelectorAll:()=>[modal]}});
 for(const name of ['page-adapters','adapters/xiaohongshu'])vm.runInContext(readFileSync('edge-extension/'+name+'.js','utf8'),context);
 const result=vm.runInContext(readFileSync('edge-extension/page-snapshot.js','utf8'),context);assert.equal(result.code,'platform-restricted');
});

test('通用网页路径也检查自动恢复，故障提示只针对该页面',async()=>{
 const h=bootstrap(()=>({data:{disabled:true,blocked:true}}),'/web-chat-demo/chat/a');await h.tick();assert.equal(h.stopped,true);assert.match(h.hint,/其他页面不受影响/);
});

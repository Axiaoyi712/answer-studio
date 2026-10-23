import test from 'node:test';
import assert from 'node:assert/strict';
import {csv,digest,verifyBytes,intentRows,crosswoz,socialCases,drcd,sample,textKey,privateText} from '../scripts/public-datasets.mjs';
import {socialClosing} from '../social-replies.mjs';
import {answer} from '../core.mjs';

test('数据适配解析引号逗号、多行与双引号，不静默吞掉坏 CSV',()=>{
  assert.deepEqual(csv('\uFEFFa,b\r\n"hello,world","say ""yes""\nnext"\r\n'),[{a:'hello,world',b:'say "yes"\nnext'}]);
  assert.throws(()=>csv('a,b\n"open,no'),/未闭合/);assert.throws(()=>csv('a,b\none'),/列数/);
});
test('下载内容须同时符合固定字节数和 SHA256',()=>{
  const bytes=Buffer.from('fixture'),file={path:'source.csv',bytes:bytes.length,sha256:digest(bytes)};
  assert.equal(verifyBytes(bytes,file),bytes);assert.throws(()=>verifyBytes(Buffer.from('changed'),file),/校验失败/);
});
test('意图适配保持训练测试隔离，冲突标签隔离，联系信息不进入样本',()=>{
  const train=[{id:'1',split:'train',question:'Order status?',label:'order'},{id:'2',split:'train',question:'same',label:'a'},{id:'3',split:'train',question:'mail person@example.test',label:'a'}];
  const evaluation=[{id:'4',split:'test',question:'ORDER STATUS！',label:'order'},{id:'5',split:'test',question:'same',label:'b'},{id:'6',split:'test',question:'cancel',label:'cancel'}];
  const r=intentRows(train,evaluation);assert.deepEqual(r.rows.map(x=>x.id),['1','6']);assert.equal(r.quarantined,1);assert.equal(r.removed,4);
  assert.equal(privateText('这是13800138000'),true);assert.equal(privateText('normal question'),false);
});
test('只把全部标注为问候致谢告别的用户消息作为纯社交标签，不丢弃混合诉求',()=>{
  const rows=crosswoz({d:{messages:[{role:'usr',content:'谢谢',dialog_act:[['General','thank','none','none']]},{role:'sys',content:'不客气',dialog_act:[]},{role:'usr',content:'谢谢，价格多少',dialog_act:[['General','thank','none','none'],['Request','商品','价格','']]}]}},'test');
  assert.equal(socialCases(rows).length,1);assert.equal(rows[0].turns[1].role,'assistant');
  assert.equal(crosswoz({d:{messages:[{role:'usr',content:'person@example.test',dialog_act:[]}]}},'test').length,0);
});
test('阅读题必须有与原文偏移一致的答案；索引不包含测试问题和答案标签',()=>{
  const r=drcd({data:[{title:'文具资料',paragraphs:[{id:'p',context:'纸张共五百张',qas:[{id:'ok',question:'一包多少？',answers:[{text:'五百张',answer_start:3}]},{id:'bad',question:'多少？',answers:[{text:'五百张',answer_start:1}]}]}]}]});
  assert.equal(r.cases.length,1);assert.equal(r.invalid,1);assert.equal(r.facts[0].question,'文具资料');assert.equal(r.facts[0].answer,'纸张共五百张');assert.ok(!('answers' in r.facts[0]));
});
test('哈希选样固定，不依赖原始排序，规范化同问同键',()=>{
  const rows=[{id:'a'},{id:'b'},{id:'c'}];assert.deepEqual(sample(rows,2),sample([...rows].reverse(),2));assert.equal(textKey('Hello！'),textKey('ｈｅｌｌｏ'));
});
test('普通致谢收尾由本地接待，不调用模型，不额外转人工',async()=>{
  for(const q of ['好的，非常感谢，没有问题了！','收到，谢谢您耐心解答。','谢谢你的推荐，再见！','嗯嗯，谢啦','有需要再联系你']){
    const r=await answer({rules:'',facts:[]},q,[],{key:'test',fetcher:()=>{throw Error('不应调用模型');}});
    assert.equal(r.action,'clarify',q);assert.equal(r.modelCalled,false,q);assert.ok(!r.answer.includes('人工'));
  }
});
test('致谢混合真实咨询、请求或投诉不被社交规则吞掉',async()=>{
  assert.equal(socialClosing(['嗯'.repeat(1800)+'多少钱']),false);
  for(const q of ['谢谢这款多少钱','好的可以退款吗','没有其他颜色吗','谢谢但你帮我取消订单','感谢支持开票吗'])assert.equal(socialClosing([q]),false,q);
  let calls=0;
  const fact={id:'p',product:'P01',question:'P01多少钱？',answer:'P01单支2元。'};
  const r=await answer({rules:'',facts:[fact]},'谢谢，P01单支多少钱？',[],{key:'test',fetcher:async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'answer',answer:'P01单支2元。',source_ids:['p']})}}]})};}});
  assert.equal(r.action,'answer');assert.equal(calls,1);assert.match(r.answer,/2元/);
  assert.equal((await answer({rules:'',facts:[]},'谢谢，但我想要退款')).action,'handoff');
});

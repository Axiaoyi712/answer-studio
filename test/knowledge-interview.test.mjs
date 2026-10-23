import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database,createSpace,addFact,publish} from '../core.mjs';
import {setupRecords,saveRecord} from '../records.mjs';
import {createInterviewer} from '../knowledge-interview.mjs';

function fixture(path=':memory:'){
  const db=database(path);setupRecords(db);const a=createSpace(db,'文具客服'),b=createSpace(db,'服装客服');let calls=0,respond=()=>({reply:'你主营哪些文具？',facts:[]});
  const service=createInterviewer(db,{key:'test',fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer test');assert.match(body.messages[0].content,/不知道|不清楚/);const context=JSON.parse(body.messages[1].content),result=await respond(context);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})};}});
  return {db,a,b,service,set:fn=>respond=fn,get calls(){return calls;}};
}
function fact(context,answer='P01 中性笔单支 2 元。',question='P01 中性笔多少钱？'){
  const user=context.dialogue.filter(m=>m.role==='user').at(-1);return {product:'P01 中性笔',question,answer,evidence:[{turn_id:user.id,quote:user.content}],gap_ids:[]};
}
test('空业务主动追问；按经营者原话整理并保存待审核，其他业务与发布版本不受影响',async()=>{
  const f=fixture();try{
    const before=addFact(f.db,f.a,{product:'纸',question:'什么规格？',answer:'A4',source:'资料'});f.db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(before);const version=publish(f.db,f.a);
    await f.service.turn(f.a,{mode:'start',requestId:'start'});assert.match(f.service.read(f.a).history[0].content,/主营/);
    f.set(c=>({reply:'笔尖多粗、有什么颜色？',facts:[fact(c)]}));
    const r=await f.service.turn(f.a,{message:'P01 中性笔单支 2 元。',requestId:'one'});assert.equal(r.saved[0].status,'created');
    const row=f.db.prepare('SELECT * FROM facts WHERE id=?').get(r.saved[0].id);assert.equal(row.approved,0);assert.match(row.source,/经营者确认.*2 元/);
    assert.equal(f.service.read(f.b).history.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM facts WHERE space=?').get(f.b).n,0);
    assert.equal(JSON.parse(f.db.prepare('SELECT snapshot FROM versions WHERE id=?').get(version).snapshot).facts.length,1);
  }finally{f.db.close();}
});
test('同一请求重试不重复调用模型和入库，重复问答去重，待审核内容可继续补正',async()=>{
  const f=fixture();try{f.set(c=>({reply:'还有哪些型号？',facts:[fact(c,c.dialogue.at(-1).content)]}));
    const one=await f.service.turn(f.a,{message:'售价 1.5 元',requestId:'one'}),again=await f.service.turn(f.a,{message:'售价 1.5 元',requestId:'one'});
    assert.equal(f.calls,1);assert.ok(again.replayed);assert.equal(one.saved[0].id,again.saved[0].id);
    assert.equal((await f.service.turn(f.a,{message:'售价 1.5 元',requestId:'two'})).saved[0].status,'unchanged');
    const changed=await f.service.turn(f.a,{message:'售价 15 元',requestId:'three'});assert.equal(changed.saved[0].status,'updated');assert.equal(changed.saved[0].id,one.saved[0].id);
    assert.equal(f.db.prepare('SELECT count(*) n FROM facts').get().n,1);assert.equal(f.db.prepare('SELECT answer FROM facts').get().answer,'售价 15 元');
    await assert.rejects(f.service.turn(f.a,{message:'其他内容',requestId:'one'}),/其他内容/);
  }finally{f.db.close();}
});
test('修正已审核答案另存待审，原知识与正式快照均保留',async()=>{
  const f=fixture();try{const id=addFact(f.db,f.a,{product:'P01 中性笔',question:'P01 中性笔多少钱？',answer:'原价 3 元',source:'原资料'});f.db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);const version=publish(f.db,f.a);
    f.set(c=>({reply:'收到，已整理。',facts:[fact(c)]}));const r=await f.service.turn(f.a,{message:'P01 中性笔现在单支 2 元。',requestId:'change'});
    assert.equal(r.saved[0].status,'conflict');assert.notEqual(r.saved[0].id,id);assert.equal(f.db.prepare('SELECT answer FROM facts WHERE id=?').get(id).answer,'原价 3 元');assert.equal(f.db.prepare('SELECT active FROM spaces WHERE id=?').get(f.a).active,version);
  }finally{f.db.close();}
});
test('客户提问、模型问题、伪造引用和其他业务回合均不能成为事实来源，整批失败不留半条知识',async()=>{
  const f=fixture();try{const foreign=await f.service.turn(f.b,{message:'服装 99 元',requestId:'foreign'});const foreignId=foreign.history[0].id;
    for(const invalid of [c=>({...fact(c),evidence:[{turn_id:'missing',quote:'售价99元'}]}),c=>({...fact(c),evidence:[{turn_id:c.dialogue.at(-1).id,quote:'并没有这句话'}]}),c=>({...fact(c),evidence:[{turn_id:foreignId,quote:'服装 99 元'}]}),c=>({...fact(c),gap_ids:['foreign-gap']})]){
      f.set(c=>({reply:'整理好了',facts:[fact(c),invalid(c)]}));await assert.rejects(f.service.turn(f.a,{message:'P01 2 元',requestId:crypto.randomUUID()}));assert.equal(f.db.prepare('SELECT count(*) n FROM facts').get().n,0);assert.equal(f.service.read(f.a).history.length,0);
    }
    await f.service.turn(f.a,{mode:'start',requestId:'start'}).catch(()=>{});
  }finally{f.db.close();}
});
test('人工接待缺口向经营者追问，确认后关联待审知识；原人工状态不被改动，删除知识后缺口重现',async()=>{
  const f=fixture();try{
    const row={id:'gap-a',space:f.a,account:'acct',conversation:'chat',state:'handoff',question:'P01多少钱？联系13800138000',reason:'缺少价格资料'};saveRecord(f.db,row);saveRecord(f.db,{...row,id:'gap-b',space:f.b,question:'衣服多少钱？'});
    f.set(c=>{assert.equal(c.gaps.length,1);assert.doesNotMatch(JSON.stringify(c),/13800138000|衣服/);return {reply:'P01 单支的价格是多少？',facts:[]};});
    await f.service.turn(f.a,{mode:'gaps',requestId:'ask'});assert.equal(f.service.read(f.a).gaps.length,1);
    f.set(c=>({reply:'收到，继续聊发货。',facts:[{...fact(c),gap_ids:[c.gaps[0].id]}]}));
    const result=await f.service.turn(f.a,{message:'P01 单支 2 元',requestId:'price'});assert.equal(result.gaps.length,1);assert.equal(result.gaps[0].stage,'待审核');assert.equal(f.db.prepare('SELECT state FROM reception WHERE id=?').get('gap-a').state,'handoff');
    f.db.prepare('DELETE FROM facts WHERE id=?').run(result.saved[0].id);assert.equal(f.service.read(f.a).gaps.length,1);
  }finally{f.db.close();}
});
test('格式错误自动重试，最终失败和 API 失败均不保存；恢复后可以用同一请求重试',async()=>{
  const f=fixture();try{
    const bad=createInterviewer(f.db,{key:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"reply":'}}]})})});
    await assert.rejects(bad.turn(f.a,{message:'笔 2 元',requestId:'bad'}),/不完整/);assert.equal(bad.read(f.a).history.length,0);
    const offline=createInterviewer(f.db,{key:'test',fetcher:async()=>({ok:false,status:503})});await assert.rejects(offline.turn(f.a,{message:'笔 2 元',requestId:'bad'}),/503/);
    const retry=await f.service.turn(f.a,{message:'笔 2 元',requestId:'bad'});assert.equal(retry.history.length,2);
  }finally{f.db.close();}
});
test('同一业务只运行一轮，其他业务不被阻塞；等待中不写入未完成的对话',async()=>{
  const f=fixture();let finish;try{f.set(()=>new Promise(r=>finish=r));const pending=f.service.turn(f.a,{message:'文具',requestId:'pending'});await assert.rejects(f.service.turn(f.a,{message:'新内容',requestId:'another'}),/正在整理/);assert.equal(f.service.read(f.a).history.length,0);
    f.set(()=>({reply:'你主营哪种服装？',facts:[]}));await f.service.turn(f.b,{message:'服装',requestId:'other'});finish({reply:'你主营哪种文具？',facts:[]});await pending;assert.equal(f.service.read(f.a).history.length,2);assert.equal(f.service.read(f.b).history.length,2);
  }finally{f.db.close();}
});
test('对话重启后可恢复，未配置模型时不生成伪知识',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'zhida-interview-')),path=join(dir,'state.sqlite'),f=fixture(path);let db;
  try{await f.service.turn(f.a,{message:'主营笔和纸',requestId:'persist'});const id=f.a;f.db.close();db=database(path);setupRecords(db);const service=createInterviewer(db);assert.match(service.read(id).history[0].content,/笔和纸/);await assert.rejects(service.turn(id,{mode:'start',requestId:'no-key'}),/API/);assert.equal(service.read(id).history.length,2);}
  finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});

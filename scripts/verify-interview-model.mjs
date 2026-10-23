import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {database,createSpace} from '../core.mjs';
import {setupRecords,saveRecord} from '../records.mjs';
import {createInterviewer} from '../knowledge-interview.mjs';
if(!process.env.DEEPSEEK_API_KEY)throw new Error('请使用 --env-file-if-exists=.env 运行，需要已配置的 DeepSeek API');
const directory=resolve('work/interview-model',String(Date.now()));mkdirSync(directory,{recursive:true});
const db=database(join(directory,'isolated.sqlite'));setupRecords(db);const space=createSpace(db,'文具客服 · 隔离模型验收');
const service=createInterviewer(db,{key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'}),results=[];
async function turn(mode,message=''){
  const result=await service.turn(space,{mode,message,requestId:crypto.randomUUID()});
  results.push({mode,message,reply:result.history.at(-1).content,saved:result.saved});
  writeFileSync(join(directory,'result.json'),JSON.stringify({results,facts:db.prepare('SELECT * FROM facts').all()},null,2));
  console.log(JSON.stringify(results.at(-1)));
  return result;
}
try{
  await turn('start');await turn('message','我想做文具客服，主营中性笔和打印纸。');
  await turn('message','中性笔P01是0.5mm黑色，单支2元。打印纸是A4、80g，每包500张，20元一包。其他规格和价格暂不提供，不要猜。');
  const before=db.prepare('SELECT count(*) n FROM facts').get().n;assert.ok(before>=2);
  await turn('message','运费、现货数量暂时不清楚，请不要记录成确定的价格或库存。');
  saveRecord(db,{id:'model-gap',space,account:'test-only',conversation:'test-only',state:'handoff',question:'P01付款后多久发出，预售也一样吗？',reason:'缺少发货规则'});
  const gap=await turn('gaps');assert.ok(gap.gaps.length);
  const result=await turn('message','付款后48小时内发出，预售商品除外。预售的时间下单前单独确认。');
  assert.equal(result.gaps.length,1);assert.equal(result.gaps[0].stage,'待审核');assert.equal(db.prepare('SELECT state FROM reception').get().state,'handoff');
  await turn('summary');
  const facts=db.prepare('SELECT * FROM facts').all();assert.ok(facts.every(f=>f.approved===0));assert.ok(facts.some(f=>/0.5/.test(f.answer)));assert.ok(facts.some(f=>/80/.test(f.answer)));assert.ok(facts.some(f=>/48/.test(f.answer)&&/预售/.test(f.answer)));
  console.log(JSON.stringify({ok:true,turns:results.length,facts:facts.length,directory}));
}finally{db.close();}

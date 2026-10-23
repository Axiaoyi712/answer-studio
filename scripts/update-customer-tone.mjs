import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const style='对外回复简短自然，通常一两句，直接回应问题。不主动自我介绍，不说自己是智能助手、智能咨询助手、AI或机器人，不向顾客解释知识库、审核或模型。不提需要人工处理、转人工或人工核实；处理不了只回复“不好意思，请稍等”，具体原因保留在后台。只有顾客明确询问是否机器人、AI或真人时，如实简短说明是自动回复，不冒充真人。';
function rewrite(question,answer){
 if(/你是真人吗|你是机器人吗|你是AI吗/.test(question))return '这边是自动回复。你想了解什么，可以直接说。';
 return answer.replaceAll('目前没有订单查询接口，不能确认订单状态','暂时查不了订单状态').replaceAll('没有实时库存查询能力','暂时查不了实时库存').replaceAll('当前智能助手','这边').replaceAll('智能咨询助手','客服').replaceAll('智能助手','这边').replaceAll('当前系统','这边').replaceAll('需要人工确认','需要再确认').replaceAll('由人工确认','再确认').replaceAll('人工核实','核实').replaceAll('人工处理','处理').replaceAll('由人工核对','再核对');
}
const db=new DatabaseSync(join(root,'data/studio.sqlite'));db.exec('PRAGMA foreign_keys=ON');
try{
 const spaces=db.prepare('SELECT * FROM spaces WHERE name=?').all('网站客服');if(spaces.length!==1)throw Error('网站客服业务不唯一，未修改');const space=spaces[0];
 const rows=db.prepare('SELECT * FROM facts WHERE space=?').all(space.id);
 const changes=rows.map(f=>({...f,next:rewrite(f.question,f.answer)})).filter(f=>f.next!==f.answer);
 const rules=space.rules.includes(style)?space.rules:space.rules+'\n\n'+style;if(rules.length>3000)throw Error('规则过长，未修改');
 if(!changes.length&&rules===space.rules){console.log('文风已更新，无需重复发布');}
 else{
  const directory=join(root,'data/backups');mkdirSync(directory,{recursive:true});const path=join(directory,'pre-customer-tone-'+Date.now()+'.sqlite');await backup(db,path);
  const check=new DatabaseSync(path,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('备份校验失败');}finally{check.close();}
  db.exec('BEGIN IMMEDIATE');try{
   for(const f of changes)db.prepare('UPDATE facts SET answer=? WHERE id=? AND space=?').run(f.next,f.id,space.id);
   db.prepare('UPDATE spaces SET rules=? WHERE id=?').run(rules,space.id);
   const version=randomUUID(),facts=db.prepare('SELECT * FROM facts WHERE space=? AND approved=1').all(space.id);
   db.prepare('INSERT INTO versions VALUES(?,?,?,?)').run(version,space.id,new Date().toISOString(),JSON.stringify({rules,facts}));db.prepare('UPDATE spaces SET active=? WHERE id=?').run(version,space.id);db.exec('COMMIT');
   console.log(JSON.stringify({changed:changes.length,backup:path,version}));
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
}finally{db.close();}
const path=join(root,'knowledge-packs/网站客服-通用接待.json'),pack=JSON.parse(readFileSync(path,'utf8'));
pack.facts=pack.facts.map(f=>({...f,answer:rewrite(f.question,f.answer)}));if(!pack.rules.includes(style))pack.rules+='\n\n'+style;
writeFileSync(path,JSON.stringify(pack,null,2)+'\n');
writeFileSync(join(root,'knowledge-packs/网站客服-回复清单.md'),'# 网站客服通用回复清单\n\n实际修改请到工作台，文件不自动同步正式回复。\n\n'+pack.facts.map((f,i)=>`## ${i+1}. ${f.product}\n\n**问题**：${f.question}\n\n**回复**：${f.answer}\n`).join('\n'));

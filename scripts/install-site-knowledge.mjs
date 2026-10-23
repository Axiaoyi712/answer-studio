import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {backup,DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {database,addFact} from '../core.mjs';

const root=resolve(import.meta.dirname,'..');
const ready=JSON.parse(readFileSync(join(root,'knowledge-packs/网站客服-通用接待.json'),'utf8'));
const pending=JSON.parse(readFileSync(join(root,'knowledge-packs/网站客服-商品资料待补.json'),'utf8'));
const db=database(join(root,'data/studio.sqlite'));
try{
  const spaces=db.prepare('SELECT * FROM spaces WHERE name=?').all('网站客服');
  if(spaces.length!==1)throw new Error('需要唯一的“网站客服”业务空间，未修改数据');
  const space=spaces[0],old=db.prepare('SELECT question FROM facts WHERE space=?').all(space.id);
  const questions=new Set(old.map(f=>f.question));
  const additions=[...ready.facts.map(f=>({...f,approved:1})),...pending.facts.map(f=>({...f,approved:0}))].filter(f=>!questions.has(f.question));
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,space:space.name,additions:additions.length,ready:ready.facts.length,pending:pending.facts.length}));}
  else if(!additions.length){console.log(JSON.stringify({changed:false,reason:'知识已存在；为保留人工修改，不重复导入、不覆盖规则或重新发布'}));}
  else{
    const dir=join(root,'data/backups');mkdirSync(dir,{recursive:true});
    const stamp=Date.now(),backupPath=join(dir,`pre-site-knowledge-${stamp}.sqlite`);
    await backup(db,backupPath);
    const check=new DatabaseSync(backupPath,{readOnly:true});
    try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('备份校验失败，未导入');}finally{check.close();}
    const receipt={created:new Date().toISOString(),space:space.id,previousActive:space.active,previousRules:space.rules,backup:backupPath,added:[],version:randomUUID()};
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const f of additions){const id=addFact(db,space.id,f);if(f.approved)db.prepare('UPDATE facts SET approved=1 WHERE id=?').run(id);receipt.added.push({id,question:f.question,approved:!!f.approved});}
      db.prepare('UPDATE spaces SET rules=? WHERE id=?').run(ready.rules,space.id);
      const snapshot={rules:ready.rules,facts:db.prepare('SELECT * FROM facts WHERE space=? AND approved=1').all(space.id)};
      db.prepare('INSERT INTO versions VALUES(?,?,?,?)').run(receipt.version,space.id,receipt.created,JSON.stringify(snapshot));
      db.prepare('UPDATE spaces SET active=? WHERE id=?').run(receipt.version,space.id);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    const receiptPath=join(dir,`site-knowledge-${stamp}.json`);writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({changed:true,readyAdded:receipt.added.filter(f=>f.approved).length,pendingAdded:receipt.added.filter(f=>!f.approved).length,version:receipt.version,backup:backupPath,receipt:receiptPath}));
  }
}finally{db.close();}

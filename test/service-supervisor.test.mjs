import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('服务守护可恢复异常退出，主动停止守护后不会再启动',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zhida-supervisor-')),p=spawn(process.execPath,['scripts/run-service.mjs'],{env:{...process.env,DB_PATH:join(dir,'test.sqlite'),PORT:'0',HOST:'127.0.0.1',ADMIN_TOKEN:'',DEEPSEEK_API_KEY:''},stdio:['ignore','pipe','pipe'],windowsHide:true});let text='',pid;
 p.stdout.on('data',b=>{text+=String(b);});p.stderr.on('data',()=>{});
 const wait=async fn=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('服务恢复测试超时');};
 try{await wait(()=>/http:\/\/127.0.0.1/.test(text));pid=Number(text.match(/child (\d+)/)[1]);process.kill(pid);await wait(()=>[...text.matchAll(/http:\/\/127.0.0.1/g)].length===2);assert.notEqual(Number([...text.matchAll(/child (\d+)/g)].at(-1)[1]),pid);}
 finally{const last=Number([...text.matchAll(/child (\d+)/g)].at(-1)?.[1]);p.kill();if(last){try{process.kill(last);}catch{}}await new Promise(r=>setTimeout(r,200));rmSync(dir,{recursive:true,force:true});}
});

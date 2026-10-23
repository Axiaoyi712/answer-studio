import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let child,timer,stopping=false,attempts=0;
function start(){
 const began=Date.now();let fatal=false;
 child=spawn(process.execPath,['--env-file-if-exists=.env','server.mjs'],{cwd:root,env:process.env,stdio:['ignore','inherit','pipe'],windowsHide:true});
 console.log('[service] child '+child.pid);child.stderr.on('data',chunk=>{process.stderr.write(chunk);if(/EADDRINUSE|非本地监听必须/.test(String(chunk)))fatal=true;});
 child.once('error',error=>console.error('[service] '+error.message));
 child.once('exit',()=>{if(stopping)return;if(fatal){console.error('[service] configuration or port conflict; stopped');process.exitCode=1;return;}if(Date.now()-began>30000)attempts=0;const wait=Math.min(30000,1000*2**Math.min(attempts++,5));console.error('[service] exited; restart in '+wait+'ms');timer=setTimeout(start,wait);});
}
function stop(){if(stopping)return;stopping=true;clearTimeout(timer);child?.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',()=>{stopping=true;child?.kill();});start();

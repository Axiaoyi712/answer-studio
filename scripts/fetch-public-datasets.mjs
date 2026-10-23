import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {verifyBytes,readSource,prepareSource,digest} from './public-datasets.mjs';

const catalog=JSON.parse(readFileSync(new URL('../datasets/catalog.json',import.meta.url))),root=resolve('work/public-datasets'),offline=process.argv.includes('--offline');
mkdirSync(join(root,'prepared'),{recursive:true});
for(const source of catalog.sources){
  if(!/^[a-z0-9-]+$/.test(source.id)||!/^\w[\w.-]*\/[\w.-]+$/.test(source.repo)||!/^[a-f0-9]{40}$/.test(source.revision))throw Error('数据来源无效');
  const rawDir=join(root,'raw',source.id);mkdirSync(rawDir,{recursive:true});
  for(const file of source.files){
    if(!/^[\w.-]+$/.test(file.local)||file.path.split('/').some(s=>!s||s==='..')||!file.sha256)throw Error('数据文件路径无效');
    const path=join(rawDir,file.local);
    if(existsSync(path)){verifyBytes(readFileSync(path),file);continue;}
    if(offline)throw Error('缺少缓存，请先运行 npm.cmd run datasets:prepare：'+source.id+'/'+file.path);
    const url=`https://raw.githubusercontent.com/${source.repo}/${source.revision}/${file.path}`;
    const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error('下载失败 HTTP '+response.status+'：'+url);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>file.bytes)throw Error('下载长度超出登记值：'+file.path);chunks.push(chunk);}
    const bytes=verifyBytes(Buffer.concat(chunks),file);writeFileSync(path+'.part',bytes);renameSync(path+'.part',path);
  }
  const prepared=prepareSource({...source,rawFile:path=>join(rawDir,source.files.find(f=>f.path===path).local)},readSource(source,join(root,'raw')));
  const body={schema:1,id:source.id,repo:source.repo,revision:source.revision,license:source.license,licenseUrl:source.licenseUrl,attribution:source.attribution,changes:'过滤联系信息模式、规范化/去重、保持或明确重建拆分；字段适配。原始文本未翻译。',...prepared};
  const bytes=JSON.stringify(body,null,2);writeFileSync(join(root,'prepared',source.id+'.json'),bytes);
  console.log(JSON.stringify({source:source.id,rows:prepared.rows?.length||prepared.cases?.length,sha256:digest(bytes),license:source.license}));
}
console.log('准备完成；仅写入 work/public-datasets，不修改正式知识库。');

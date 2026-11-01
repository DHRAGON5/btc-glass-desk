import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {extname,join,relative,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),web=join(root,'dist-web'),out=join(root,'dist');
async function files(dir){const rows=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())rows.push(...await files(path));else rows.push(path);}return rows;}
const binaryExt=new Set(['.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2']),assets={};
for(const file of await files(web)){const key='/'+relative(web,file).replaceAll('\\','/'),body=await readFile(file),binary=binaryExt.has(extname(file));assets[key]={binary,body:binary?body.toString('base64'):body.toString('utf8')};}
const template=await readFile(join(root,'worker/index.template.js'),'utf8'),source=template.replace('__ASSET_MAP__',JSON.stringify(assets));
await rm(out,{recursive:true,force:true});await mkdir(join(out,'server'),{recursive:true});await mkdir(join(out,'.openai'),{recursive:true});
await writeFile(join(out,'server/index.js'),source);await writeFile(join(out,'.openai/hosting.json'),await readFile(join(root,'.openai/hosting.json')));
console.log(`Worker Paket mit ${Object.keys(assets).length} Dateien erstellt`);

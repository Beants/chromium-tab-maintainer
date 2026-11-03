import {mkdirSync,rmSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const extension=join(root,'extension'),dist=join(root,'dist'),archive=join(dist,'chromium-tab-maintainer.zip');
const manifest=JSON.parse(readFileSync(join(extension,'manifest.json'),'utf8'));
if(manifest.manifest_version!==3)throw Error('Manifest 无效');
mkdirSync(dist,{recursive:true});rmSync(archive,{force:true});
const files=['manifest.json','background.js','runtime.js','engine.js','policy.js','temporary.js','page-state.js','options.js','options.html','options.css','LICENSE'];
const result=spawnSync('zip',['-X','-q',archive,...files],{cwd:extension,encoding:'utf8'});
if(result.status!==0)throw Error(`zip 失败：${result.stderr}`);
console.log(archive);

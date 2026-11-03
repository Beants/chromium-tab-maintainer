import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=new URL('../extension/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const expected=['tabs','storage','alarms','idle','scripting'];
if(manifest.manifest_version!==3||manifest.background?.service_worker!=='background.js'||manifest.background?.type!=='module'||manifest.options_page!=='options.html')throw Error('Manifest V3 入口无效');
if(expected.some(permission=>!manifest.permissions?.includes(permission)))throw Error('缺少必要权限');
if(manifest.permissions.includes('tabCapture'))throw Error('不得把扩展内捕获清单当成全局录制信号');
if(JSON.stringify(manifest.host_permissions)!==JSON.stringify(['http://*/*','https://*/*']))throw Error('页面权限必须限制到 HTTP(S)');
if(manifest.content_scripts?.length!==1||manifest.content_scripts[0].js?.[0]!=='page-state.js'||manifest.content_scripts[0].all_frames!==false)throw Error('新标签内容探针未声明');
for(const file of ['background.js','runtime.js','engine.js','policy.js','temporary.js','page-state.js','options.js']){
 const result=spawnSync(process.execPath,['--check',join(fileURLToPath(root),file)],{encoding:'utf8'});
 if(result.status!==0)throw Error(`${file}: ${result.stderr}`);
}
const html=readFileSync(new URL('options.html',root),'utf8');
if(!html.includes('src="options.js"')||!html.includes('id="pause"')||!html.includes('id="history"'))throw Error('设置页面入口不完整');
const contracts=readFileSync(new URL('types.d.ts',root),'utf8');
const interfaces=[...contracts.matchAll(/export interface (\w+)\s*\{/g)];
if(interfaces.length<10)throw Error('公开接口定义缺失');
for(const match of interfaces){if(!contracts.slice(0,match.index).trimEnd().endsWith('*/'))throw Error(`${match[1]} 缺少文档注释`);}
for(const name of ['BrowserPort','Engine']){const body=contracts.match(new RegExp(`export interface ${name} \\{([^]*?)\\n\\}`))?.[1];if(!body)throw Error(`${name} 方法文档格式无效`);const lines=body.split('\n');for(let i=1;i<lines.length;i++)if(/^\s+\w+\([^)]*\):/.test(lines[i])&&!/^\s*\/\*\*.*\*\/\s*$/.test(lines[i-1]))throw Error(`${name}.${lines[i].trim().split('(')[0]} 缺少方法保证说明`);}
console.log('Manifest、入口与 JavaScript 语法检查通过');

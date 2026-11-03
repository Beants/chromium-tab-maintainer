import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const publicHosts=new Set(['github.com','api.github.com','gitlab.com','registry.npmjs.org','npmjs.com','npmjs.org','developer.chrome.com','docs.github.com','eslint.org','typescriptlang.org','nodejs.org','opencollective.com','v2ex.com','multica.ai','opencode.ai','lightvela.com','deepseek.com','google.com','google.com.hk','bing.com','baidu.com']);
/** Only explicit public services, reserved examples and loopback fixtures are allowed. @param {string} hostname @returns {boolean} */
function allowedHost(hostname){const host=hostname.toLowerCase().replace(/^www\./,'');return publicHosts.has(host)||host==='example.com'||host.endsWith('.example.com')||host==='example.org'||host.endsWith('.example.org')||host.endsWith('.test')||host==='localhost'||host==='127.0.0.1'||host==='[::1]';}
/** Inspect source without returning secret contents. @param {string} name @param {string} text @returns {string[]} */
export function scanPublicFile(name,text){
 const findings=[];
 if(/(?:^|\/)(?:\.env(?:\..*)?|\.superpowers)(?:\/|$)|\.(?:csv|log)$/i.test(name))findings.push('private artifact type');
 if(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))findings.push('credential-shaped content');
 if(/\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Z]:\\Users\\/.test(text))findings.push('personal absolute path');
 for(const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|cn|io|org|net|cloud|dev|app|ai|test)\b/gi))if(!allowedHost(match[0])){findings.push('unapproved hostname');break;}
 for(const match of text.matchAll(/https?:\/\/[^\s'"`<>\\)]+/g)){
  if(match[0].includes('${')||['http://*/*','https://*/*'].includes(match[0]))continue;
  try{const url=new URL(match[0]);if(!allowedHost(url.hostname)||url.username||url.password){findings.push('unapproved URL or embedded credentials');break;}}catch{/* Source expressions need not be literal URLs. */}
 }
 return [...new Set(findings)];
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});if(result.status!==0)throw Error('Public-source checks require a Git checkout');
 const files=result.stdout.split('\0').filter(Boolean);if(!files.length)throw Error('Stage the public source files before running this check');
 let count=0;for(const file of files){const findings=scanPublicFile(file,readFileSync(file,'utf8'));if(findings.length){process.stderr.write(`${file}: ${findings.join(', ')}\n`);count++;}}
 if(count)process.exitCode=1;else process.stdout.write(`Public-source checks passed (${files.length} tracked files)\n`);
}

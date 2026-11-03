import {temporaryKind,instantKind,isNewTab} from './temporary.js';
/** @typedef {import('./types.js').Config} Config */
/** @typedef {import('./types.js').TabSnapshot} TabSnapshot */
/** @typedef {import('./types.js').Category} Category */
/** @typedef {import('./types.js').MaintenancePlan} MaintenancePlan */
/** Return fresh, conservative defaults. @returns {Config} */
export function defaultConfig() {
 return {enabled:false,spaceMappingVerified:false,deduplicate:true,consolidateHost:true,cleanTemporary:true,expire:true,sort:true,days:7,
 aliases:[{key:'git',label:'Git',hosts:['github.com','gitlab.com']}],
 projects:[],whitelist:[],readOnlyRules:[]};
}
/** Validate a complete configuration atomically; never coerce invalid input. @param {unknown} value @returns {Config} */
export function validateConfig(value) {
 if (!value || typeof value !== 'object') throw new Error('配置必须是对象');
 const incoming=/** @type {{consolidateHost?:unknown,cleanTemporary?:unknown}} */(value);
 const c=/** @type {Config} */({...value,consolidateHost:incoming.consolidateHost===undefined?true:incoming.consolidateHost,cleanTemporary:incoming.cleanTemporary===undefined?true:incoming.cleanTemporary});
 for(const key of /** @type {const} */(['enabled','spaceMappingVerified','deduplicate','consolidateHost','cleanTemporary','expire','sort'])) if(typeof c[key]!=='boolean') throw new Error(`${key} 必须是布尔值`);
 if(!Number.isInteger(c.days)||c.days<1||c.days>365) throw new Error('天数必须为 1–365 的整数');
 /** @param {unknown} v @returns {v is string} */
 const host=v=>typeof v==='string'&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/.test(v);
 /** @param {unknown} v @returns {v is string} */
 const word=v=>typeof v==='string'&&v.trim().length>0&&v.length<256;
 if(!Array.isArray(c.aliases)||!c.aliases.every(a=>a&&word(a.key)&&word(a.label)&&Array.isArray(a.hosts)&&a.hosts.length>0&&a.hosts.every(host))) throw new Error('别名规则无效');
 if(!Array.isArray(c.projects)||!c.projects.every(p=>p&&word(p.key)&&word(p.label)&&Array.isArray(p.patterns)&&p.patterns.length>0&&p.patterns.every(word))) throw new Error('项目规则无效');
 if(!Array.isArray(c.whitelist)||!c.whitelist.every(host)) throw new Error('白名单必须是完整主机名');
 if(!Array.isArray(c.readOnlyRules)||!c.readOnlyRules.every(r=>r&&host(r.host)&&typeof r.pathPrefix==='string'&&r.pathPrefix.startsWith('/'))) throw new Error('只读规则无效');
 return structuredClone(c);
}
/** Parse only reloadable web URLs. @param {string} value @returns {URL|undefined} */
function webUrl(value) {try {const u=new URL(value);return /^https?:$/.test(u.protocol)?u:undefined;} catch{return undefined;}}
/** Ordered alias → project → exact hostname classification. @param {string} url @param {Config} config @returns {Category} */
export function classify(url,config) {
 const u=webUrl(url);if(!u)return {key:'other',label:'其他',project:''};
 const p=config.projects.find(p=>p.patterns.some(s=>url.toLowerCase().includes(s.toLowerCase())));
 const alias=config.aliases.find(a=>a.hosts.includes(u.hostname));
 if(alias) return {key:`alias:${alias.key}`,label:alias.label,project:p?.label||repository(u)};
 if(p)return {key:`project:${p.key}`,label:p.label,project:''};
 return {key:`host:${u.hostname}`,label:u.hostname,project:''};
}
/** Repository grouping within a service family. @param {URL} u @returns {string} */
function repository(u){return u.pathname.split('/-/')[0].split('/').filter(Boolean).slice(0,3).join('/');}
/** Normalize IDs only for matching; never replace stored original URLs. @param {string} value @returns {string|undefined} */
function matchingUrl(value){const u=webUrl(value);if(!u)return undefined;
 const path=u.pathname.split('/').map(part=>/^\d+$/.test(part)?'\u0000':part).join('/');
 const query=u.search.slice(1).split('&').filter(part=>new URLSearchParams(part).keys().next().value!=='id').join('&');
 const serialized=u.href,prefix=serialized.slice(0,serialized.indexOf('/',u.protocol.length+2));
 return prefix+path+(query?'?'+query:'')+u.hash;}

/** Case-sensitive URL containment after ignoring query id and numeric path IDs. @param {string} a @param {string} b @returns {boolean} */
export function duplicateUrls(a,b){const x=matchingUrl(a),y=matchingUrl(b);return x!==undefined&&y!==undefined&&(x.includes(y)||y.includes(x));}
/** Exact hostname equality for HTTP(S), independent of port or protocol. @param {string} a @param {string} b @returns {boolean} */
export function sameHostname(a,b){const x=webUrl(a),y=webUrl(b);return !!x&&!!y&&x.hostname===y.hostname;}
/** Exact supported Git hosts; aliases never imply cross-host project identity. @param {string} value @param {Config} c @returns {boolean} */
function isGitSite(value,c){const u=webUrl(value);return !!u&&(u.hostname==='github.com'||c.aliases.some(a=>a.key==='git'&&a.hosts.includes(u.hostname)));}
/** Full, unambiguous Git project identity; global and unknown routes are not guessed. @param {string} value @param {Config} c @returns {string|undefined} */
export function gitProject(value,c){
 const u=webUrl(value);if(!u||!isGitSite(value,c)||/%(?:2f|5c|00)/i.test(u.pathname))return undefined;
 const parts=u.pathname.replace(/\/$/,'').split('/').slice(1);
 if(parts.length<2||parts.some(p=>!p)||['-','dashboard','groups','users','settings','search','explore','admin','help','projects','profile','oauth','api','assets','uploads','snippets','public','orgs','organizations','login','logout','sessions','features','marketplace','topics','collections','events','sponsors','notifications'].includes(parts[0].toLowerCase()))return undefined;
 let path;
 if(u.hostname==='github.com'){
 if(['security','codespaces','copilot','new','account','contact','enterprise','readme','site','pricing','join','signup','about','apps','business','sitemap','education','solutions','resources','partners','customer-stories','mobile','premium-support','mcp','trust-center'].includes(parts[0].toLowerCase()))return undefined;
 if(parts.length>2&&!['issues','pull','pulls','tree','blob','commits','commit','actions','projects','wiki','discussions','settings','releases','tags','branches','compare','network','graphs','security','deployments','activity','stargazers','watchers','forks','packages','search','find','edit','new','delete','blame','raw','runs','labels','milestones','archive','community','contribute','attestations'].includes(parts[2]))return undefined;
 path=parts.slice(0,2).join('/').toLowerCase();
 }
 else {const marker=parts.indexOf('-');
 if(marker>=2)path=parts.slice(0,marker).join('/');
 else if(marker!==-1)return undefined;
 else if(parts.length===2||['merge_requests','issues','branches','tags','tree','blob','commits','commit','compare','pipelines','pipeline_schedules','jobs','network','graphs','releases','wikis','edit','settings'].includes(parts[2]))path=parts.slice(0,2).join('/');
 else return undefined;
 }
 return JSON.stringify([u.host,path]);
}
/** Concrete closure protections; explicit unloaded status needs no live DOM probe. @param {TabSnapshot} t @param {Config} c @param {number} now @param {boolean} [manual] @returns {boolean} */
export function canClose(t,c,now,manual=false) {
 const u=webUrl(t.url),s=t.state;
 const safe=t.status==='unloaded'||t.discarded===true||isNewTab(t.url)?(!s?.dirty&&!s?.media&&!s?.captured):!!s&&s.known&&!s.dirty&&!s.media&&!s.captured&&Number.isFinite(s.checkedAt)&&now-s.checkedAt<=120000&&now>=s.checkedAt;
 return (!!u||(c.cleanTemporary&&isNewTab(t.url)))&&!!t.spaceId&&t.status!=='loading'&&!t.active&&!t.pinned&&!t.audible&&!t.captured&&t.groupId===-1&&t.splitId===-1&&safe&&
 (!u||!c.whitelist.includes(u.hostname))&&Number.isFinite(t.lastAccessed)&&(manual||(Number.isFinite(t.stableSince)&&now-/** @type {number} */(t.stableSince)>=30000))&&now>=/** @type {number} */(t.lastAccessed)&&t.cooldownUntil<=now;
}
/** Build transitive group/split blocks without changing members. @param {TabSnapshot[]} tabs @returns {TabSnapshot[][]} */
export function blocks(tabs) {
 /** @type {TabSnapshot[][]} */ const result=[];
 for(const t of tabs){const matches=result.filter(b=>b.some(x=>(t.groupId!==-1&&x.groupId===t.groupId)||(t.splitId!==-1&&x.splitId===t.splitId)));
 if(!matches.length)result.push([t]);else {const first=matches[0];first.push(t);for(const more of matches.slice(1)){first.push(...more);result.splice(result.indexOf(more),1);}first.sort((a,b)=>a.index-b.index);}}
 return result;
}
/** Compute closure candidates and complete per-window ordering, with no effects. @param {TabSnapshot[]} input @param {Config} config @param {number} now @param {boolean} [manual] @returns {MaintenancePlan} */
export function planMaintenance(input,config,now,manual=false) {
 const c=validateConfig(config),tabs=input.map(t=>structuredClone(t)).sort((a,b)=>a.windowId-b.windowId||a.index-b.index);
 /** @type {MaintenancePlan} */ const result={closures:[],order:[],tabs,waiting:[]};
 /** @type {Map<number,number>} */const projectDuplicates=new Map();
 /** @type {Set<number>} */const projectKeepers=new Set();
 if(c.deduplicate){
 /** @type {Map<string,TabSnapshot[]>} */const projects=new Map();
 for(const t of tabs){const project=gitProject(t.url,c);if(!project||(c.cleanTemporary&&instantKind(t)))continue;const key=JSON.stringify([t.windowId,t.spaceId,project]);const group=projects.get(key)??[];group.push(t);projects.set(key,group);}
 for(const group of projects.values()){const keeper=group.slice().sort((a,b)=>(b.lastAccessed??-Infinity)-(a.lastAccessed??-Infinity)||(b.openedAt??-Infinity)-(a.openedAt??-Infinity)||a.id-b.id)[0];projectKeepers.add(keeper.id);for(const t of group)if(t.id!==keeper.id)projectDuplicates.set(t.id,keeper.id);}
 }
 /** @type {Map<number,number>} */const duplicates=new Map();
 /** @type {Set<number>} */const keepers=new Set();
 if(c.deduplicate){
 const ranked=tabs.filter(t=>!isGitSite(t.url,c)&&(!c.cleanTemporary||!instantKind(t))).sort((a,b)=>Number(Number.isFinite(b.openedAt))-Number(Number.isFinite(a.openedAt))||(Number.isFinite(b.openedAt)&&Number.isFinite(a.openedAt)?/** @type {number} */(b.openedAt)-/** @type {number} */(a.openedAt):0)||(b.lastAccessed??-Infinity)-(a.lastAccessed??-Infinity)||a.id-b.id);
 /** @type {TabSnapshot[]} */const retained=[];
 for(const t of ranked){const keeper=retained.find(x=>x.windowId===t.windowId&&x.spaceId===t.spaceId&&duplicateUrls(x.url,t.url));
 if(keeper){duplicates.set(t.id,keeper.id);keepers.add(keeper.id);}else retained.push(t);}
 }
 /** @type {Map<number,number>} */const hostDuplicates=new Map();
 /** @type {Set<number>} */const hostKeepers=new Set();
 if(c.deduplicate&&c.consolidateHost){
 /** @type {Map<string,TabSnapshot[]>} */const groups=new Map();
 for(const t of tabs){const u=webUrl(t.url);if(!u||isGitSite(t.url,c)||duplicates.has(t.id)||(c.cleanTemporary&&instantKind(t)))continue;const key=JSON.stringify([t.windowId,t.spaceId,u.hostname]);const group=groups.get(key)??[];group.push(t);groups.set(key,group);}
 for(const group of groups.values()){if(group.length<2)continue;const anchor=group.slice().sort((a,b)=>(b.lastAccessed??-Infinity)-(a.lastAccessed??-Infinity)||a.id-b.id)[0];hostKeepers.add(anchor.id);
 for(const t of group)if(t.id!==anchor.id&&!keepers.has(t.id)&&Number.isFinite(t.lastAccessed)&&now-/** @type {number} */(t.lastAccessed)>=86400000)hostDuplicates.set(t.id,anchor.id);}
 }
 for(const t of tabs){if(!canClose(t,c,now,manual))continue;
 const instant=c.cleanTemporary?instantKind(t):undefined,keeperId=duplicates.get(t.id);
 if(instant)result.closures.push({id:t.id,reason:instant});
 else if(projectDuplicates.has(t.id))result.closures.push({id:t.id,keeperId:projectDuplicates.get(t.id),reason:'git-project'});
 else if(keeperId!==undefined)result.closures.push({id:t.id,keeperId,reason:'duplicate'});
 else if(hostDuplicates.has(t.id))result.closures.push({id:t.id,keeperId:hostDuplicates.get(t.id),reason:'host-duplicate'});
 else if(c.cleanTemporary&&!keepers.has(t.id)&&!hostKeepers.has(t.id)&&!projectKeepers.has(t.id)&&temporaryKind(t)&&now-/** @type {number} */(t.lastAccessed)>=86400000)result.closures.push({id:t.id,reason:'temporary'});
 else if(c.expire&&!keepers.has(t.id)&&!hostKeepers.has(t.id)&&!projectKeepers.has(t.id)&&now-/** @type {number} */(t.lastAccessed)>=c.days*86400000)result.closures.push({id:t.id,reason:'expired'});
 }
 for(const windowId of new Set(tabs.map(t=>t.windowId))){const list=tabs.filter(t=>t.windowId===windowId);
 if(c.sort&&list.some(t=>t.groupId!==-1||t.splitId!==-1)){result.waiting.push(`窗口 ${windowId} 含现有分组或分屏，已保留整个 窗口 的原顺序`);result.order.push(...list.map(t=>t.id));continue;}
 const sorted=blocks(list).map((members,i)=>({members,i,category:classify(members[0].url,c),pinned:members.some(t=>t.pinned)}));
 if(c.sort)sorted.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(a.pinned&&b.pinned?0:a.category.label.localeCompare(b.category.label,'zh-CN')||a.category.key.localeCompare(b.category.key)||a.category.project.localeCompare(b.category.project,'zh-CN'))||a.i-b.i);
 result.order.push(...sorted.flatMap(b=>b.members.map(t=>t.id)));
 }
 return result;
}

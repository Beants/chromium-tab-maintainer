import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,planMaintenance,validateConfig,defaultConfig,duplicateUrls} from '../extension/policy.js';
import {config,now,tab} from './fixtures.js';
const plan = (tabs,c={})=>planMaintenance(tabs,{...config,...c},now);
test('Git aliases stay in one block without cross-domain deduplication',()=>{
 const tabs=[tab(1,'https://git.example.com/team/orders/app/-/merge_requests/8'),tab(2,'https://example.org/article'),tab(3,'https://gitlab.example.com/team/orders/app/-/merge_requests/8'),tab(4,'https://code.example.com/group/Platform/project')];
 const p=plan(tabs,{expire:false});assert.equal(p.closures.length,0);assert.deepEqual(p.order.filter(id=>id!==2),[1,3,4]);assert.ok(!p.order.slice(p.order.indexOf(1),p.order.indexOf(4)+1).includes(2));
});
test('URL containment includes query and fragment extensions with per-window isolation',()=>{
 const p=plan([tab(1,undefined,{active:true}),tab(2),tab(3,'https://docs.example.com/docs/intro?q=1'),tab(4,'https://docs.example.com/docs/intro#one'),tab(5,undefined,{windowId:2,spaceId:'2'})],{expire:false});
 assert.deepEqual(p.closures.map(c=>[c.id,c.keeperId]),[[2,1],[3,1],[4,1]]);
});
test('all uncertain or protected state is exempt',()=>{
 const changes=[{active:true},{pinned:true},{audible:true},{captured:true},{state:undefined},{state:{known:false}},{state:{known:true,dirty:true}},{state:{known:true,media:true}},{state:{known:true,captured:true}},{state:{known:true,dirty:false,media:false,captured:false,checkedAt:now-120001}},{groupId:3},{splitId:4},{cooldownUntil:now+1},{spaceId:''}];
 for(const change of changes) assert.equal(plan([tab(1,undefined,change)]).closures.length,0,JSON.stringify(change));
 assert.equal(plan([tab(1)],{whitelist:['docs.example.com']}).closures.length,0);
});
test('seven-day boundary, stability and missing timestamps',()=>{
 assert.equal(plan([tab(1,undefined,{lastAccessed:now-7*86400000})]).closures.length,1);
 for(const change of [{lastAccessed:now-7*86400000+1},{lastAccessed:undefined},{stableSince:now-29999},{stableSince:undefined}]) assert.equal(plan([tab(1,undefined,change)]).closures.length,0);
 assert.equal(plan([tab(1,undefined,{stableSince:now-30000})]).closures.length,1);
});
test('all HTTP sites and paths qualify when concrete safety permits',()=>{
 for(const url of ['file:///a','blob:https://docs.example.com/a','chrome://settings']) assert.equal(plan([tab(1,url)]).closures.length,0,url);
 for(const url of ['https://docs.example.com/login','https://docs.example.com/chat/1','https://unknown.test/article','http://127.0.0.1:3080/']) assert.equal(plan([tab(1,url)]).closures.length,1,url);
});
test('unknown opening times fall back to access time; protected siblings remain',()=>{
 assert.deepEqual(plan([tab(1),tab(2,undefined,{lastAccessed:now-1}),tab(3,undefined,{active:true})],{expire:false}).closures.map(c=>[c.id,c.keeperId]),[[1,2]]);
 assert.equal(plan([tab(1,undefined,{pinned:true}),tab(2,undefined,{audible:true})],{expire:false}).closures.length,0);
});
test('mixed groups and split transitive blocks remain atomic and stable',()=>{
 const tabs=[tab(1,'https://z.test',{pinned:true}),tab(2,'https://z.test',{groupId:3}),tab(3,'https://a.test',{groupId:3,splitId:8}),tab(4,'https://b.test',{splitId:8}),tab(5,'https://a.test'),tab(6,'https://a.test')];
 const before=structuredClone(tabs),p=plan(tabs);assert.deepEqual(tabs,before);assert.equal(p.order[0],1);assert.deepEqual(p.order.slice(p.order.indexOf(2),p.order.indexOf(2)+3),[2,3,4]);assert.ok(p.order.indexOf(5)<p.order.indexOf(6));
});
test('user aliases win over project and exact hostname is fallback',()=>{
 assert.equal(classify('https://git.example.com/orders/repo',config).key,'alias:git');
 assert.equal(classify('https://a.test/orders/app',config).key,'project:order');
 assert.equal(classify('https://a.test/x',config).key,'host:a.test');
 assert.equal(classify('file:///a',config).key,'other');
 assert.equal(classify('https://extra.test/',{...config,aliases:[{key:'mine',label:'Mine',hosts:['extra.test']}]}).key,'alias:mine');
});
test('validation is atomic and defaults paused with exact seven days',()=>{
 assert.equal(defaultConfig().enabled,false);assert.equal(defaultConfig().days,7);assert.equal(defaultConfig().spaceMappingVerified,false);
 for(const patch of [{days:0},{days:366},{days:1.5},{aliases:[{key:'x',hosts:['*']}]},{projects:[{key:'x',label:'x',patterns:['']}]},{readOnlyRules:[{host:'bad/path',pathPrefix:'/'}]},{enabled:'yes'},{whitelist:['*']}]) assert.throws(()=>validateConfig({...config,...patch}));
 assert.deepEqual(validateConfig(config),config);assert.notEqual(validateConfig(config),config);
});
test('public defaults use public Git services and no personal site rules',()=>{
 const defaults=defaultConfig();assert.deepEqual(defaults.aliases,[{key:'git',label:'Git',hosts:['github.com','gitlab.com']}]);assert.deepEqual(defaults.projects,[]);assert.deepEqual(defaults.readOnlyRules,[]);assert.deepEqual(defaults.whitelist,[]);
 assert.equal(classify('https://github.com/team/repo',defaults).key,'alias:git');assert.equal(classify('https://gitlab.com/team/repo',defaults).key,'alias:git');
});
test('expiry remains independent when deduplication is disabled or sibling is protected',()=>{
 assert.deepEqual(plan([tab(1),tab(2)],{deduplicate:false}).closures.map(x=>[x.id,x.reason]),[[1,'expired'],[2,'expired']]);
 assert.deepEqual(plan([tab(1,undefined,{active:true}),tab(2)],{deduplicate:false}).closures.map(x=>[x.id,x.reason]),[[2,'expired']]);
});
test('duplicate reason wins for nonkeeper and newest keeper never expires in the same plan',()=>{
 const closures=plan([tab(1),tab(2,undefined,{lastAccessed:now-9*86400000})]).closures;
 assert.deepEqual(closures.map(x=>[x.id,x.reason]),[[2,'duplicate']]);
});
test('known newest opening beats recent access, regardless of index or old age',()=>{
 for(const ids of [[1,2],[2,1]]){
  const tabs=[tab(ids[0],undefined,{openedAt:now-3600000,lastAccessed:now-9*86400000}),tab(ids[1],undefined,{openedAt:now-1000,lastAccessed:now-8*86400000})];
  assert.deepEqual(plan(tabs).closures.map(x=>[x.id,x.keeperId,x.reason]),[[ids[0],ids[1],'duplicate']]);
 }
 const known=plan([tab(1,undefined,{lastAccessed:now-1000}),tab(2,undefined,{openedAt:now-3600000,lastAccessed:now-9*86400000})],{expire:false});
 assert.deepEqual(known.closures.map(x=>[x.id,x.keeperId]),[[1,2]]);
});
test('hourly duplicate cleanup does not wait seven days for recently visited pages',()=>{
 const pages=[tab(1,undefined,{lastAccessed:now-3600000,openedAt:now-7200000}),tab(2,undefined,{lastAccessed:now-1800000,openedAt:now-3600000})];
 assert.deepEqual(plan(pages).closures.map(x=>[x.id,x.keeperId,x.reason]),[[1,2,'duplicate']]);
 assert.deepEqual(plan(pages,{deduplicate:false}).closures,[]);
});
test('non-containing query and fragment variants remain separate',()=>{
 const url='https://docs.example.com/docs/intro?q=1#x';
 const tabs=[tab(1,url,{openedAt:now-5000,pinned:true}),tab(2,url,{openedAt:now-1000}),tab(3,'http://docs.example.com/docs/intro?q=1#x'),tab(4,'https://docs.example.com/docs/intro?q=2#x'),tab(5,'https://docs.example.com/docs/intro?q=1#y'),tab(6,'https://docs.example.com/docs/other?q=1#x')];
 assert.deepEqual(plan(tabs,{expire:false}).closures,[]);
});
test('tied keeper ranking uses stable ID regardless of actual tab position',()=>{
 for(const known of [true,false])for(const reverse of [true,false]){
  const first=tab(1,undefined,{index:reverse?1:0,lastAccessed:now-3600000,...(known?{openedAt:now-7200000}:{})});
  const second=tab(2,undefined,{index:reverse?0:1,lastAccessed:now-3600000,...(known?{openedAt:now-7200000}:{})});
  assert.deepEqual(plan([first,second],{expire:false}).closures.map(x=>[x.id,x.keeperId]),[[2,1]]);
 }
});
test('a 窗口 with a group or split retains its entire order and explains sorting skip',()=>{
 const tabs=[tab(1,'https://z.test',{groupId:4}),tab(2,'https://a.test',{groupId:4}),tab(3,'https://b.test')];
 const result=plan(tabs,{expire:false,deduplicate:false});
 assert.deepEqual(result.order,[1,2,3]);assert.match(result.waiting.join(),/分组|分屏/);
 const split=plan([tab(1,'https://z.test',{splitId:8}),tab(2,'https://a.test')],{expire:false,deduplicate:false});
 assert.deepEqual(split.order,[1,2]);assert.match(split.waiting.join(),/分组|分屏/);
 const withClose=plan([tab(1,'https://z.test',{groupId:4}),tab(2,'https://docs.example.com/a')],{sort:true});
 assert.deepEqual(withClose.closures.map(x=>x.id),[2]);assert.deepEqual(withClose.order,[1,2]);
});

test('containment uses newest keeper without using removed root as a bridge',()=>{
 const root='https://docs.example.com/';
 const pages=[tab(1,root+'one',{openedAt:now-1000,lastAccessed:now-1000}),tab(2,root,{openedAt:now-2000,lastAccessed:now-2000}),tab(3,root+'two',{openedAt:now-3000,lastAccessed:now-3000})];
 assert.deepEqual(plan(pages).closures.map(x=>[x.id,x.keeperId]),[[2,1]]);
 const rootNewest=pages.map(t=>({...t,openedAt:t.id===2?now:now-1000}));
 assert.deepEqual(plan(rootNewest).closures.map(x=>[x.id,x.keeperId]),[[1,2],[3,2]]);
});
test('unloaded HTTP tabs close without a live DOM; loading or unknown live tabs do not',()=>{
 assert.equal(plan([tab(1,undefined,{status:'unloaded',state:undefined})]).closures.length,1);
 for(const status of ['loading','complete'])assert.equal(plan([tab(1,undefined,{status,state:undefined})]).closures.length,0);
 assert.equal(plan([tab(1,undefined,{status:'unloaded',state:{known:true,dirty:true}})]).closures.length,0);
});

test('ID query values and fully numeric path IDs do not distinguish duplicate URLs',()=>{
 assert.equal(duplicateUrls('https://git.test/p/merge_requests/123?id=7&view=diff#x','https://git.test/p/merge_requests/456?id=8&view=diff#x'),true);
 assert.equal(duplicateUrls('https://git.test/p/123?id=1&id=2','https://git.test/p/456'),true);
 for(const [a,b] of [['/v1','/v2'],['/item123','/item456'],['/p/1?view=a','/p/2?view=b'],['/p/1#one','/p/2#two']])assert.equal(duplicateUrls('https://git.test'+a,'https://git.test'+b),false);
 const pages=[tab(1,'https://git.test/p/123',{lastAccessed:now-1000}),tab(2,'https://git.test/p/456',{lastAccessed:now-2000})];
 assert.deepEqual(plan(pages,{expire:false}).closures.map(c=>[c.id,c.keeperId,c.reason]),[[2,1,'duplicate']]);assert.equal(pages[0].url,'https://git.test/p/123');
});
test('hostname consolidation uses exact host and the 24-hour boundary',()=>{
 const fresh=tab(1,'https://git.test/new',{lastAccessed:now-1000});
 const old=tab(2,'http://git.test:8080/old',{lastAccessed:now-86400000});
 const run=(pages)=>plan(pages,{consolidateHost:true,expire:false}).closures;
 assert.deepEqual(run([fresh,old]).map(c=>[c.id,c.keeperId,c.reason]),[[2,1,'host-duplicate']]);
 assert.deepEqual(run([fresh,{...old,lastAccessed:now-86400000+1}]),[]);
 assert.deepEqual(run([fresh,{...old,lastAccessed:undefined}]),[]);
 assert.deepEqual(run([fresh,{...old,url:'https://mail.git.test/old'}]),[]);
 assert.deepEqual(run([fresh,{...old,windowId:2,spaceId:'2'}]),[]);
 assert.deepEqual(run([fresh,old].map(t=>({...t,pinned:true}))),[]);
 assert.deepEqual(plan([fresh,old],{consolidateHost:false,expire:false}).closures,[]);
 assert.deepEqual(plan([fresh,old],{consolidateHost:true,deduplicate:false,expire:false}).closures,[]);
});
test('hostname consolidation protects its survivor but does not stop true singleton expiry',()=>{
 const pages=[tab(1,'https://git.test/one',{lastAccessed:now-8*86400000}),tab(2,'https://git.test/two',{lastAccessed:now-9*86400000})];
 assert.deepEqual(plan(pages,{consolidateHost:true}).closures.map(c=>[c.id,c.keeperId,c.reason]),[[2,1,'host-duplicate']]);
 assert.deepEqual(plan([pages[0]],{consolidateHost:true}).closures.map(c=>[c.id,c.reason]),[[1,'expired']]);
});
test('hostname pass does not delete URL keeper or select a removed duplicate as anchor',()=>{
 const pages=[tab(1,'https://git.test/p/123',{openedAt:now-1000,lastAccessed:now-2*86400000}),tab(2,'https://git.test/p/456',{openedAt:now-2000,lastAccessed:now-1000}),tab(3,'https://git.test/other',{lastAccessed:now-2000})];
 const first=plan(pages,{consolidateHost:true,expire:false});
 assert.deepEqual(first.closures.map(c=>[c.id,c.keeperId,c.reason]),[[2,1,'duplicate']]);
 assert.deepEqual(plan(pages.filter(t=>t.id!==2),{consolidateHost:true,expire:false}).closures.map(c=>[c.id,c.keeperId,c.reason]),[[1,3,'host-duplicate']]);
});
test('legacy config enables hostname consolidation and invalid explicit values reject',()=>{
 const legacy={...config};delete legacy.consolidateHost;
 assert.equal(validateConfig(legacy).consolidateHost,true);assert.equal(defaultConfig().consolidateHost,true);assert.equal('consolidateHost' in legacy,false);
 for(const value of ['yes',null,0])assert.throws(()=>validateConfig({...config,consolidateHost:value}));
});

test('ID normalization cannot collide with literal paths or rewrite other query values',()=>{
 assert.equal(duplicateUrls('https://git.test/p/:id','https://git.test/p/123'),false);
 assert.equal(duplicateUrls('https://git.test/p/%00','https://git.test/p/123'),false);
 assert.equal(duplicateUrls('https://git.test/p/123?q=a%20b','https://git.test/p/456?q=a+b'),false);
 assert.equal(duplicateUrls('https://git.test/p/123?id=1&q=a%20b','https://git.test/p/456?q=a%20b&id=2'),true);
});

test('temporary singleton pages expire after 24 hours independently of deduplication',()=>{
 const urls=['https://www.google.com/search?q=test','https://www.google.com.hk/search?q=test','https://www.baidu.com/s?wd=test','https://www.bing.com/search?q=test','https://v2ex.com/t/123','https://multica.ai/changelog','https://opencode.ai/zh/go','https://lightvela.com/docs/overview','https://www.deepseek.com/','https://app.example.com/auth/sign-in'];
 for(const url of urls){const rows=plan([tab(1,url,{lastAccessed:now-86400000})],{cleanTemporary:true,expire:false,deduplicate:false}).closures;assert.deepEqual(rows.map(c=>[c.id,c.reason]),[[1,'temporary']],url);}
 assert.deepEqual(plan([tab(1,'https://a.test/failed',{title:'503 Service Temporarily Unavailable',lastAccessed:now-86400000})],{cleanTemporary:true,expire:false}).closures.map(c=>c.reason),['error']);
});
test('temporary cleanup does not guess business pages or use incomplete ages',()=>{
 const urls=['https://www.google.com/search','https://google.com.evil.test/search?q=x','https://www.google.com/searching?q=x','https://docs.example.com/docs/intro','https://git.test/merge_requests/123','https://a.test/blog/login-help','https://lightvela.com/docs/overview/more','blob:https://a.test/id'];
 for(const url of urls)assert.deepEqual(plan([tab(1,url)],{cleanTemporary:true,expire:false}).closures,[],url);
 for(const patch of [{lastAccessed:now-86400000+1},{lastAccessed:undefined},{pinned:true},{active:true},{state:{known:true,dirty:true,checkedAt:now}}])assert.deepEqual(plan([tab(1,'https://www.google.com/search?q=x',patch)],{cleanTemporary:true,expire:false}).closures,[]);
 assert.deepEqual(plan([tab(1,'https://www.google.com/search?q=x')],{cleanTemporary:false,expire:false}).closures,[]);
});
test('temporary expiry cannot delete referenced URL and host keepers in the same run',()=>{
 const pages=[tab(1,'https://www.google.com/search?q=x&id=1',{lastAccessed:now-2*86400000}),tab(2,'https://www.google.com/search?q=x&id=2',{lastAccessed:now-3*86400000})];
 assert.deepEqual(plan(pages,{cleanTemporary:true,expire:false}).closures.map(c=>[c.id,c.keeperId,c.reason]),[[2,1,'duplicate']]);
 assert.deepEqual(plan([pages[0]],{cleanTemporary:true,expire:false}).closures.map(c=>[c.id,c.reason]),[[1,'temporary']]);
 const hostPages=[pages[0],tab(3,'https://www.google.com/search?q=y',{lastAccessed:now-3*86400000})];
 const p=plan(hostPages,{cleanTemporary:true,consolidateHost:true,expire:false});assert.equal(p.closures.length,1);assert.equal(p.closures[0].id,3);
});
test('temporary cleanup migration only defaults missing fields and rejects invalid values',()=>{
 const legacy={...config};delete legacy.cleanTemporary;assert.equal(validateConfig(legacy).cleanTemporary,true);assert.equal(defaultConfig().cleanTemporary,true);
 for(const value of [null,0,'true'])assert.throws(()=>validateConfig({...config,cleanTemporary:value}));
});

test('instant cleanup closes fresh sleeping, errors, Baidu home and NewTab without a keeper',()=>{
 const cases=[['https://a.test/work',{discarded:true,state:undefined},'dormant'],['https://a.test/error',{title:'503 Service Temporarily Unavailable'},'error'],['https://www.baidu.com/',{},'homepage'],['https://baidu.com/?tn=home',{},'homepage'],['chrome://newtab/',{state:undefined},'newtab'],['chrome://new-tab-page/',{state:undefined},'newtab']];
 for(const [url,patch,reason] of cases){const rows=plan([tab(1,url,{...patch,lastAccessed:now-1000})],{cleanTemporary:true,expire:false,deduplicate:false}).closures;assert.deepEqual(rows.map(c=>c.reason),[reason],url);}
});
test('instant cleanup does not mistake results, documents or unrelated internal pages',()=>{
 for(const [url,title] of [['https://www.baidu.com/s?wd=x','搜索结果'],['https://www.baidu.com/other','百度'],['https://www.baidu.com.evil.test/','百度'],['https://a.test/article','How to fix 503 errors'],['https://a.test/article','404 patterns in software'],['about:blank','临时报表'],['chrome://settings/','设置'],['chrome-extension://abc/options.html','维护']])assert.deepEqual(plan([tab(1,url,{title,lastAccessed:now-1000})],{cleanTemporary:true,expire:false,deduplicate:false}).closures,[],url);
 for(const title of ['404 Not Found','429 Too Many Requests','502 Bad Gateway','500 Internal Server Error','HTTP ERROR 403','ERR_CONNECTION_REFUSED','系统仅限内网访问'])assert.deepEqual(plan([tab(1,'https://a.test/err',{title,lastAccessed:now-1000})],{cleanTemporary:true,expire:false,deduplicate:false}).closures.map(c=>c.reason),['error'],title);
});
test('instant cleanup honors protection and its switch even with no live document',()=>{
 for(const url of ['chrome://newtab/','https://www.baidu.com/','https://a.test/'])for(const patch of [{active:true},{pinned:true},{audible:true},{captured:true},{groupId:1},{splitId:2},{cooldownUntil:now+1},{stableSince:now-29999},{state:{known:true,dirty:true}},{state:{known:true,media:true}},{state:{known:true,captured:true}}])assert.deepEqual(plan([tab(1,url,{discarded:true,state:undefined,...patch})],{cleanTemporary:true,expire:false,deduplicate:false}).closures,[],JSON.stringify(patch));
 assert.deepEqual(plan([tab(1,'https://a.test/',{discarded:true,state:undefined})],{cleanTemporary:true,whitelist:['a.test'],expire:false,deduplicate:false}).closures,[]);
 assert.deepEqual(plan([tab(1,'chrome://newtab/')],{cleanTemporary:false,expire:false,deduplicate:false}).closures,[]);
 assert.deepEqual(plan([tab(1,'https://a.test/',{status:'unloaded',state:undefined,lastAccessed:now-1000})],{cleanTemporary:true,expire:false,deduplicate:false}).closures,[]);
});
test('instant removals never become duplicate keepers and may close all identical homes',()=>{
 const rows=plan([tab(1,'https://www.baidu.com/'),tab(2,'https://www.baidu.com/')],{cleanTemporary:true,expire:false,consolidateHost:true}).closures;
 assert.deepEqual(rows.map(c=>[c.id,c.reason,c.keeperId]),[[1,'homepage',undefined],[2,'homepage',undefined]]);
 const pair=plan([tab(1,'https://a.test/work',{discarded:true,state:undefined,lastAccessed:now-1}),tab(2,'https://a.test/work',{lastAccessed:now-2})],{cleanTemporary:true,expire:false}).closures;
 assert.deepEqual(pair.map(c=>[c.id,c.reason]),[[1,'dormant']]);
});

test('disabling disposable cleanup protects NewTab even when legacy expiry is enabled',()=>{
 for(const url of ['chrome://newtab/','chrome://new-tab-page/'])assert.deepEqual(plan([tab(1,url,{state:undefined})],{cleanTemporary:false,expire:true,deduplicate:false}).closures,[]);
});

test('Git project consolidation keeps the last visited page without an age threshold',()=>{
 const root='https://gitlab.example.com/team/repo';
 const pages=[tab(1,root+'/branches',{lastAccessed:now-2000,openedAt:now-1}),tab(2,root+'/merge_requests/10',{lastAccessed:now-1000,openedAt:now-2000}),tab(3,root+'/-/blob/main/a.md',{lastAccessed:now-3000})];
 assert.deepEqual(plan(pages,{consolidateHost:true}).closures.map(c=>[c.id,c.keeperId,c.reason]),[[1,2,'git-project'],[3,2,'git-project']]);
 assert.deepEqual(plan(pages,{deduplicate:false,expire:false}).closures,[]);
});
test('Git projects never collapse across namespace, site, ports, 窗口 or path prefixes',()=>{
 const paths=['https://git.example.com/a/team/repo/-/issues/1','https://git.example.com/a/team/repo-extra/-/issues/1','https://git.example.com/a/other/repo/-/issues/1','https://gitlab.example.com/a/team/repo/-/issues/1','https://git.example.com:8443/a/team/repo/-/issues/1'];
 const rows=paths.map((url,i)=>tab(i+1,url));rows.push(tab(6,paths[0],{windowId:2,spaceId:'2'}));
 assert.deepEqual(plan(rows,{consolidateHost:true}).closures,[]);
 const nested=[tab(1,'https://git.example.com/org/a/project/-/merge_requests/1',{lastAccessed:now-1}),tab(2,'https://git.example.com/org/b/project/-/merge_requests/1')];assert.deepEqual(plan(nested,{consolidateHost:true}).closures,[]);
});
test('Git project keeper survives seven-day expiry and global Git pages cannot bridge projects',()=>{
 const pages=[tab(1,'https://git.example.com/team/repo/-/issues/1'),tab(2,'https://git.example.com/team/other/-/issues/2'),tab(3,'https://git.example.com/',{lastAccessed:now-1})];
 assert.deepEqual(plan(pages,{consolidateHost:true}).closures,[]);
 const pair=[tab(1,'https://git.example.com/team/repo'),tab(2,'https://git.example.com/team/repo-extra')];assert.deepEqual(plan(pair,{consolidateHost:true}).closures,[]);
});
test('Git project consolidation honors existing protections and excludes disposable keepers',()=>{
 const url='https://git.example.com/team/repo/-/issues/';
 for(const patch of [{pinned:true},{active:true},{state:undefined},{state:{known:true,dirty:true}},{groupId:4},{splitId:2},{cooldownUntil:now+1000}])assert.deepEqual(plan([tab(1,url+'1',{...patch,lastAccessed:now-2000}),tab(2,url+'2',{lastAccessed:now-1})],{consolidateHost:true,expire:false}).closures,[],JSON.stringify(patch));
 const p=plan([tab(1,url+'1',{discarded:true,state:undefined,lastAccessed:now-1}),tab(2,url+'2',{lastAccessed:now-2000})],{cleanTemporary:true,consolidateHost:true});assert.deepEqual(p.closures.map(c=>[c.id,c.reason]),[[1,'dormant']]);
});
test('GitHub owner repo routes share a project but global routes stay unguessed',()=>{
 const pages=[tab(1,'https://github.com/owner/repo/issues/1',{lastAccessed:now-2}),tab(2,'https://github.com/owner/repo/tree/main',{lastAccessed:now-1}),tab(3,'https://github.com/owner/other')];
 assert.deepEqual(plan(pages,{consolidateHost:true}).closures.map(c=>[c.id,c.keeperId,c.reason]),[[1,2,'git-project']]);
 for(const host of ['git.example.com','github.com'])for(const path of ['/groups/team','/users/alice','/settings/profile','/search?q=x','/-/profile','/dashboard/projects'])assert.deepEqual(plan([tab(1,`https://${host}${path}`),tab(2,`https://${host}${path}/extra`)],{expire:false,consolidateHost:true}).closures,[],host+path);
});
test('Git keeper ranking uses recent opening then stable ID only for tied visits',()=>{
 const url='https://git.example.com/team/repo/-/issues/';
 for(const reverse of [true,false]){const pages=[tab(1,url+'1',{lastAccessed:now-1,openedAt:now-2000,index:reverse?1:0}),tab(2,url+'2',{lastAccessed:now-1,openedAt:now-1000,index:reverse?0:1})];assert.deepEqual(plan(pages).closures.map(c=>[c.id,c.keeperId]),[[1,2]]);}
 assert.deepEqual(plan([tab(1,url+'1',{lastAccessed:now-1}),tab(2,url+'2',{lastAccessed:now-1})]).closures.map(c=>[c.id,c.keeperId]),[[2,1]]);
});

test('GitHub global security and Codespaces routes are not repository projects',()=>{
 for(const paths of [['/security/advisories/GHSA-aaaa-bbbb-cccc','/security/advisories/GHSA-dddd-eeee-ffff'],['/codespaces/new/owner/repo','/codespaces/new/other/project'],['/copilot/spaces/a','/copilot/spaces/b']])assert.deepEqual(plan(paths.map((p,i)=>tab(i+1,'https://github.com'+p,{lastAccessed:now-i-1})),{expire:false,consolidateHost:true}).closures,[]);
});

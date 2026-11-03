import test from 'node:test';import assert from 'node:assert/strict';
import {createEngine} from '../extension/engine.js';import {config,now,tab} from './fixtures.js';
export function fake(tabs=[tab(1,undefined,{active:true}),tab(2)]) {
 const f={tabs:structuredClone(tabs),saved:{config:structuredClone(config),records:[],meta:{},session:'session'},removed:[],moves:[],created:[],writes:0,hook:async()=>{},failSave:0,failRemove:false,has:true,
 now:()=>now,session:async()=>'session',load:async()=>structuredClone(f.saved),save:async s=>{f.writes++;await f.hook('save');if(f.failSave===f.writes)throw Error('quota');f.saved=structuredClone(s);},query:async()=>{await f.hook('query');return structuredClone(f.tabs);},get:async id=>{await f.hook('get',id);return structuredClone(f.tabs.find(t=>t.id===id));},remove:async id=>{if(f.failRemove)throw Error('busy');f.removed.push(id);f.tabs=f.tabs.filter(t=>t.id!==id);},move:async(ids,w,index)=>{f.moves.push({ids,w,index});},create:async(url,w,index)=>{const t=tab(100+f.created.length,url,{windowId:w??9,index,lastAccessed:now});f.created.push(t);f.tabs.push(t);return t;},hasWindow:async()=>f.has,idle:async()=>true};return f;
}
async function setup(tabs){const f=fake(tabs);const e=createEngine(f);await e.initialize();return {f,e};}
test('pending saved before delete and committed only after removal; same run serializes',async()=>{const {f,e}=await setup();await Promise.all([e.run(),e.run()]);assert.deepEqual(f.removed,[2]);assert.equal(f.saved.records[0].status,'closed');assert.ok(f.writes>=2);});
test('activation or URL change on immediate reread cancels deletion',async()=>{for(const patch of [{active:true},{url:'https://other.test'}]){const {f,e}=await setup();f.hook=async(kind,id)=>{if(kind==='get'&&id===2)Object.assign(f.tabs[1],patch);};await e.run();assert.deepEqual(f.removed,[]);}});
test('removed keeper cancels duplicate deletion',async()=>{const {f,e}=await setup();f.hook=async(kind,id)=>{if(kind==='get'&&id===1)f.tabs=f.tabs.filter(t=>t.id!==1);};await e.run();assert.deepEqual(f.removed,[]);});
test('storage failure never removes; remove failure never reports closed',async()=>{let {f,e}=await setup();f.failSave=1;await assert.rejects(e.run(),/quota/);assert.deepEqual(f.removed,[]);({f,e}=await setup());f.failRemove=true;await e.run();assert.equal(f.saved.records[0].status,'failed');});
test('crash after remove leaves visible pending recovery and resume never repeats remove',async()=>{const {f,e}=await setup();f.failSave=3;await assert.rejects(e.run(),/quota/);assert.deepEqual(f.removed,[2]);assert.equal(f.saved.records[0].status,'pending');const restarted=createEngine(f);await restarted.initialize();assert.equal(restarted.snapshot().records[0].status,'pending');f.failSave=0;await restarted.run();await restarted.restore([f.saved.records[0].id]);assert.deepEqual(f.removed,[2]);assert.equal(f.created.length,1);assert.equal(f.saved.meta['100'].cooldownUntil,now+86400000);});
test('pause immediately invalidates deferred get and deferred storage effects',async()=>{for(const deferKind of ['get','save']){const {f,e}=await setup();let release;let reached;const blocked=new Promise(r=>reached=r);f.hook=async kind=>{if(kind===deferKind){f.hook=async()=>{};reached();await new Promise(r=>release=r);}};const run=e.run();await blocked;const paused=e.pause();release();await Promise.all([run,paused]);assert.deepEqual(f.removed,[]);assert.equal(e.snapshot().config.enabled,false);}});
test('sort skips changed group/split/space structure',async()=>{for(const patch of [{groupId:6},{splitId:2},{spaceId:'different'}]){const {f,e}=await setup([tab(1,'https://z.test'),tab(2,'https://a.test')]);let q=0;f.hook=async kind=>{if(kind==='query'&&++q===2)Object.assign(f.tabs[0],patch);};await e.run(false,'sort-only');assert.equal(f.moves.length,0);}});
test('restore uses current window fallback, fresh access and dedup protection; prunes only old records',async()=>{const {f,e}=await setup();await e.run();f.has=false;const result=await e.restore(e.snapshot().records.map(r=>r.id));assert.deepEqual(result,{restored:1,fallback:1});assert.equal(f.created[0].windowId,9);assert.equal(e.snapshot().meta['100'].lastAccessed,now);assert.equal(e.snapshot().records[0].restoredAt,now);});
test('missing mapping or paused config previews only, activity waits 30 seconds',async()=>{for(const c of [{enabled:false},{spaceMappingVerified:false}]){const {e,f}=await setup();await e.configure({...config,...c});await e.run();assert.equal(f.removed.length,0);}const {e,f}=await setup();e.activity();const p=await e.run();assert.match(p.waiting.join(),/30/);assert.equal(f.removed.length,0);});
test('missing timestamp starts observation; activation only refreshes access; navigation resets stability',async()=>{const {e}=await setup([tab(1,undefined,{lastAccessed:undefined,stableSince:undefined})]);await e.run(true);assert.equal(e.snapshot().meta['1'].lastAccessed,now);await e.navigate(1);assert.equal(e.snapshot().meta['1'].stableSince,now);await e.activate(1);assert.equal(e.snapshot().meta['1'].lastAccessed,now);});
test('sorting preserves real order and group membership by skipping a grouped 窗口',async()=>{
 const f=fake([tab(1,'https://z.test',{groupId:7}),tab(2,'https://a.test',{groupId:7}),tab(3,'https://b.test')]);
 f.move=async(ids,w,index)=>{const moving=f.tabs.filter(t=>ids.includes(t.id));f.tabs=f.tabs.filter(t=>!ids.includes(t.id));f.tabs.splice(index,0,...moving);f.tabs.forEach((t,i)=>t.index=i);if(ids.length>1)moving[0].groupId=-1;f.moves.push({ids,w,index});};
 const e=createEngine(f);await e.initialize();const p=await e.run(false,'sort-only');
 assert.deepEqual(f.tabs.map(t=>t.id),[1,2,3]);assert.deepEqual(f.tabs.map(t=>t.groupId),[7,7,-1]);assert.deepEqual(f.moves,[]);assert.match(p.waiting.join(),/分组|分屏/);
});
test('restore with an empty committed URL keeps cooldown through redirect and worker restart',async()=>{
 const {f,e}=await setup();await e.run();
 f.create=async(url,w,index)=>{const t=tab(100,'',{windowId:w??1,index,status:'loading',pendingUrl:url,lastAccessed:now});f.created.push(t);f.tabs.push(t);return structuredClone(t);};
 await e.restore(e.snapshot().records.map(r=>r.id));assert.equal(e.snapshot().meta['100'].restoreRequestedUrl,'https://docs.example.com/docs/intro');assert.equal(e.snapshot().meta['100'].cooldownUntil,now+86400000);
 const restored=f.tabs.find(t=>t.id===100);restored.url='https://docs.example.com/redirect';await e.navigate(100);assert.equal(e.snapshot().meta['100'].cooldownUntil,now+86400000);
 const restarted=createEngine(f);await restarted.initialize();await restarted.run(true);assert.equal(restarted.snapshot().meta['100'].cooldownUntil,now+86400000);
 restored.url='https://docs.example.com/final';restored.status='complete';await restarted.navigate(100,true);assert.equal(restarted.snapshot().meta['100'].cooldownUntil,now+86400000);assert.equal(restarted.snapshot().meta['100'].restorePending,false);
 restored.url='https://docs.example.com/unrelated';await restarted.navigate(100,true);assert.equal(restarted.snapshot().meta['100'].cooldownUntil,0);
});
test('restore save failures are explicit and a post-create failure remains recoverable',async()=>{
 const {f,e}=await setup();await e.run();const ids=e.snapshot().records.map(r=>r.id);
 f.failSave=f.writes+1;await assert.rejects(e.restore(ids),/quota/);assert.equal(f.created.length,0);
 f.failSave=f.writes+2;await assert.rejects(e.restore(ids),/待确认/);assert.equal(f.created.length,1);
 const restarted=createEngine(f);await restarted.initialize();const record=restarted.snapshot().records[0];assert.equal(record.restoredAt,undefined);assert.equal(record.restoreAttemptAt,now);assert.equal(restarted.snapshot().config.enabled,false);
});
test('a new browser session pauses maintenance while a recent restore has no reliable tab identity',async()=>{
 const {f,e}=await setup();await e.run();await e.restore(e.snapshot().records.map(r=>r.id));
 f.session=async()=> 'new-browser-session';const restarted=createEngine(f);await restarted.initialize();
 assert.equal(restarted.snapshot().config.enabled,false);assert.deepEqual(restarted.snapshot().meta,{});
 await restarted.run();assert.deepEqual(f.removed,[2]);
});
test('restore ignores a reused numeric window ID from an earlier browser session or legacy record',async()=>{
 const {f,e}=await setup();await e.run();const id=e.snapshot().records[0].id;
 assert.equal(e.snapshot().records[0].session,'session');
 f.session=async()=> 'new-browser-session';f.has=true;
 const restarted=createEngine(f);await restarted.initialize();
 assert.deepEqual(await restarted.restore([id]),{restored:1,fallback:1});
 assert.equal(f.created[0].windowId,9);
 const legacy=fake();legacy.saved.records=[{...f.saved.records[0],id:'legacy',restoredAt:undefined,session:undefined}];
 const legacyEngine=createEngine(legacy);await legacyEngine.initialize();
 assert.deepEqual(await legacyEngine.restore(['legacy']),{restored:1,fallback:1});
 assert.equal(legacy.created[0].windowId,9);
});
test('final idle re-read protects a tab even if a browser event is missed',async()=>{
 const {f,e}=await setup([tab(1)]);let calls=0;f.idle=async()=>{if(++calls===2)f.tabs[0].audible=true;return true;};await e.run();assert.deepEqual(f.removed,[]);
});
test('observed opening time survives navigation and worker restart but not a new browser session',async()=>{
 const f=fake([tab(1,undefined,{openedAt:undefined})]);const e=createEngine(f);await e.initialize();
 await e.created(f.tabs[0]);assert.equal(e.snapshot().meta['1'].openedAt,now);
 f.tabs[0].url='https://docs.example.com/new';await e.navigate(1);assert.equal(e.snapshot().meta['1'].openedAt,now);
 const restarted=createEngine(f);await restarted.initialize();assert.equal(restarted.snapshot().meta['1'].openedAt,now);
 f.session=async()=> 'new-browser-session';const fresh=createEngine(f);await fresh.initialize();assert.equal(fresh.snapshot().meta['1'],undefined);
});
test('sort-only run cannot close an expired singleton or an older duplicate',async()=>{
 const f=fake([tab(1),tab(2)]);const e=createEngine(f);await e.initialize();await e.created(f.tabs[1],now-60000);f.now=()=>now;
 const result=await e.run(false,'sort-only');assert.deepEqual(result.closures,[]);assert.deepEqual(f.removed,[]);
 await e.run();assert.deepEqual(f.removed,[1]);assert.deepEqual(f.tabs.map(t=>t.id),[2]);
});
test('all-expired duplicate pairs retain their newest opened keeper in either index order',async()=>{
 for(const newestFirst of [false,true]){
  const ids=newestFirst?[2,1]:[1,2],tabs=ids.map(id=>tab(id,undefined,{lastAccessed:now-9*86400000})),f=fake(tabs);
  for(const t of tabs)f.saved.meta[String(t.id)]={url:t.url,windowId:t.windowId,lastAccessed:now-9*86400000,openedAt:now-(t.id===2?8:10)*86400000,stableSince:now-60000,cooldownUntil:0};
  const e=createEngine(f);await e.initialize();await e.run();assert.deepEqual(f.removed,[1]);assert.deepEqual(f.tabs.map(t=>t.id),[2]);
 }
});
test('protected older duplicate coexists with the newest keeper',async()=>{
 const f=fake([tab(1,undefined,{pinned:true}),tab(2)]);f.saved.meta['2']={url:f.tabs[1].url,windowId:1,lastAccessed:now-8*86400000,openedAt:now-1000,stableSince:now-60000,cooldownUntil:0};
 const e=createEngine(f);await e.initialize();await e.run();assert.deepEqual(f.removed,[]);
});
test('engine retains the same ID on tied creation or access time even when browser indices reverse',async()=>{
 for(const known of [true,false])for(const reverse of [true,false]){
  const tabs=[tab(1,undefined,{index:reverse?1:0}),tab(2,undefined,{index:reverse?0:1})],f=fake(tabs);
  if(known)for(const t of tabs)f.saved.meta[String(t.id)]={url:t.url,windowId:t.windowId,lastAccessed:now-8*86400000,openedAt:now-9*86400000,stableSince:now-60000,cooldownUntil:0};
  const e=createEngine(f);await e.initialize();await e.run();assert.deepEqual(f.removed,[2]);assert.deepEqual(f.tabs.map(t=>t.id),[1]);
 }
});

test('executor closes contained URLs and keeps the surviving longer URL',async()=>{
 const {f,e}=await setup([tab(1,'https://docs.example.com/docs/intro?view=1',{lastAccessed:now-1000}),tab(2,'https://docs.example.com/docs/intro',{lastAccessed:now-2000})]);
 await e.run();assert.deepEqual(f.removed,[2]);assert.equal(f.saved.records[0].status,'closed');
});

test('hostname closure rechecks last access before removal',async()=>{
 for(const refreshed of [false,true]){
  const {f,e}=await setup([tab(1,'https://git.test/fresh',{lastAccessed:now-1000}),tab(2,'https://git.test/stale',{lastAccessed:now-86400000})]);
  await e.configure({...config,consolidateHost:true,expire:false,sort:false});
  if(refreshed)f.hook=async(kind,id)=>{if(kind==='get'&&id===2)f.tabs.find(t=>t.id===2).lastAccessed=now-1;};
  await e.run();assert.deepEqual(f.removed,refreshed?[]:[2]);
 }
});

test('temporary closure rechecks title and access and journals the original URL',async()=>{
 for(const change of [{},{title:'Dashboard'},{lastAccessed:now-1}]){
  const url='https://a.test/status';const {f,e}=await setup([tab(1,url,{title:'503 Service Temporarily Unavailable',lastAccessed:now-86400000})]);
  await e.configure({...config,cleanTemporary:true,expire:false,deduplicate:false,sort:false});f.hook=async(kind,id)=>{if(kind==='get'&&id===1&&f.tabs[0])Object.assign(f.tabs[0],change);};await e.run();
  assert.deepEqual(f.removed,change.title?[]:[1]);if(!change.title){assert.equal(f.saved.records[0].reason,'error');assert.equal(f.saved.records[0].url,url);}
 }
});

test('instant executor rechecks sleeping and error state and journals fresh original URLs',async()=>{
 for(const kind of ['dormant','error','homepage','newtab'])for(const changed of [false,true]){
  const url=kind==='homepage'?'https://www.baidu.com/':kind==='newtab'?'chrome://newtab/':'https://a.test/work';
  const patch=kind==='dormant'?{discarded:true,state:undefined}:kind==='error'?{title:'503 Service Temporarily Unavailable'}:kind==='newtab'?{state:undefined}:{};
  const {f,e}=await setup([tab(1,url,{lastAccessed:now-1,...patch})]);await e.configure({...config,cleanTemporary:true,expire:false,deduplicate:false,sort:false});
  if(changed)f.hook=async(type)=>{if(type==='get'){if(kind==='dormant')f.tabs[0].discarded=false;else if(kind==='error')f.tabs[0].title='Recovered';else f.tabs[0].url='https://a.test/keep';}};
  await e.run();assert.deepEqual(f.removed,changed?[]:[1],kind);if(!changed){assert.equal(f.saved.records[0].reason,kind);assert.equal(f.saved.records[0].url,url);}
 }
});

test('Git executor retains original URL and cancels when the project keeper changes or vanishes',async()=>{
 const root='https://gitlab.example.com/team/repo';
 for(const change of ['none','other-project','gone']){
  const {f,e}=await setup([tab(1,root+'/branches',{lastAccessed:now-2}),tab(2,root+'/merge_requests/1',{lastAccessed:now-1})]);await e.configure({...config,consolidateHost:true,expire:false,sort:false});
  if(change!=='none')f.hook=async(kind,id)=>{if(kind==='get'&&id===2){if(change==='gone')f.tabs=f.tabs.filter(t=>t.id!==2);else f.tabs.find(t=>t.id===2).url='https://gitlab.example.com/team/other/merge_requests/1';}};
  await e.run();assert.deepEqual(f.removed,change==='none'?[1]:[]);if(change==='none'){assert.equal(f.saved.records[0].reason,'git-project');assert.equal(f.saved.records[0].url,root+'/branches');}
 }
});

test('Git executor cancels if the surviving project page becomes an error or sleeps',async()=>{
 for(const patch of [{title:'503 Service Temporarily Unavailable'},{discarded:true}]){
  const root='https://git.example.com/team/repo/-/';const {f,e}=await setup([tab(1,root+'branches',{lastAccessed:now-2}),tab(2,root+'issues/1',{lastAccessed:now-1})]);await e.configure({...config,cleanTemporary:true,expire:false,sort:false});let reads=0;
  f.hook=async(kind,id)=>{if(kind==='get'&&id===2&&++reads===2)Object.assign(f.tabs.find(t=>t.id===2),patch);};await e.run();assert.deepEqual(f.removed,[]);assert.ok(f.saved.records.every(r=>r.status!=='closed'));
 }
});

test('manual run bypasses automation pause idle and fresh interaction without enabling automation',async()=>{
 const {f,e}=await setup([tab(1,undefined,{stableSince:now})]);await e.configure({...config,enabled:false,sort:false});e.activity();let idleCalls=0;f.idle=async()=>{idleCalls++;return false;};
 const result=await e.run(false,'all','manual');assert.deepEqual(f.removed,[1]);assert.deepEqual(result.waiting,[]);assert.equal(idleCalls,0);assert.equal(e.snapshot().config.enabled,false);assert.equal(f.saved.config.enabled,false);
 f.tabs=[tab(2)];await e.run();assert.deepEqual(f.removed,[1]);
});
test('manual preview shows immediately eligible pages without effects or config changes',async()=>{
 const {f,e}=await setup([tab(1,undefined,{stableSince:now})]);await e.configure({...config,enabled:false,sort:false});e.activity();const result=await e.run(true,'all','manual');assert.equal(result.closures.length,1);assert.deepEqual(f.removed,[]);assert.deepEqual(f.moves,[]);assert.equal(e.snapshot().config.enabled,false);
});
test('manual run still rejects unverified 窗口 and all concrete page protections',async()=>{
 const patches=[{active:true},{pinned:true},{audible:true},{captured:true},{state:undefined},{state:{known:false}},{state:{known:true,dirty:true}},{state:{known:true,media:true}},{groupId:3},{splitId:2},{cooldownUntil:now+1},{status:'loading'}];
 for(const patch of patches){const {f,e}=await setup([tab(1,undefined,{stableSince:now,...patch})]);await e.configure({...config,enabled:false,sort:false});await e.run(false,'all','manual');assert.deepEqual(f.removed,[],JSON.stringify(patch));}
 const {f,e}=await setup([tab(1)]);await e.configure({...config,spaceMappingVerified:false});const p=await e.run(false,'all','manual');assert.deepEqual(f.removed,[]);assert.match(p.waiting.join(),/窗口.*验证/);assert.doesNotMatch(p.waiting.join(),/或交互/);
});
test('pause or interaction after a manual run starts still cancels it',async()=>{
 for(const interrupt of ['pause','activity']){const {f,e}=await setup([tab(1)]);await e.configure({...config,enabled:false,sort:false});let release,reached;const blocked=new Promise(r=>reached=r);f.hook=async kind=>{if(kind==='get'){f.hook=async()=>{};reached();await new Promise(r=>release=r);}};const running=e.run(false,'all','manual');await blocked;const stopped=interrupt==='pause'?e.pause():e.activity();release();await running;await stopped;assert.deepEqual(f.removed,[]);}
});
test('manual run does not bypass durable recovery uncertainty until explicit resume',async()=>{
 const f=fake([tab(1)]);f.saved.config.enabled=false;f.saved.restoreReviewRequired=true;const e=createEngine(f);await e.initialize();let p=await e.run(false,'all','manual');assert.deepEqual(f.removed,[]);assert.match(p.waiting.join(),/恢复.*确认/);await e.pause();const restarted=createEngine(f);await restarted.initialize();p=await restarted.run(false,'all','manual');assert.deepEqual(f.removed,[]);assert.match(p.waiting.join(),/恢复.*确认/);await restarted.configure({...config,sort:false});await restarted.run(false,'all','manual');assert.deepEqual(f.removed,[1]);assert.equal(restarted.snapshot().restoreReviewRequired,false);
});

test('manual request queued before pause is canceled before it starts',async()=>{
 const {f,e}=await setup([tab(1)]);let release,reached;const blocked=new Promise(r=>reached=r);f.hook=async kind=>{if(kind==='query'){f.hook=async()=>{};reached();await new Promise(r=>release=r);}};const busy=e.run(true);await blocked;const manual=e.run(false,'all','manual');const paused=e.pause();release();await Promise.all([busy,manual,paused]);assert.deepEqual(f.removed,[]);
});
test('manual recovery acknowledgment survives worker restart and new restore uncertainty blocks again',async()=>{
 const f=fake([tab(1)]);f.saved.config.enabled=false;f.saved.restoreReviewRequired=true;f.saved.records=[{id:'uncertain',batch:'old',tabId:99,url:'https://a.test/',title:'A',windowId:1,spaceId:'1',session:'session',index:0,time:now,reason:'expired',status:'closed',restoreAttemptAt:now-1000}];const e=createEngine(f);await e.initialize();await e.configure({...config,sort:false});const restarted=createEngine(f);await restarted.initialize();assert.equal(restarted.snapshot().restoreReviewRequired,false);await restarted.run(false,'all','manual');assert.deepEqual(f.removed,[1]);
 f.tabs=[tab(2)];f.failSave=f.writes+2;await assert.rejects(restarted.restore(['uncertain']),/待确认/);f.failSave=0;const again=createEngine(f);await again.initialize();assert.equal(again.snapshot().restoreReviewRequired,true);const result=await again.run(false,'all','manual');assert.match(result.waiting.join(),/恢复.*确认/);assert.deepEqual(f.removed,[1]);
});

test('manual cancellation during the first durable write is reported instead of successful completion',async()=>{
 const {f,e}=await setup([tab(1)]);await e.configure({...config,enabled:false,sort:false});let paused;f.hook=async kind=>{if(kind==='save'){f.hook=async()=>{};paused=e.pause();}};const p=await e.run(false,'all','manual');await paused;assert.deepEqual(f.removed,[]);assert.match(p.waiting.join(),/停止|取消/);
});
test('manual sorting also bypasses idle while preserving paused automation',async()=>{
 const {f,e}=await setup([tab(1,'https://z.test/'),tab(2,'https://a.test/')]);await e.configure({...config,enabled:false,deduplicate:false,expire:false,sort:true});f.idle=async()=>false;await e.run(false,'all','manual');assert.ok(f.moves.some(m=>m.ids[0]===2&&m.index===0));assert.deepEqual(f.removed,[]);assert.equal(e.snapshot().config.enabled,false);
});

test('manual removal verification and sorting failures report incomplete work',async()=>{
 for(const failure of ['remove','verification','move']){
  const {f,e}=await setup(failure==='move'?[tab(1,'https://z.test/'),tab(2,'https://a.test/')]:[tab(1)]);await e.configure({...config,enabled:false,sort:failure==='move',deduplicate:false,expire:failure!=='move'});if(failure==='remove')f.failRemove=true;else if(failure==='verification')f.remove=async()=>{};else f.move=async()=>{throw Error('busy');};const result=await e.run(false,'all','manual');assert.match(result.waiting.join(),/失败|仍存在/,failure);
 }
});

test('progress is observable during pending removal and counts only confirmed closes',async()=>{
 const {f,e}=await setup([tab(1,'https://a.test/a'),tab(2,'https://b.test/b')]);await e.configure({...config,enabled:false,deduplicate:false,sort:false});const frames=[];let release,reached;const started=new Promise(r=>reached=r),remove=f.remove;f.remove=async id=>{if(id===1){reached();await new Promise(r=>release=r);}await remove(id);};const run=e.run(false,'all','manual',undefined,p=>frames.push(p));await started;assert.ok(frames.some(p=>p.phase==='closing'&&p.total===2&&p.closed===0));release();const result=await run;assert.equal(result.progress.closed,2);assert.equal(result.progress.phase,'completed');assert.ok(frames.some(p=>p.phase==='closing'&&p.processed===1&&p.closed===1));assert.deepEqual(f.removed,[1,2]);
});
test('progress callbacks cannot change behavior and failure counts remain truthful',async()=>{
 const {f,e}=await setup([tab(1)]);f.failRemove=true;const frames=[];const p=await e.run(false,'all','manual',undefined,p=>{frames.push(p);p.closed=999;throw Error('observer');});assert.deepEqual(f.removed,[]);assert.equal(p.progress.closed,0);assert.equal(p.progress.failed,1);assert.equal(p.progress.phase,'failed');assert.ok(frames.length>1);
 const verified=await setup([tab(1)]);verified.f.remove=async()=>{};const v=await verified.e.run(false,'all','manual');assert.equal(v.progress.closed,0);assert.equal(v.progress.failed,1);
});
test('progress retains partial results when pause cancels remaining closures',async()=>{
 const {f,e}=await setup([tab(1,'https://a.test/a'),tab(2,'https://b.test/b')]);await e.configure({...config,deduplicate:false,sort:false});const remove=f.remove;let paused;f.remove=async id=>{await remove(id);paused=e.pause();};const p=await e.run(false,'all','manual');await paused;assert.equal(p.progress.phase,'stopped');assert.equal(p.progress.closed,1);assert.equal(p.progress.processed,1);assert.equal(p.progress.total,2);
});
test('sorting progress counts actual moves and preview never reports effects',async()=>{
 const {f,e}=await setup([tab(1,'https://z.test/'),tab(2,'https://a.test/')]);await e.configure({...config,enabled:false,deduplicate:false,expire:false});const preview=await e.run(true,'all','manual');assert.equal(preview.progress.closed,0);assert.equal(preview.progress.moved,0);const p=await e.run(false,'all','manual');assert.equal(p.progress.moved,f.moves.length);assert.ok(p.progress.moved>0);assert.equal(p.progress.processed,p.progress.total);
});

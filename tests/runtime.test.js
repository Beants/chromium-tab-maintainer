import test from 'node:test';import assert from 'node:assert/strict';
import {createRuntime} from '../extension/runtime.js';import {config,now} from './fixtures.js';
const event=()=>{const handlers=[];return {addListener:f=>handlers.push(f),fire:(...args)=>handlers.map(f=>f(...args)),handlers};};
export function chromeFake(){let state={config:{...config,enabled:false},records:[],meta:{},session:'s'};const tabs=[{id:1,windowId:1,index:0,url:'https://docs.example.com/a',title:'A',active:false,pinned:false,audible:false,groupId:-1,splitViewId:-1,lastAccessed:now-864000000}];const calls={alarms:[],inject:0,removed:[],access:[],moves:[]},alarms=new Map();const b={calls,tabRows:tabs,runtime:{id:'self',onStartup:event(),onInstalled:event(),onMessage:event()},storage:{local:{get:async()=>({state}),set:async v=>{state=structuredClone(v.state);},setAccessLevel:async v=>calls.access.push(v)},session:{get:async()=>({session:'s'}),set:async()=>{}}},permissions:{contains:async()=>true},tabs:{query:async()=>structuredClone(tabs),get:async id=>{const t=tabs.find(t=>t.id===id);if(!t)throw Error('missing');return structuredClone(t);},remove:async id=>{calls.removed.push(id);},move:async(ids,opts)=>{calls.moves.push({ids,opts});},create:async props=>({...tabs[0],id:50,...props}),onCreated:event(),onActivated:event(),onUpdated:event(),onRemoved:event(),onMoved:event(),onAttached:event(),onDetached:event()},windows:{get:async()=>({id:1})},tabCapture:{getCapturedTabs:async()=>[]},idle:{queryState:async()=>'idle'},scripting:{executeScript:async()=>{calls.inject++;}},alarms:{create:async(name,info)=>{alarms.set(name,info);calls.alarms.push({name,info});},get:async name=>alarms.get(name),onAlarm:event()}};return b;}
const flush=()=>new Promise(r=>setImmediate(r));
test('startup reconciles hourly closure alarm without resetting it on worker wake',async()=>{const b=chromeFake(),r=createRuntime(b,()=>now);await r.ready;assert.ok(b.calls.alarms.some(x=>x.name==='maintenance'&&x.info.periodInMinutes===60));assert.equal(b.calls.access[0].accessLevel,'TRUSTED_CONTEXTS');assert.equal(b.calls.inject,1);b.runtime.onStartup.fire();await flush();const restarted=createRuntime(b,()=>now);await restarted.ready;assert.equal(b.calls.alarms.filter(x=>x.name==='maintenance').length,1);});
test('activation refreshes access; updated only resets navigation stability',async()=>{const b=chromeFake(),r=createRuntime(b,()=>now);await r.ready;b.tabs.onActivated.fire({tabId:1,windowId:1});await flush();assert.equal(r.engine.snapshot().meta['1'].lastAccessed,now);b.tabs.onUpdated.fire(1,{status:'loading'},b.tabRows[0]);await flush();assert.equal(r.engine.snapshot().meta['1'].lastAccessed,now);assert.equal(r.engine.snapshot().meta['1'].stableSince,now);assert.ok(b.calls.alarms.some(a=>a.name==='settle'));});
test('state messages are strictly validated, top-frame and trusted; navigation clears state',async()=>{const b=chromeFake(),r=createRuntime(b,()=>now);await r.ready;const good={egoTabSafety:true,known:true,dirty:false,media:false,captured:false,checkedAt:now,activity:false};assert.equal(await r.message(good,{id:'evil',tab:b.tabRows[0],frameId:0}),undefined);await r.message(good,{id:'self',tab:b.tabRows[0],frameId:0});assert.equal(r.states.get(1).dirty,false);await r.message({...good,dirty:'no'},{id:'self',tab:b.tabRows[0],frameId:0});assert.equal(r.states.get(1).dirty,false);b.tabs.onUpdated.fire(1,{url:'https://new.test'},b.tabRows[0]);await flush();assert.equal(r.states.has(1),false);});
test('settings page messages preview, validate save, pause and recover; foreign pages cannot control',async()=>{const b=chromeFake(),r=createRuntime(b,()=>now);await r.ready;const sender={id:'self',url:'chrome-extension://self/options.html'};assert.equal((await r.message({command:'snapshot'},sender)).config.days,7);assert.ok((await r.message({command:'preview'},sender)).order.includes(1));await r.message({command:'save',config:{...config,days:8}},sender);assert.equal(r.engine.snapshot().config.days,8);await r.message({command:'pause'},sender);assert.equal(r.engine.snapshot().config.enabled,false);assert.deepEqual(await r.message({command:'restore',ids:[]},sender),{restored:0,fallback:0});await assert.rejects(r.message({command:'save',config:{}},sender));assert.equal(await r.message({command:'pause'},{id:'self',url:'https://bad.test'}),undefined);});
test('alarms handle permission errors without unhandled promises and missing content state prevents closure',async()=>{const b=chromeFake(),r=createRuntime(b,()=>now);await r.ready;await r.engine.configure(config);await r.engine.run();assert.equal(b.calls.removed.length,0);b.permissions.contains=async()=>false;b.alarms.onAlarm.fire({name:'maintenance'});await flush();assert.ok(r.errors.length>0);b.tabs.onRemoved.fire(1);b.tabs.onMoved.fire(1);b.tabs.onAttached.fire(1);b.tabs.onDetached.fire(1);b.runtime.onInstalled.fire();await flush();});
test('other extension capture inventory is not consulted as a global safety verdict',async()=>{const b=chromeFake();let captureCalls=0;b.tabCapture.getCapturedTabs=async()=>{captureCalls++;return [];};const r=createRuntime(b,()=>now);await r.ready;const sender={id:'self',tab:b.tabRows[0],frameId:0};await r.message({egoTabSafety:true,known:true,dirty:false,media:false,captured:false,checkedAt:now,activity:false},sender);const plan=await r.engine.run(true);assert.equal(captureCalls,0);assert.equal(plan.tabs[0].captured,false);b.tabRows[0].mutedInfo={reason:'capture'};const protectedPlan=await r.engine.run(true);assert.equal(protectedPlan.tabs[0].captured,true);});
test('actual tab-backed options page can snapshot, save, pause and restore while web tabs cannot',async()=>{
 const b=chromeFake(),r=createRuntime(b,()=>now);await r.ready;
 const sender={id:'self',url:'chrome-extension://self/options.html',frameId:0,tab:{id:77,url:'chrome-extension://self/options.html'}};
 assert.equal((await r.message({command:'snapshot'},sender)).config.days,7);
 await r.message({command:'save',config:{...config,days:9}},sender);
 assert.equal((await r.message({command:'snapshot'},sender)).config.days,9);
 await r.message({command:'pause'},sender);assert.equal(r.engine.snapshot().config.enabled,false);
 assert.deepEqual(await r.message({command:'restore',ids:[]},sender),{restored:0,fallback:0});
 assert.equal(await r.message({command:'snapshot'},{...sender,url:'https://evil.test'}),undefined);
});

function eventfulBrowser(rows){
 const b=chromeFake();b.tabRows.splice(0,b.tabRows.length,...rows.map((row,index)=>({...row,index})));let nextId=100;
 b.tabs.remove=async id=>{const index=b.tabRows.findIndex(t=>t.id===id);if(index<0)throw Error('missing');b.tabRows.splice(index,1);b.tabRows.forEach((t,i)=>t.index=i);b.calls.removed.push(id);b.tabs.onRemoved.fire(id,{windowId:1,isWindowClosing:false});};
 b.tabs.move=async(id,{windowId,index})=>{if(Array.isArray(id)){const t=b.tabRows.find(x=>x.id===id[0]);if(t)t.groupId=-1;}const tabId=Array.isArray(id)?id[0]:id;const from=b.tabRows.findIndex(t=>t.id===tabId);const [tab]=b.tabRows.splice(from,1);b.tabRows.splice(index,0,tab);b.tabRows.forEach((t,i)=>t.index=i);b.calls.moves.push({id:tabId,index});b.tabs.onMoved.fire(tabId,{windowId,fromIndex:from,toIndex:index});return tab;};
 b.tabs.create=async({url,windowId,index,active})=>{const row={...rows[0],id:nextId++,url:'',pendingUrl:url,windowId:windowId??1,index:index??b.tabRows.length,active:!!active};b.tabRows.splice(row.index,0,row);b.tabRows.forEach((t,i)=>t.index=i);b.tabs.onCreated.fire(row);return structuredClone(row);};
 return b;
}
const safety=(time,dirty=false)=>({egoTabSafety:true,known:true,dirty,media:false,captured:false,checkedAt:time,activity:false});
test('external pin transition during deferred final idle cancels removal',async()=>{
 let clock=now;const b=eventfulBrowser([{...chromeFake().tabRows[0],id:1,url:'https://docs.example.com/a'}]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});
 await r.message(safety(clock),{id:'self',tab:b.tabRows[0],frameId:0});await r.engine.run(true);clock+=60000;await r.message(safety(clock),{id:'self',tab:b.tabRows[0],frameId:0});
 let release,reached;const blocked=new Promise(resolve=>reached=resolve);let calls=0;b.idle.queryState=async()=>{calls++;if(calls===2){reached();await new Promise(resolve=>release=resolve);}return 'idle';};
 const running=r.engine.run();await blocked;b.tabRows[0].pinned=true;b.tabs.onUpdated.fire(1,{pinned:true},b.tabRows[0]);release();await running;assert.deepEqual(b.calls.removed,[]);assert.ok(r.engine.snapshot().records.every(record=>record.status!=='pending'));
});
test('unchanged dirty heartbeats do not starve an unrelated expired document',async()=>{
 let clock=now;const base=chromeFake().tabRows[0];const b=eventfulBrowser([{...base,id:1,url:'https://docs.example.com/a'},{...base,id:2,url:'https://docs.example.com/editor'}]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});
 await r.message(safety(clock),{id:'self',tab:b.tabRows.find(t=>t.id===1),frameId:0});await r.message(safety(clock,true),{id:'self',tab:b.tabRows.find(t=>t.id===2),frameId:0});await r.engine.run(true);
 for(let i=0;i<3;i++){clock+=30000;await r.message(safety(clock),{id:'self',tab:b.tabRows.find(t=>t.id===1),frameId:0});await r.message(safety(clock,true),{id:'self',tab:b.tabRows.find(t=>t.id===2),frameId:0});clock+=1000;await r.engine.run();}
 assert.deepEqual(b.calls.removed,[1]);assert.equal(b.tabRows.some(t=>t.id===2),true);
});
test('own remove events allow a multi-close batch, while an external activation still interrupts',async()=>{
 let clock=now;const base=chromeFake().tabRows[0];const b=eventfulBrowser([1,2,3].map(id=>({...base,id,url:`https://docs.example.com/a${id}`})));const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});
 for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run(true);clock+=60000;for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run();
 assert.deepEqual(b.calls.removed,[1,2,3]);assert.equal(b.tabRows.length,0);
});
test('own move events allow real multi-move ordering and never split a group',async()=>{
 const base=chromeFake().tabRows[0];const b=eventfulBrowser([{...base,id:1,url:'https://z.test/'},{...base,id:2,url:'https://y.test/'},{...base,id:3,url:'https://a.test/'}]);const r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,expire:false,deduplicate:false});await r.engine.run();
 assert.deepEqual(b.tabRows.map(t=>t.id),[3,2,1]);assert.ok(b.calls.moves.length>=2);assert.ok(b.calls.moves.every(m=>typeof m.id==='number'));
 b.tabRows[0].groupId=7;b.tabRows[1].groupId=7;const before=b.tabRows.map(t=>[t.id,t.groupId]);await r.engine.run();assert.deepEqual(b.tabRows.map(t=>[t.id,t.groupId]),before);
});
test('external activation interrupts a multi-close batch after the first own removal',async()=>{
 let clock=now;const base=chromeFake().tabRows[0];const b=eventfulBrowser([1,2,3].map(id=>({...base,id,url:`https://docs.example.com/a${id}`})));const originalRemove=b.tabs.remove;
 b.tabs.remove=async id=>{await originalRemove(id);if(id===1){b.tabRows.find(t=>t.id===2).active=true;b.tabs.onActivated.fire({tabId:2,windowId:1});}};
 const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run(true);clock+=60000;for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run();
 assert.deepEqual(b.calls.removed,[1]);assert.deepEqual(b.tabRows.map(t=>t.id),[2,3]);
});
test('external drag interrupts sorting after the first own move',async()=>{
 const base=chromeFake().tabRows[0];const b=eventfulBrowser([{...base,id:1,url:'https://z.test/'},{...base,id:2,url:'https://y.test/'},{...base,id:3,url:'https://a.test/'}]);const originalMove=b.tabs.move;
 b.tabs.move=async(id,opts)=>{const result=await originalMove(id,opts);if(b.calls.moves.length===1)b.tabs.onMoved.fire(2,{windowId:1,fromIndex:1,toIndex:0});return result;};
 const r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,expire:false,deduplicate:false});await r.engine.run();
 assert.equal(b.calls.moves.length,1);assert.deepEqual(b.tabRows.map(t=>t.id),[3,1,2]);
});
test('all windows are maintained independently without cross-window duplicate closure',async()=>{
 let clock=now;const base=chromeFake().tabRows[0];const b=eventfulBrowser([{...base,id:1,windowId:1,url:'https://docs.example.com/same'},{...base,id:2,windowId:2,url:'https://docs.example.com/same'}]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,expire:false,sort:false});for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run(true);clock+=60000;for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run();assert.deepEqual(b.calls.removed,[]);
 await r.engine.configure({...config,deduplicate:false,sort:false});await r.engine.run();assert.deepEqual(b.calls.removed,[1,2]);
});
test('settle alarm sorts only; hourly alarm may close a duplicate after safety and quiet checks',async()=>{
 let clock=now;const base=chromeFake().tabRows[0];const b=eventfulBrowser([{...base,id:1,url:'https://docs.example.com/a'},{...base,id:2,url:'https://docs.example.com/a'}]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,expire:false,sort:false});
 for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});await r.engine.run(true);clock+=60000;
 for(const row of b.tabRows)await r.message(safety(clock),{id:'self',tab:row,frameId:0});
 b.scripting.executeScript=async ({target})=>r.message(safety(clock),{id:'self',tab:b.tabRows.find(t=>t.id===target.tabId),frameId:0});
 b.alarms.onAlarm.fire({name:'settle'});await flush();assert.deepEqual(b.calls.removed,[]);
 b.alarms.onAlarm.fire({name:'maintenance'});await flush();assert.deepEqual(b.calls.removed,[2]);
});
test('created event records opening time before navigation and persistence, without fabricating it for existing tabs',async()=>{
 let clock=now;const b=eventfulBrowser([chromeFake().tabRows[0]]);const r=createRuntime(b,()=>clock);await r.ready;
 await r.engine.run(true);assert.equal(r.engine.snapshot().meta['1'].openedAt,undefined);
 clock+=1000;const newTab={...b.tabRows[0],id:7,url:'',pendingUrl:'https://docs.example.com/a',status:'loading'};b.tabRows.push(newTab);b.tabs.onCreated.fire(newTab);await flush();
 assert.equal(r.engine.snapshot().meta['7'].openedAt,clock);
 newTab.url='https://docs.example.com/a';b.tabs.onUpdated.fire(7,{url:newTab.url,status:'complete'},newTab);await flush();
 assert.equal(r.engine.snapshot().meta['7'].openedAt,clock);
});
test('restore-created event preserves pending navigation cooldown and fresh opening time',async()=>{
 let clock=now;const b=eventfulBrowser([chromeFake().tabRows[0]]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});
 await r.message(safety(clock),{id:'self',tab:b.tabRows[0],frameId:0});await r.engine.run(true);clock+=60000;await r.message(safety(clock),{id:'self',tab:b.tabRows[0],frameId:0});await r.engine.run();
 const id=r.engine.snapshot().records[0].id;await r.engine.restore([id]);await flush();
 assert.equal(r.engine.snapshot().meta['100'].openedAt,clock);assert.equal(r.engine.snapshot().meta['100'].cooldownUntil,clock+86400000);assert.equal(r.engine.snapshot().meta['100'].restorePending,true);
 b.tabs.onCreated.fire(b.tabRows[0]);await flush();assert.equal(r.engine.snapshot().meta['100'].cooldownUntil,clock+86400000);
});
test('cold worker waits for fresh already-installed safety report on the due hourly check',async()=>{
 let clock=now;const b=eventfulBrowser([chromeFake().tabRows[0]]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});await r.engine.run(true);clock+=60000;
 assert.equal(r.states.size,0);assert.equal(b.calls.alarms.filter(a=>a.name==='maintenance').length,1);
 let release,reached;const started=new Promise(resolve=>reached=resolve);let injections=0;
 b.scripting.executeScript=async()=>{injections++;reached();await new Promise(resolve=>release=resolve);await r.message(safety(clock),{id:'self',tab:b.tabRows[0],frameId:0});};
 b.alarms.onAlarm.fire({name:'maintenance'});await started;assert.deepEqual(b.calls.removed,[]);release();await flush();await flush();
 assert.equal(injections,1);assert.deepEqual(b.calls.removed,[1]);assert.equal(b.calls.alarms.filter(a=>a.name==='maintenance').length,1);
});
test('due check skips protected, unreachable, and paused pages without retrying closures',async()=>{
 let clock=now;const b=eventfulBrowser([chromeFake().tabRows[0]]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});await r.engine.run(true);clock+=60000;
 let injections=0;b.scripting.executeScript=async()=>{injections++;await r.message(safety(clock,true),{id:'self',tab:b.tabRows[0],frameId:0});};
 b.alarms.onAlarm.fire({name:'maintenance'});await flush();assert.deepEqual(b.calls.removed,[]);assert.equal(injections,1);
 b.scripting.executeScript=async()=>{injections++;throw Error('unreachable');};b.alarms.onAlarm.fire({name:'maintenance'});await flush();assert.deepEqual(b.calls.removed,[]);assert.equal(injections,2);
 await r.engine.pause();b.scripting.executeScript=async()=>{injections++;await r.message(safety(clock),{id:'self',tab:b.tabRows[0],frameId:0});};b.alarms.onAlarm.fire({name:'maintenance'});await flush();assert.deepEqual(b.calls.removed,[]);assert.equal(injections,3);
});

test('explicit unloaded status from Ego is preserved through the runtime adapter',async()=>{
 let clock=now;const b=eventfulBrowser([{...chromeFake().tabRows[0],url:'http://127.0.0.1:3080/',status:'unloaded'}]);
 const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});await r.engine.run(true);clock+=60000;
 await r.engine.run();assert.deepEqual(b.calls.removed,[1]);assert.equal(r.engine.snapshot().records[0].status,'closed');
});
test('hourly resampling preserves known dirty veto for explicit unloaded pages',async()=>{
 let clock=now;const b=eventfulBrowser([{...chromeFake().tabRows[0],status:'unloaded'}]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,sort:false});
 await r.message(safety(clock,true),{id:'self',tab:b.tabRows[0],frameId:0});await r.engine.run(true);clock+=60000;b.scripting.executeScript=async()=>{throw Error('unloaded has no document');};
 b.alarms.onAlarm.fire({name:'maintenance'});await flush();await flush();assert.deepEqual(b.calls.removed,[]);assert.equal(r.states.get(1).dirty,true);
});

test('hourly auto cleanup preserves discarded state and avoids waking sleeping tabs',async()=>{
 let clock=now;const base=chromeFake().tabRows[0],b=eventfulBrowser([{...base,discarded:true,status:'complete',lastAccessed:now-1000}]);const r=createRuntime(b,()=>clock);await r.ready;assert.equal(b.calls.inject,0);await r.engine.configure({...config,cleanTemporary:true,expire:false,deduplicate:false,sort:false});await r.engine.run(true);clock+=60000;
 b.scripting.executeScript=async()=>{throw Error('must not wake discarded tab');};b.alarms.onAlarm.fire({name:'maintenance'});await flush();await flush();assert.deepEqual(b.calls.removed,[1]);assert.equal(r.engine.snapshot().records[0].reason,'dormant');
});
test('hourly discarded resampling preserves an earlier known dirty veto',async()=>{
 let clock=now;const b=eventfulBrowser([{...chromeFake().tabRows[0],discarded:true}]);const r=createRuntime(b,()=>clock);await r.ready;await r.engine.configure({...config,cleanTemporary:true,expire:false,deduplicate:false,sort:false});await r.message(safety(clock,true),{id:'self',tab:b.tabRows[0],frameId:0});await r.engine.run(true);clock+=60000;
 b.scripting.executeScript=async()=>{throw Error('no document');};b.alarms.onAlarm.fire({name:'maintenance'});await flush();await flush();assert.deepEqual(b.calls.removed,[]);assert.equal(r.states.get(1).dirty,true);
});

test('trusted manual command refreshes safety and runs immediately while automation is paused',async()=>{
 const b=eventfulBrowser([{...chromeFake().tabRows[0],status:'complete'}]),r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,enabled:false,sort:false});await r.engine.navigate(1);r.engine.activity();let probes=0,idleCalls=0;b.idle.queryState=async()=>{idleCalls++;return 'active';};b.scripting.executeScript=async({target})=>{probes++;await r.message(safety(now),{id:'self',tab:b.tabRows.find(t=>t.id===target.tabId),frameId:0});};
 const result=await r.message({command:'run'},{id:'self',url:'chrome-extension://self/options.html',frameId:0});assert.deepEqual(b.calls.removed,[1]);assert.equal(probes,1);assert.equal(idleCalls,0);assert.deepEqual(result.waiting,[]);assert.equal(r.engine.snapshot().config.enabled,false);
});
test('foreign page cannot request manual bypass or trigger safety sampling',async()=>{
 const b=eventfulBrowser([chromeFake().tabRows[0]]),r=createRuntime(b,()=>now);await r.ready;const before=b.calls.inject;assert.equal(await r.message({command:'run'},{id:'self',url:'https://docs.example.com/a',tab:b.tabRows[0],frameId:0}),undefined);assert.equal(b.calls.inject,before);assert.deepEqual(b.calls.removed,[]);
});

test('pause during manual safety refresh cancels the original click',async()=>{
 const b=eventfulBrowser([chromeFake().tabRows[0]]),r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,sort:false});let release,reached;const started=new Promise(resolve=>reached=resolve);b.scripting.executeScript=async({target})=>{reached();await new Promise(resolve=>release=resolve);await r.message(safety(now),{id:'self',tab:b.tabRows.find(t=>t.id===target.tabId),frameId:0});};const manual=r.message({command:'run'},{id:'self',url:'chrome-extension://self/options.html',frameId:0});await started;const paused=r.engine.pause();release();await Promise.all([manual,paused]);assert.deepEqual(b.calls.removed,[]);
});

test('manual safety refresh protects newly dirty and unreachable live pages',async()=>{
 for(const dirty of [true,false]){const b=eventfulBrowser([chromeFake().tabRows[0]]),r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,enabled:false,sort:false});await r.message(safety(now),{id:'self',tab:b.tabRows[0],frameId:0});b.scripting.executeScript=async()=>{if(!dirty)throw Error('unreachable');await r.message(safety(now,true),{id:'self',tab:b.tabRows[0],frameId:0});};await r.message({command:'run'},{id:'self',url:'chrome-extension://self/options.html',frameId:0});assert.deepEqual(b.calls.removed,[]);}
});

test('failed manual probes retain known vetoes when live tabs become unloaded or discarded',async()=>{
 for(const change of [{status:'unloaded'},{discarded:true}])for(const veto of ['dirty','media','captured']){
  const b=eventfulBrowser([{...chromeFake().tabRows[0],status:'complete'}]),r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,enabled:false,sort:false});await r.message({...safety(now),[veto]:true},{id:'self',tab:b.tabRows[0],frameId:0});b.scripting.executeScript=async()=>{Object.assign(b.tabRows[0],change);throw Error('document became unavailable');};await r.message({command:'run'},{id:'self',url:'chrome-extension://self/options.html',frameId:0});assert.deepEqual(b.calls.removed,[],veto+JSON.stringify(change));assert.equal(r.states.get(1)?.[veto],true);
 }
});

test('manual progress reads bypass the blocked effects queue and reject duplicate jobs',async()=>{
 const b=eventfulBrowser([chromeFake().tabRows[0]]),r=createRuntime(b,()=>now);await r.ready;await r.engine.configure({...config,enabled:false,sort:false});const sender={id:'self',url:'chrome-extension://self/options.html',frameId:0};let release,reached;const started=new Promise(resolve=>reached=resolve);b.scripting.executeScript=async()=>{reached();await new Promise(resolve=>release=resolve);};const running=r.message({command:'run',requestId:'job-1'},sender);await started;const frame=await r.message({command:'progress',requestId:'job-1'},sender);assert.equal(frame.requestId,'job-1');assert.equal(frame.progress.phase,'checking');assert.equal(await r.message({command:'progress',requestId:'other'},sender),undefined);await assert.rejects(r.message({command:'run',requestId:'job-2'},sender),/正在|进行/);const paused=r.engine.pause();release();const result=await running;await paused;assert.equal(result.progress.phase,'stopped');const final=await r.message({command:'progress',requestId:'job-1'},sender);assert.equal(final.progress.phase,'stopped');assert.deepEqual(b.calls.removed,[]);
});

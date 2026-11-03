import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDraft,createOptionsController,historyRows,renderHistory,renderPreview,runStatus} from '../extension/options.js';
import {config} from './fixtures.js';

const draft={enabled:true,spaceMappingVerified:false,deduplicate:true,expire:true,sort:true,days:'7',aliases:JSON.stringify(config.aliases),projects:JSON.stringify(config.projects),whitelist:JSON.stringify(config.whitelist),readOnlyRules:JSON.stringify(config.readOnlyRules)};

test('invalid JSON and days reject atomically before save',async()=>{
 const calls=[];const controller=createOptionsController(async(command,payload)=>{calls.push({command,payload});return {};});
 await assert.rejects(controller.save({...draft,aliases:'{'}),/别名规则/);
 await assert.rejects(controller.save({...draft,days:'7.5'}),/天数/);
 assert.deepEqual(calls,[]);
 assert.equal(parseDraft(draft).days,7);
});

test('preview is read only, pause is immediate, and selected batch restores only selected records',async()=>{
 const calls=[];const request=async(command,payload)=>{calls.push({command,payload});return command==='snapshot'?{config,records:[]}:command==='preview'?{order:[1],closures:[],waiting:[]}:{};};
 const controller=createOptionsController(request);
 await controller.preview();await controller.pause();await controller.restore(['r1','r2']);
 assert.deepEqual(calls.map(c=>c.command),['preview','pause','restore']);
 assert.deepEqual(calls[2].payload,{ids:['r1','r2']});
});

test('history exposes uncertain pending records and filters restored entries',()=>{
 const rows=historyRows([{id:'a',batch:'b',status:'pending',url:'https://docs.example.com/a',reason:'duplicate'},{id:'c',batch:'b',status:'closed',url:'https://docs.example.com/b',reason:'expired',restoredAt:10}]);
 assert.deepEqual(rows.map(r=>r.id),['a']);assert.match(rows[0].statusText,/待确认/);
});

test('history and preview render untrusted URLs as text and restore a batch',async()=>{
 const makeNode=()=>({children:[],textContent:'',addEventListener(name,fn){this.click=fn;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
 const previous=globalThis.document;globalThis.document={createElement:()=>makeNode()};
 try{
  const history=makeNode(),restored=[];
  renderHistory(history,[{id:'a',batch:'b',status:'pending',url:'https://docs.example.com/<script>',title:'<b>unsafe</b>',time:1,reason:'duplicate'},{id:'c',batch:'b',status:'closed',url:'https://docs.example.com/b',title:'B',time:2,reason:'expired'}],async ids=>{restored.push(ids);});
  assert.equal(history.children[0].children[0].textContent,'B');
  assert.equal(history.children[1].children[0].textContent,'<b>unsafe</b>');
  history.children[2].click();assert.deepEqual(restored,[['a','c']]);
  const preview=makeNode();renderPreview(preview,{closures:[{id:1,reason:'duplicate'}],order:[1],waiting:['等待空闲'],tabs:[{id:1,title:'A',url:'https://docs.example.com/<script>'}]});
  assert.match(preview.children[0].textContent,/排序顺序：A/);
  assert.ok(preview.children.some(node=>node.textContent.includes('<script>')));
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('settings copy describes independent maintenance of every 窗口',()=>{
 const html=readFileSync(new URL('../extension/options.html',import.meta.url),'utf8');
 assert.match(html,/每个 窗口 独立维护/);
 assert.match(html,/不会跨 窗口 移动/);
});
test('interrupted restore remains visible as uncertain history',()=>{
 const rows=historyRows([{id:'a',batch:'b',status:'closed',url:'https://docs.example.com/a',reason:'expired',restoreAttemptAt:10}]);
 assert.deepEqual(rows.map(r=>r.id),['a']);assert.match(rows[0].statusText,/恢复结果待确认/);
});

test('hostname consolidation setting round-trips the explicit checkbox',()=>{
 assert.equal(parseDraft({...draft,consolidateHost:true}).consolidateHost,true);
 assert.equal(parseDraft({...draft,consolidateHost:false}).consolidateHost,false);
});

test('temporary cleanup switch is independently editable',()=>{
 assert.equal(parseDraft({...draft,cleanTemporary:true}).cleanTemporary,true);
 assert.equal(parseDraft({...draft,cleanTemporary:false}).cleanTemporary,false);
});

test('manual status surfaces blocking and browser failures instead of completion',()=>{
 for(const reason of ['部分页面关闭失败，请查看本机关闭记录','部分标签排序失败，请重试','窗口 隔离尚未验证','本次手动整理已取消']){const status=runStatus({waiting:[reason]});assert.equal(status,reason);assert.doesNotMatch(status,/已完成/);}
 assert.match(runStatus({waiting:[]}),/已完成/);
});

test('progress view uses stage counts and distinct terminal states without fabricated percentages',async()=>{
 const {progressView}=await import('../extension/options.js');assert.equal(typeof progressView,'function');const base={phase:'checking',processed:0,total:0,closed:0,moved:0,failed:0};assert.equal(progressView(base).indeterminate,true);
 const closing=progressView({...base,phase:'closing',processed:2,total:5,closed:2});assert.equal(closing.value,2);assert.equal(closing.max,5);assert.match(closing.detail,/关闭 2/);
 const zero=progressView({...base,phase:'completed'});assert.equal(zero.hideMeter,true);assert.equal(zero.indeterminate,false);assert.match(zero.detail,/关闭 0/);
 assert.match(progressView({...base,phase:'failed',failed:1}).label,/失败/);assert.match(progressView({...base,phase:'stopped'}).label,/停止/);assert.match(progressView({...base,phase:'completed'},true).label,/预览完成/);
});
test('progress tracking discards late frames after completion', {timeout:3000},async()=>{
 const {trackOperation}=await import('../extension/options.js');assert.equal(typeof trackOperation,'function');let finish,release,reached;const started=new Promise(r=>reached=r),frames=[];const done={phase:'completed',processed:1,total:1,closed:1,moved:0,failed:0};const controller={run:()=>new Promise(r=>finish=r),progress:async requestId=>{reached();return new Promise(r=>release=()=>r({requestId,progress:{...done,phase:'closing',closed:0}}));}};
 const action=trackOperation(controller,false,p=>frames.push(p));await started;finish({progress:done});await action;const count=frames.length;release();await new Promise(r=>setImmediate(r));assert.equal(frames.length,count);assert.equal(frames.at(-1).phase,'completed');
});
test('missing progress after a worker interruption never reports completion',{timeout:3000},async()=>{
 const {trackOperation}=await import('../extension/options.js');assert.equal(typeof trackOperation,'function');const frames=[];let reject;const controller={run:()=>new Promise((_,r)=>reject=r),progress:async()=>undefined};const action=trackOperation(controller,false,p=>{frames.push(p);if(p.phase==='interrupted')reject(Error('worker stopped'));});await assert.rejects(action,/worker/);assert.ok(frames.some(p=>p.phase==='interrupted'));assert.ok(!frames.some(p=>p.phase==='completed'));
});

test('fast request failure recovers confirmed partial counts from matching backend progress',async()=>{
 const {trackOperation}=await import('../extension/options.js');const frames=[];let reads=0;const terminal={phase:'failed',processed:1,total:2,closed:1,moved:0,failed:1};const controller={run:async()=>{throw Error('storage failed');},progress:async requestId=>{reads++;return {requestId,progress:terminal};}};await assert.rejects(trackOperation(controller,false,p=>frames.push(p)),/storage/);assert.equal(reads,1);assert.equal(frames.at(-1).closed,1);assert.equal(frames.at(-1).failed,1);
});
test('a failed frame followed by its rejected response does not double count failure',{timeout:3000},async()=>{
 const {trackOperation}=await import('../extension/options.js');const frames=[];let reject;const terminal={phase:'failed',processed:1,total:2,closed:1,moved:0,failed:1};const controller={run:()=>new Promise((_,r)=>reject=r),progress:async requestId=>({requestId,progress:terminal})};await assert.rejects(trackOperation(controller,false,p=>{frames.push(p);if(p.phase==='failed')reject(Error('storage failed'));}),/storage/);assert.equal(frames.at(-1).failed,1);assert.equal(frames.at(-1).closed,1);
});

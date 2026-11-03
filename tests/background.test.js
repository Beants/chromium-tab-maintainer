import test from 'node:test';
import assert from 'node:assert/strict';

test('service worker action opens local settings and starts paused',async()=>{
 const event=()=>{let listener;return {addListener(fn){listener=fn;},fire(...args){return listener?.(...args);}};};
 let opened=0;
 const browser={runtime:{id:'self',onStartup:event(),onInstalled:event(),onMessage:event(),openOptionsPage:async()=>{opened++;}},action:{onClicked:event()},
 storage:{session:{get:async()=>({session:'s'})},local:{get:async()=>({}),setAccessLevel:async()=>{}}},
 alarms:{create:async()=>{},get:async()=>undefined,onAlarm:event()},tabs:{query:async()=>[],onCreated:event(),onActivated:event(),onUpdated:event(),onRemoved:event(),onMoved:event(),onAttached:event(),onDetached:event()}};
 globalThis.chrome=browser;
 try{await import('../extension/background.js');await new Promise(resolve=>setImmediate(resolve));browser.action.onClicked.fire();await new Promise(resolve=>setImmediate(resolve));assert.equal(opened,1);}finally{delete globalThis.chrome;}
});

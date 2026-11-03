// Classic content script: only safety booleans/timestamps leave this isolated world.
(() => {
 /** @type {typeof globalThis & {__egoSafetyInstalled?:boolean,__egoSafetyReport?:()=>Promise<void>}} */ const root=globalThis;
 if(root.__egoSafetyInstalled)return root.__egoSafetyReport?.();root.__egoSafetyInstalled=true;
 let dirty=false;
 /** Sample without reading or transmitting document text; resolve after background receives the signal. @param {boolean} [activity] @returns {Promise<void>} */
 function report(activity=false) {
 let media=false,captured=false;
 for(const element of document.querySelectorAll('input,textarea,select,[contenteditable],video,audio')){
 if(element instanceof HTMLInputElement){if(element.type==='checkbox'||element.type==='radio')dirty ||= element.checked!==element.defaultChecked;else dirty ||= element.value!==element.defaultValue;}
 if(element instanceof HTMLTextAreaElement)dirty ||= element.value!==element.defaultValue;
 if(element instanceof HTMLSelectElement)dirty ||= [...element.options].some(o=>o.selected!==o.defaultSelected);
 if(element instanceof HTMLElement&&element.isContentEditable)dirty=true;
 if(element instanceof HTMLMediaElement){media ||= !element.paused&&!element.ended;captured ||= !!element.srcObject;}
 }
 return chrome.runtime.sendMessage({egoTabSafety:true,known:true,dirty,media,captured,checkedAt:Date.now(),activity}).then(()=>{},()=>{});
 }
 /** @param {Event} event @returns {void} */
 const edited=event=>{dirty=true;report(event.isTrusted);};
 document.addEventListener('input',edited,true);document.addEventListener('change',edited,true);
 for(const name of ['pointerdown','keydown'])document.addEventListener(name,event=>{if(event.isTrusted)report(true);},true);
 root.__egoSafetyReport=report;setInterval(report,30000);return report();
})();

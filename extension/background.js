import {createRuntime} from './runtime.js';

// The service worker owns the engine; browser startup reconciliation happens in createRuntime.
const runtime=createRuntime(chrome);
chrome.action.onClicked.addListener(()=>{void chrome.runtime.openOptionsPage().catch(error=>runtime.errors.push(String(error)));});

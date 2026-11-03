import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('new and navigated web tabs receive the safety probe automatically',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.content_scripts,[{matches:['http://*/*','https://*/*'],js:['page-state.js'],run_at:'document_idle',all_frames:false}]);
});
test('manifest does not request extension-local tabCapture as a global safety signal',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.permissions.includes('tabCapture'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {scanPublicFile} from '../scripts/check-public.mjs';

test('public-source guard rejects credentials, unknown hosts and browser exports',()=>{
 const token='gh'+'p_'+'x'.repeat(36),unknown=['https:','','private'+'.invalid','page'].join('/');
 assert.ok(scanPublicFile('source.js',token).includes('credential-shaped content'));
 assert.ok(scanPublicFile('source.js',unknown).includes('unapproved URL or embedded credentials'));
 assert.ok(scanPublicFile('history.csv','id,url').includes('private artifact type'));
 assert.ok(scanPublicFile('.env.local','KEY=value').includes('private artifact type'));
 const personal=['','Users','person','workspace'].join('/');assert.ok(scanPublicFile('source.js',personal).includes('personal absolute path'));
});
test('public-source guard permits public registries and fictional fixtures',()=>{
 for(const text of ['https://registry.npmjs.org/typescript','https://github.com/team/repo','https://git.example.com/team/repo','https://other.test/a','http://127.0.0.1:3080/'])assert.deepEqual(scanPublicFile('source.js',text),[]);
});

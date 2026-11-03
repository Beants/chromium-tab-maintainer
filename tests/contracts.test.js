import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('every exported interface and BrowserPort/Engine method has a documentation comment',()=>{
 const source=readFileSync(new URL('../extension/types.d.ts',import.meta.url),'utf8');
 assert.match(source,/\/\*\*[^]*?\*\/\s*export interface Config/);
 const declarations=[...source.matchAll(/export interface (\w+)\s*\{/g)];assert.ok(declarations.length>=10);
 for(const match of declarations){const before=source.slice(0,match.index).trimEnd();assert.ok(before.endsWith('*/'),`${match[1]} lacks a doc comment`);}
 for(const name of ['BrowserPort','Engine']){const body=source.match(new RegExp(`export interface ${name} \\{([^]*?)\\n\\}`))?.[1];assert.ok(body,`${name} must be multiline`);for(const line of body.split('\n'))if(/^\s+\w+\([^)]*\):/.test(line)){const prior=body.slice(0,body.indexOf(line)).trimEnd();assert.ok(prior.endsWith('*/'),`${name}.${line.trim().split('(')[0]} lacks a doc comment`);}}
});

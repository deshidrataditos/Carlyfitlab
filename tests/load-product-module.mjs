import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Run the real pure TypeScript modules without widening Node's extension resolver.
const cache=new Map();
export function loadProductModule(name){
 const normalized=name.replace(/^\.\//,'');
 if(!['catalog','product-options','dessert-pack','cart-state','availability-view'].includes(normalized))throw new Error(`Unexpected product dependency: ${name}`);
 if(cache.has(normalized))return cache.get(normalized);
 const exported={};
 cache.set(normalized,exported);
 const source=readFileSync(new URL(`../lib/${normalized}.ts`,import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(output,{exports:exported,Error,require:loadProductModule});
 return exported;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../app/pedido/page.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const orderId='12345678-1234-1234-1234-123456789abc';
test('only the database approval renders cart reconciliation; return URL parameters cannot approve it',async()=>{
 for(const status of ['approved','pending','rejected','refunded',undefined]){
  const exported={};const PaidCart=()=>null;let reads=0;
  const jsx=(type,props)=>({type,props});
  const dependencies={
   'react/jsx-runtime':{jsx,jsxs:jsx},
   './paid-cart':{default:PaidCart},
   '@/lib/catalog':{whatsapp:()=> 'https://wa.me/'},
   'cloudflare:workers':{env:{DB:{prepare:()=>({bind:id=>{
    assert.equal(id,orderId);return {first:async()=>{reads++;return status?{status}:null;}};
   }})}}},
  };
  runInNewContext(source,{exports:exported,require:name=>{assert.ok(name in dependencies);return dependencies[name];}});
  const page=await exported.default({searchParams:Promise.resolve({order:orderId,status:'approved',collection_status:'approved'})});
  const reconciliation=page.props.children[0];
  assert.equal(reads,1);
  assert.equal(reconciliation?.type===PaidCart,status==='approved');
  if(status==='approved')assert.equal(reconciliation.props.orderId,orderId);
 }
});

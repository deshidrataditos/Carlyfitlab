import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const userId='b8939179-3b60-4eba-a864-000000000001';
const input={body:'La rutina me ayudó a organizar mis entrenamientos.',rating:5};

function harness({user={id:userId},authError=null,configured=true,access=true,permissionError=null,insertError=null,suspendOnInsert=false}={}) {
  const rpcs=[];const inserts=[];let currentAccess=access;
  const session={client:{auth:{getUser:async()=>({data:{user},error:authError})},rpc:async(name,args)=>{
    rpcs.push({name,args});
    if(name==='list_public_testimonials')return {data:[{body:'Comentario público aprobado',rating:5}],error:null};
    assert.equal(name,'get_my_community_access');assert.equal(args,undefined);return {data:currentAccess,error:permissionError};
  },from:name=>{assert.equal(name,'testimonials');return {insert:row=>{inserts.push(row);if(suspendOnInsert)currentAccess=false;return {select:()=>({single:async()=>({data:{...row,id:'comment',status:'pending'},error:insertError})})};}};}},finish:response=>{response.headers.set('X-Session-Finished','true');return response;}};
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  const auth={memberSession:()=>configured?session:null,memberJson:json,memberFailure:error=>{const known=error instanceof load('lib/member-input').MemberInputError;return json({error:known?error.message:'Unavailable'},known?error.status:503);},unavailable:()=>json({error:'Unavailable'},503)};
  const cache=new Map();
  function load(path) {
    if(path.endsWith('supabase-server'))return auth;
    const name=path.replace(/^@\//,'').replace(/^\.\//,'lib/').replace(/\.ts$/,'');if(cache.has(name))return cache.get(name);
    const exports={};cache.set(name,exports);
    const source=ts.transpileModule(readFileSync(new URL(`../${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,require:load,Date,URL,Request,Response,TextDecoder,Uint8Array});return exports;
  }
  const route=load('app/api/testimonials/route');
  return {rpcs,inserts,setAccess:value=>{currentAccess=value;},get:()=>route.GET(new Request('https://carlyfitlab.com/api/testimonials')),post:(body=input,origin='https://carlyfitlab.com')=>route.POST(new Request('https://carlyfitlab.com/api/testimonials',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}))};
}

test('suspended member cannot submit comments but can still read public testimonials',async()=>{
  const h=harness({access:false});const denied=await h.post({...input,user_id:'attacker',status:'approved'});
  assert.equal(denied.status,403);assert.match((await denied.json()).error,/suspendida.*pedidos y materiales siguen disponibles/);
  assert.equal(denied.headers.get('Cache-Control'),'private, no-store');assert.equal(h.inserts.length,0);
  const publicResponse=await h.get();assert.equal(publicResponse.status,200);assert.match(await publicResponse.text(),/Comentario público aprobado/);
  h.setAccess(true);const allowed=await h.post({...input,user_id:'attacker',status:'approved'});assert.equal(allowed.status,201);
  assert.deepEqual(JSON.parse(JSON.stringify(h.inserts)),[{...input,user_id:userId}]);
  h.setAccess(false);assert.equal((await h.post()).status,403);assert.equal(h.inserts.length,1);
});

test('comment submission authenticates before checking own restriction and fails closed',async()=>{
  for(const [options,status] of [[{user:null},401],[{user:{id:userId,is_anonymous:true}},403],[{authError:{status:401}},401],[{authError:{status:500,message:'PRIVATE_AUTH_ERROR'}},503],[{configured:false},503]]) {
    const h=harness(options);const response=await h.post();assert.equal(response.status,status);assert.equal(h.rpcs.length,0);assert.equal(h.inserts.length,0);assert.doesNotMatch(await response.text(),/PRIVATE_AUTH_ERROR/);
  }
  for(const options of [{permissionError:{code:'42501',message:'PRIVATE_REASON'}},{access:null},{access:'true'},{access:[]},{access:{active:true}}]) {
    const h=harness(options);const response=await h.post();assert.equal(response.status,503);assert.equal(h.inserts.length,0);assert.doesNotMatch(await response.text(),/PRIVATE_REASON/);
  }
  const foreign=harness();assert.equal((await foreign.post(input,'https://attacker.invalid')).status,403);assert.equal(foreign.rpcs.length,0);
});

test('suspension between the access check and insert returns the account restriction notice',async()=>{
  const h=harness({insertError:{code:'42501',message:'PRIVATE_RLS_DETAIL'},suspendOnInsert:true});
  const response=await h.post();assert.equal(response.status,403);assert.match((await response.json()).error,/suspendida/);assert.equal(h.rpcs.length,2);
  const conflict=harness({insertError:{code:'23505'}});assert.equal((await conflict.post()).status,409);
  const otherFailure=harness({insertError:{code:'42501',message:'PRIVATE_RLS_DETAIL'}});assert.equal((await otherFailure.post()).status,503);
});

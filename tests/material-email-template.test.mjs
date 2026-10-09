import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function load(name) {
  const exports={};
  const source=ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,require:path=>load(path.replace('./',''))});return exports;
}
const {buildMaterialEmail}=load('material-email-template');
const orderId='a8939179-3b60-4eba-a864-d40960759974';
const account='https://carlyfitlab.com/?account=1#comunidad';

test('material notice names one published material and never promises the complete plan',()=>{
  const message=buildMaterialEmail(orderId,'Movilidad para comenzar');
  assert.equal(message.subject,'Tu material está listo');
  for(const body of [message.html,message.text]) {
    assert.ok(body.includes('Movilidad para comenzar'));assert.ok(body.includes(orderId));assert.ok(body.includes(account));
    assert.match(body,/Carly publicó un nuevo material/);assert.match(body,/misma cuenta de Google/);
    assert.match(body,/Este aviso corresponde al material indicado/);assert.match(body,/a medida que Carly los publique/);
    assert.match(body,/un aviso por cada material publicado/);
    assert.doesNotMatch(body,/tu plan está listo|plan completo|historia clínica|ficha inicial|forms\.google|docs\.google|supabase|token=|storage\/v1/i);
  }
});

test('material email escapes reference and title and contains only public account/contact links',()=>{
  const {html,text}=buildMaterialEmail(orderId,'Rutina <fuerza> & movilidad');
  assert.match(html,/Rutina &lt;fuerza&gt; &amp; movilidad/);assert.ok(text.includes('Rutina <fuerza> & movilidad'));
  assert.match(html,/<html lang="es">/);assert.match(html,/name="viewport"/);assert.match(html,/max-width:600px/);
  assert.doesNotMatch(html,/<(?:script|img|iframe|form|link)\b|\bon\w+=|url\(/i);
  const allowed=new Set([account,'https://carlyfitlab.com/','https://wa.me/5214433580280','https://carlyfitlab.com/privacidad','mailto:carlyfit.lab@gmail.com']);
  for(const [,link] of html.matchAll(/href="([^"]+)"/g))assert.ok(allowed.has(link),link);
  const escaped=buildMaterialEmail('<img src=x>','<script>alert(1)</script>');
  assert.doesNotMatch(escaped.html,/<img|<script/);assert.match(escaped.html,/&lt;script&gt;/);
  assert.ok(text.split(/\s+/).length<260);assert.deepEqual(buildMaterialEmail(orderId,'Rutina'),buildMaterialEmail(orderId,'Rutina'));
});

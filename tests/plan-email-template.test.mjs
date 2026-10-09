import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function load(path) {
  const exports={};
  const source=ts.transpileModule(readFileSync(new URL(`../lib/${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,require:relative=>load(relative.replace('./',''))});
  return exports;
}
const {buildPlanEmail}=load('plan-email-template');
const {PLAN_INTAKE_FORM_URL,PLAN_ACCESS_URL,CANONICAL_PLAN_IDS,hasCanonicalPlan}=load('plan-onboarding');
const orderId='a8939179-3b60-4eba-a864-d40960759974';

test('plan onboarding uses the supplied external form and existing authenticated account link',()=>{
  assert.equal(PLAN_INTAKE_FORM_URL,'https://docs.google.com/forms/d/e/1FAIpQLSe8R-2yU10L_5zJBHjDpXgMyGCO-_IliGGPNmdGFnoQyuIpuw/viewform');
  assert.equal(PLAN_ACCESS_URL,'https://carlyfitlab.com/?account=1#comunidad');
  const message=buildPlanEmail(orderId);
  for(const body of [message.html,message.text]) {
    assert.ok(body.includes(PLAN_INTAKE_FORM_URL));
    assert.ok(body.includes(PLAN_ACCESS_URL));
    assert.ok(body.includes(orderId),'full order reference must be copyable');
    assert.match(body,/90 días/);
    assert.match(body,/Completa tu ficha inicial/);
    assert.match(body,/Completar mi ficha inicial/);
    assert.match(body,/una vez por cada nuevo pedido/);
    assert.match(body,/Carly revisará tus respuestas personalmente/);
    assert.match(body,/Abrir el enlace no confirma/);
    assert.match(body,/misma cuenta de Google/);
    assert.match(body,/materiales cuando Carly los publique/);
    assert.match(body,/directamente a Google Forms/);
    assert.match(body,/No las compartas por correo ni con el asistente/);
    assert.doesNotMatch(body,/tu plan está listo|ficha inicial (?:recibida|completada)|historia clínica|resultados garantizados|bimestral/i);
  }
});

test('onboarding is image-free accessible email with only intended links and escaped references',()=>{
  const {html,text}=buildPlanEmail(orderId);
  assert.match(html,/<html lang="es">/);
  assert.match(html,/name="viewport"/);
  assert.match(html,/max-width:600px/);
  assert.match(html,/table role="presentation"/);
  assert.doesNotMatch(html,/<(?:img|script|iframe|form|link)\b|\bon\w+=|url\(/i);
  const allowed=new Set([PLAN_INTAKE_FORM_URL,PLAN_ACCESS_URL,'https://carlyfitlab.com/','https://wa.me/5214433580280','https://carlyfitlab.com/privacidad','mailto:carlyfit.lab@gmail.com']);
  for(const [,link] of html.matchAll(/href="([^"]+)"/g))assert.ok(allowed.has(link),link);
  assert.ok(text.split(/\s+/).length<400);
  const malicious=buildPlanEmail('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(malicious.html,/<img/);
  assert.match(malicious.html,/&lt;img/);
  assert.deepEqual(buildPlanEmail(orderId),buildPlanEmail(orderId));
});

test('canonical onboarding plans follow the active catalog and require a positive purchased quantity',()=>{
  assert.deepEqual(Array.from(CANONICAL_PLAN_IDS),['rutina-90','integral-90','dulce-90']);
  for(const id of CANONICAL_PLAN_IDS)assert.equal(hasCanonicalPlan([{id,quantity:1}]),true);
  for(const items of [null,{},[{id:'presencial-mensual',quantity:1}],[{id:'rutina-90',quantity:0}],[{id:'rutina-90',quantity:'1'}],[{id:'galletas',quantity:1}]])assert.equal(hasCanonicalPlan(items),false);
});

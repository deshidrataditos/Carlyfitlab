import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMemberOrigin, memberBody, profileInput, testimonialInput} from '../lib/member-input.ts';

test('member changes reject foreign and missing origins', () => {
  for (const origin of [null, 'https://otro-sitio.invalid', 'null']) {
    const headers = origin === null ? {} : {origin};
    assert.throws(() => checkMemberOrigin(new Request('https://carlyfit.test/api/account', {headers})), e => e.status === 403);
  }
  assert.doesNotThrow(() => checkMemberOrigin(new Request('https://carlyfit.test/api/account', {headers: {origin: 'https://carlyfit.test'}})));
});

test('profiles cannot accept injected identity, email, or role fields', () => {
  assert.deepEqual(profileInput({displayName: '  Carla  ', marketingOptIn: false, id:'other-user', email:'other@example.invalid', role:'admin'}), {display_name:'Carla', marketing_opt_in:false});
  for (const data of [{displayName:'C', marketingOptIn:false}, {displayName:'Carla', marketingOptIn:'true'}, {displayName:'Car\nla', marketingOptIn:true}]) assert.throws(() => profileInput(data));
});

test('testimonials ignore caller-supplied owner and moderation state', () => {
  const body = 'Mi experiencia de prueba con el entrenamiento.';
  assert.deepEqual(testimonialInput({body,rating:5,user_id:'other-user',status:'approved'}), {body,rating:5});
  for (const rating of [0,6,1.5,'5',null]) assert.throws(() => testimonialInput({body,rating}));
  for (const text of ['corto','x'.repeat(1501)]) assert.throws(() => testimonialInput({body:text,rating:5}));
});

test('JSON parsing rejects large, malformed, and non-object bodies', async () => {
  const make = body => new Request('https://carlyfit.test/api/account', {method:'POST',headers:{'Content-Type':'application/json'},body});
  for (const body of ['null','[]','broken']) await assert.rejects(memberBody(make(body)), e => e.status === 400);
  await assert.rejects(memberBody(make(JSON.stringify({body:'x'.repeat(8192)}))), e => e.status === 413);
  assert.deepEqual(await memberBody(make('{"rating":5}')), {rating:5});
});

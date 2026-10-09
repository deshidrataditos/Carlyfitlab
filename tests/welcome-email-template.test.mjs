import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWelcomeEmail} from '../lib/welcome-email-template.ts';

test('welcome is a transactional account notice, without automatic marketing enrollment or purchase promises', () => {
  const message = buildWelcomeEmail();
  assert.equal(message.subject, '¡Te damos la bienvenida a Carlyfit Lab!');
  for (const body of [message.html, message.text]) {
    assert.match(body, /Tu cuenta de Carlyfit Lab ya está creada/);
    assert.match(body, /con la sesión iniciada/);
    assert.match(body, /Después de comprar un plan y confirmar tu pago/);
    assert.match(body, /materiales que Carly te asigne/);
    assert.match(body, /revisa los comentarios antes de publicarlos/);
    assert.match(body, /asistente de la página/);
    assert.match(body, /una sola vez por la creación de tu cuenta/);
    assert.match(body, /no te suscribe a promociones/);
    assert.doesNotMatch(body, /descuento|compra ahora|\$\d|tu plan está listo|resultados garantizados/i);
  }
});

test('fixed links use intended destinations and working account entry instructions', () => {
  const {html, text} = buildWelcomeEmail();
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  const allowed = new Set(['https://carlyfitlab.com/', 'https://carlyfitlab.com/#comunidad', 'https://wa.me/5214433580280', 'https://carlyfitlab.com/privacidad', 'mailto:carlyfit.lab@gmail.com']);
  assert.ok(links.length >= 5);
  for (const link of links) assert.ok(allowed.has(link), `Unexpected destination ${link}`);
  for (const link of allowed) assert.ok(text.includes(link.replace(/^mailto:/, '')));
  for (const body of [html, text]) {
    assert.match(body, /pulsa «Mi cuenta»/);
    assert.match(body, /misma cuenta de Google/);
    assert.doesNotMatch(body, /account=open/);
  }
});

test('email remains readable without images, scripts, tracking or external styles', () => {
  const {html, text} = buildWelcomeEmail();
  assert.match(html, /<html lang="es">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /table role="presentation"/);
  assert.match(html, /<h1[^>]*>Qué gusto tenerte aquí\./);
  assert.doesNotMatch(html, /<(?:img|script|iframe|form|link)\b|\bon\w+=|url\(/i);
  assert.ok(text.split(/\s+/).length <= 280, 'Keep the welcome concise including labels and links');
  assert.deepEqual(buildWelcomeEmail(), buildWelcomeEmail(), 'The template must not include tracking identifiers or personalization');
});

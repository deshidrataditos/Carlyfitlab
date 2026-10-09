import {PLAN_ACCESS_URL, PLAN_INTAKE_FORM_URL} from './plan-onboarding';

/** Purchase instructions only; this template never reads clinical answers. */
export function buildPlanEmail(orderId: string): {subject: string; html: string; text: string} {
  const subject = 'Tu pago está confirmado: comencemos tu plan con Carly';
  const introduction = '¡Gracias por confiar en Carlyfit Lab! Confirmamos el pago de tu pedido. El siguiente paso para preparar tu plan de 90 días es completar tu ficha inicial.';
  const formInstructions = 'Completa el formulario una vez por cada nuevo pedido de un plan, aunque ya lo hayas llenado para una compra anterior. Usa el correo de la misma cuenta de Google con la que compraste e incluye esta referencia de pedido cuando se te solicite:';
  const review = 'Carly revisará tus respuestas personalmente antes de preparar tu plan. Abrir el enlace no confirma que hayas enviado el formulario; Carly confirmará su recepción después de revisarlo.';
  const access = 'En «Mi plan» podrás consultar el estado de tu pedido y los materiales cuando Carly los publique. Inicia sesión con la misma cuenta de Google que usaste al comprar.';
  const privacy = 'Tus respuestas se envían directamente a Google Forms para la revisión de Carly. No las compartas por correo ni con el asistente de la página.';
  const help = 'Si necesitas ayuda, responde a este correo o escribe a Carly por WhatsApp.';
  const notice = 'Este correo se envía una sola vez por pedido con pago aprobado. No te suscribe a promociones.';
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const button = (url: string, label: string) => `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;"><tr><td align="center" bgcolor="#155d69" style="background-color:#155d69;border-radius:6px;mso-padding-alt:15px 24px;"><a href="${escape(url)}" style="display:inline-block;padding:15px 24px;border:1px solid #155d69;border-radius:6px;color:#fff;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;">${escape(label)}</a></td></tr></table>`;
  const paragraph = (text: string) => `<p style="margin:0 0 18px;font-size:15px;line-height:24px;">${escape(text)}</p>`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f1eee7;color:#153f44;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Tu pago está confirmado. Completa tu ficha inicial para que Carly prepare tu plan.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f1eee7;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffaf1;border:1px solid #dfded2;">
<tr><td style="padding:28px;border-bottom:1px solid #dfded2;"><a href="https://carlyfitlab.com/" style="text-decoration:none;color:#153f44;"><span style="font-size:30px;font-weight:700;letter-spacing:-1px;">carlyfit</span> <span style="font-size:12px;font-weight:700;letter-spacing:3px;color:#bb542b;">LAB</span></a><p style="margin:7px 0 0;font-size:10px;line-height:16px;letter-spacing:2px;">FORMULANDO TU MEJOR VERSIÓN</p></td></tr>
<tr><td style="padding:24px 28px;background-color:#ffe59a;"><p style="margin:0 0 10px;font-size:11px;font-weight:700;line-height:18px;letter-spacing:2px;">PAGO CONFIRMADO</p><h1 style="margin:0;font-size:30px;line-height:36px;letter-spacing:-1px;">Comencemos tu plan.</h1></td></tr>
<tr><td style="padding:28px 28px 8px;">${paragraph('Hola,')}${paragraph(introduction)}<h2 style="font-size:20px;line-height:28px;margin:24px 0 12px;">1. Completa tu ficha inicial</h2>${paragraph(formInstructions)}<p style="margin:0 0 18px;padding:14px;background-color:#f1eee7;font-size:14px;line-height:22px;word-break:break-all;overflow-wrap:anywhere;"><strong>Referencia de pedido</strong><br>${escape(orderId)}</p>${button(PLAN_INTAKE_FORM_URL, 'Completar mi ficha inicial')}${paragraph(review)}<h2 style="font-size:20px;line-height:28px;margin:24px 0 12px;">2. Entra a Mi plan</h2>${paragraph(access)}${button(PLAN_ACCESS_URL, 'Entrar a Mi plan')}${paragraph(privacy)}${paragraph(help)}<p style="margin:0 0 22px;font-size:16px;line-height:24px;">Con cariño,<br><strong>Carly y el equipo de Carlyfit Lab</strong></p></td></tr>
<tr><td style="padding:22px 28px 26px;border-top:1px solid #dfded2;font-size:12px;line-height:20px;color:#53686a;"><p style="margin:0 0 12px;"><a href="https://wa.me/5214433580280" style="color:#155d69;">Hablar con Carly</a> · <a href="https://carlyfitlab.com/privacidad" style="color:#155d69;">Privacidad</a></p><p style="margin:0 0 10px;">${escape(notice)}</p><p style="margin:0;">Carlyfit Lab · La Barca, Jalisco<br><a href="mailto:carlyfit.lab@gmail.com" style="color:#155d69;">carlyfit.lab@gmail.com</a></p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [subject, 'Hola,', introduction, '1. Completa tu ficha inicial', formInstructions,
    `Referencia de pedido: ${orderId}`, `Completar mi ficha inicial: ${PLAN_INTAKE_FORM_URL}`, review,
    '2. Entra a Mi plan', access, `Entrar a Mi plan: ${PLAN_ACCESS_URL}`, privacy, help,
    'Con cariño,\nCarly y el equipo de Carlyfit Lab',
    'Hablar con Carly: https://wa.me/5214433580280\nPrivacidad: https://carlyfitlab.com/privacidad', notice,
    'Carlyfit Lab · La Barca, Jalisco\ncarlyfit.lab@gmail.com\nhttps://carlyfitlab.com/',
  ].join('\n\n');
  return {subject, html, text};
}

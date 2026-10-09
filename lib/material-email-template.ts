import {PLAN_ACCESS_URL} from './plan-onboarding';

/** A single published material notice. Never include a private file URL or clinical answers. */
export function buildMaterialEmail(orderId: string, materialTitle: string): {subject: string; html: string; text: string} {
  const subject = 'Tu material está listo';
  const introduction = '¡Hola! Carly publicó un nuevo material de tu pedido en Carlyfit Lab. Ya puedes consultarlo desde «Mi plan».';
  const access = 'Entra con la misma cuenta de Google que usaste al comprar. En «Mi plan», busca tu pedido y abre el material para verlo o descargarlo.';
  const scope = 'Este aviso corresponde al material indicado. Podrás consultar los demás materiales de tu plan a medida que Carly los publique.';
  const help = 'Si necesitas ayuda para encontrarlo, responde a este correo o escribe a Carly por WhatsApp.';
  const notice = 'Recibes un aviso por cada material publicado. Este correo no te suscribe a promociones.';
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const paragraph = (value: string) => `<p style="margin:0 0 18px;font-size:15px;line-height:24px;">${escape(value)}</p>`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#f1eee7;color:#153f44;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Carly publicó un material de tu pedido. Consúltalo en Mi plan.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f1eee7;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffaf1;border:1px solid #dfded2;">
<tr><td style="padding:28px;border-bottom:1px solid #dfded2;"><a href="https://carlyfitlab.com/" style="text-decoration:none;color:#153f44;"><span style="font-size:30px;font-weight:700;letter-spacing:-1px;">carlyfit</span> <span style="font-size:12px;font-weight:700;letter-spacing:3px;color:#bb542b;">LAB</span></a><p style="margin:7px 0 0;font-size:10px;line-height:16px;letter-spacing:2px;">FORMULANDO TU MEJOR VERSIÓN</p></td></tr>
<tr><td style="padding:24px 28px;background-color:#ffe59a;"><p style="margin:0 0 10px;font-size:11px;font-weight:700;line-height:18px;letter-spacing:2px;">NUEVO MATERIAL</p><h1 style="margin:0;font-size:30px;line-height:36px;letter-spacing:-1px;">${subject}</h1></td></tr>
<tr><td style="padding:28px 28px 8px;">${paragraph(introduction)}<p style="margin:0 0 18px;padding:16px;background-color:#f1eee7;font-size:15px;line-height:24px;word-break:break-word;overflow-wrap:anywhere;"><strong>Material</strong><br>${escape(materialTitle)}<br><br><strong>Referencia de pedido</strong><br>${escape(orderId)}</p>${paragraph(access)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;"><tr><td align="center" bgcolor="#155d69" style="background-color:#155d69;border-radius:6px;mso-padding-alt:15px 24px;"><a href="${PLAN_ACCESS_URL}" style="display:inline-block;padding:15px 24px;border:1px solid #155d69;border-radius:6px;color:#fff;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;">Entrar a Mi plan</a></td></tr></table>
${paragraph(scope)}${paragraph(help)}<p style="margin:0 0 22px;font-size:16px;line-height:24px;">Con cariño,<br><strong>Carly y el equipo de Carlyfit Lab</strong></p></td></tr>
<tr><td style="padding:22px 28px 26px;border-top:1px solid #dfded2;font-size:12px;line-height:20px;color:#53686a;"><p style="margin:0 0 12px;"><a href="https://wa.me/5214433580280" style="color:#155d69;">Hablar con Carly</a> · <a href="https://carlyfitlab.com/privacidad" style="color:#155d69;">Privacidad</a></p><p style="margin:0 0 10px;">${notice}</p><p style="margin:0;">Carlyfit Lab · La Barca, Jalisco<br><a href="mailto:carlyfit.lab@gmail.com" style="color:#155d69;">carlyfit.lab@gmail.com</a></p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [subject, introduction, `Material: ${materialTitle}`, `Referencia de pedido: ${orderId}`, access,
    `Entrar a Mi plan: ${PLAN_ACCESS_URL}`, scope, help, 'Con cariño,\nCarly y el equipo de Carlyfit Lab',
    'Hablar con Carly: https://wa.me/5214433580280\nPrivacidad: https://carlyfitlab.com/privacidad', notice,
    'Carlyfit Lab · La Barca, Jalisco\ncarlyfit.lab@gmail.com\nhttps://carlyfitlab.com/',
  ].join('\n\n');
  return {subject, html, text};
}

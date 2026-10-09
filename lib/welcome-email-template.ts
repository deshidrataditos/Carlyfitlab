/** Transactional account welcome. No recipient data, tracking, or promotional opt-in. */
export function buildWelcomeEmail(): {subject: string; html: string; text: string} {
  const subject = '¡Te damos la bienvenida a Carlyfit Lab!';
  const accountUrl = 'https://carlyfitlab.com/#comunidad';
  const siteUrl = 'https://carlyfitlab.com/';
  const whatsappUrl = 'https://wa.me/5214433580280';
  const privacyUrl = 'https://carlyfitlab.com/privacidad';
  const introduction = 'Tu cuenta de Carlyfit Lab ya está creada. Gracias por hacer espacio para tus metas y por permitirnos acompañarte. Aquí tienes un lugar para organizar tu experiencia, a tu ritmo.';
  const features = [
    ['Tus pedidos, a la mano', 'Consulta los pedidos que realices con la sesión iniciada. Después de comprar un plan y confirmar tu pago, encontrarás en tu cuenta los materiales que Carly te asigne.'],
    ['Tu experiencia cuenta', 'Comparte cómo ha sido tu proceso. Carly revisa los comentarios antes de publicarlos para cuidar este espacio de la comunidad.'],
    ['Una ayuda para orientarte', 'Usa el asistente de la página para consultar información sobre productos, planes y entregas. Para atención personal, puedes hablar directamente con Carly.'],
  ];
  const instructions = 'Al abrir la página, pulsa «Mi cuenta» e inicia sesión con la misma cuenta de Google que usaste al registrarte.';
  const help = '¿Necesitas ayuda para encontrar algo? Responde a este correo o escríbenos por WhatsApp. Será un gusto ayudarte.';
  const notice = 'Recibes este correo una sola vez por la creación de tu cuenta. Esta bienvenida no te suscribe a promociones.';
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const featureRows = features.map(([title, body], index) => `<tr><td valign="top" width="36" style="padding:0 12px 20px 0;color:#bb542b;font-size:15px;font-weight:700;line-height:24px;">0${index + 1}</td><td style="padding:0 0 20px;color:#23474b;font-size:15px;line-height:24px;"><strong style="color:#153f44;">${escape(title)}</strong><br>${escape(body)}</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f1eee7;color:#153f44;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Tu cuenta está lista. Conoce tu espacio en Carlyfit Lab.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f1eee7;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffaf1;border:1px solid #dfded2;">
<tr><td style="padding:28px 28px 24px;border-bottom:1px solid #dfded2;"><a href="${siteUrl}" style="text-decoration:none;color:#153f44;"><span style="font-size:30px;line-height:34px;font-weight:700;letter-spacing:-1px;">carlyfit</span> <span style="font-size:12px;line-height:20px;font-weight:700;letter-spacing:3px;color:#bb542b;">LAB</span></a><p style="margin:7px 0 0;font-size:10px;line-height:16px;letter-spacing:2px;">ENTRENA · NUTRE · DISFRUTA</p></td></tr>
<tr><td style="padding:24px 28px;background-color:#ffe59a;"><p style="margin:0 0 10px;font-size:11px;font-weight:700;line-height:18px;letter-spacing:2px;">TU ESPACIO EN CARLYFIT</p><h1 style="margin:0;font-size:30px;line-height:36px;letter-spacing:-1px;font-weight:700;">Qué gusto tenerte aquí.</h1></td></tr>
<tr><td style="padding:28px 28px 8px;"><p style="margin:0 0 12px;font-size:16px;line-height:26px;">Hola,</p><p style="margin:0 0 24px;font-size:16px;line-height:26px;">${escape(introduction)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${featureRows}</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 16px;"><tr><td align="center" bgcolor="#155d69" style="background-color:#155d69;border-radius:6px;mso-padding-alt:15px 24px;"><a href="${accountUrl}" style="display:inline-block;padding:15px 24px;border:1px solid #155d69;border-radius:6px;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;color:#ffffff;">Entrar a mi cuenta</a></td></tr></table>
<p style="margin:0 0 24px;font-size:13px;line-height:21px;color:#53686a;">${escape(instructions)}</p><p style="margin:0 0 18px;font-size:15px;line-height:24px;">${escape(help)}</p><p style="margin:0 0 22px;font-size:16px;line-height:24px;">Con cariño,<br><strong>Carly y el equipo de Carlyfit Lab</strong></p></td></tr>
<tr><td style="padding:22px 28px 26px;border-top:1px solid #dfded2;font-size:12px;line-height:20px;color:#53686a;"><p style="margin:0 0 12px;"><a href="${whatsappUrl}" style="color:#155d69;text-decoration:underline;">Hablar con Carly</a> · <a href="${privacyUrl}" style="color:#155d69;text-decoration:underline;">Privacidad</a></p><p style="margin:0 0 10px;">${escape(notice)}</p><p style="margin:0;">Carlyfit Lab · La Barca, Jalisco<br><a href="mailto:carlyfit.lab@gmail.com" style="color:#155d69;text-decoration:underline;">carlyfit.lab@gmail.com</a><br><a href="${siteUrl}" style="color:#155d69;text-decoration:underline;">carlyfitlab.com</a></p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [
    subject,
    'Hola,',
    introduction,
    ...features.map(([title, body]) => `${title}\n${body}`),
    `Entrar a mi cuenta: ${accountUrl}\n${instructions}`,
    help,
    'Con cariño,\nCarly y el equipo de Carlyfit Lab',
    `Hablar con Carly: ${whatsappUrl}\nPrivacidad: ${privacyUrl}`,
    notice,
    `Carlyfit Lab · La Barca, Jalisco\ncarlyfit.lab@gmail.com\n${siteUrl}`,
  ].join('\n\n');
  return {subject, html, text};
}

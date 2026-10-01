const alternateHosts = new Set([
  'www.carlyfitlab.com',
  'carlyfit-lab.carlyfitlab.workers.dev',
]);

export function proxy(request: Request) {
  const destination = new URL(request.url);
  if (!alternateHosts.has(destination.hostname)) return;

  destination.protocol = 'https:';
  destination.hostname = 'carlyfitlab.com';
  destination.port = '';
  return Response.redirect(destination.href, 308);
}

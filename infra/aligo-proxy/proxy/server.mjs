import http from 'node:http';

const HOST = process.env.PROXY_LISTEN_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PROXY_LISTEN_PORT ?? '8080');
const SECRET = process.env.PROXY_SHARED_SECRET;
const ALIGO_BASE = 'https://apis.aligo.in';

if (!SECRET) {
  console.error('PROXY_SHARED_SECRET missing — refusing to start');
  process.exit(1);
}

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { 'content-type': contentType });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return send(res, 200, 'ok', 'text/plain');
  }

  if (req.headers.authorization !== `Bearer ${SECRET}`) {
    return send(res, 401, { error: 'unauthorized' });
  }

  if (!req.url || !req.url.startsWith('/aligo/')) {
    return send(res, 404, { error: 'not_found' });
  }

  const upstreamPath = req.url.slice('/aligo'.length);
  const upstreamUrl = `${ALIGO_BASE}${upstreamPath}`;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        'content-type':
          req.headers['content-type'] ?? 'application/x-www-form-urlencoded',
        'user-agent': 'aligo-proxy/1.0',
      },
      body: req.method === 'GET' ? undefined : body,
    });
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    });
    res.end(upstreamBody);
  } catch (err) {
    console.error('upstream_failed', err);
    return send(res, 502, { error: 'upstream_failed' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`aligo-proxy listening on ${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`received ${sig}, closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

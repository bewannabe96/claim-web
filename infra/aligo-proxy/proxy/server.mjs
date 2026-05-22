import http from 'node:http';

const HOST = process.env.PROXY_LISTEN_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PROXY_LISTEN_PORT ?? '8080');
const SECRET = process.env.PROXY_SHARED_SECRET;

// 알리고는 SMS/LMS 와 카카오(알림톡 발송 + 템플릿 조회)가 호스트도 prefix 도 다름.
//   SMS/LMS        : https://apis.aligo.in/<endpoint>
//   알림톡 / 템플릿 : https://kakaoapi.aligo.in/akv10/<endpoint>
// 클라이언트 (src/server/aligo.ts) 는 양쪽 모두 `/aligo/...` prefix 로 보내고,
// 프록시가 path 로 분기해서 올바른 upstream 호스트/경로로 매핑한다.
const ALIGO_SMS_BASE = 'https://apis.aligo.in';
const ALIGO_KAKAO_BASE = 'https://kakaoapi.aligo.in';
const ALIGO_PREFIX = '/aligo/';
// `/aligo/` 다음 경로가 이 prefix 로 시작하면 kakaoapi.aligo.in/akv10/ 로 라우팅.
//   alimtalk/send/ → 알림톡 발송,  template/list/ → 검수 템플릿 조회
const KAKAO_SUBPATHS = ['alimtalk/', 'template/'];

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

  if (!req.url || !req.url.startsWith(ALIGO_PREFIX)) {
    return send(res, 404, { error: 'not_found' });
  }

  // 카카오 (kakaoapi): /aligo/alimtalk/send/ → /akv10/alimtalk/send/
  //                    /aligo/template/list/ → /akv10/template/list/
  // SMS/LMS  (apis)  : /aligo/send/          → /send/
  const tail = req.url.slice(ALIGO_PREFIX.length);
  const upstreamUrl = KAKAO_SUBPATHS.some((p) => tail.startsWith(p))
    ? `${ALIGO_KAKAO_BASE}/akv10/${tail}`
    : `${ALIGO_SMS_BASE}/${tail}`;

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

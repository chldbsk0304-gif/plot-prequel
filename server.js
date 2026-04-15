'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── .env 파싱 (외부 라이브러리 없음) ──────────────────
function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return {};
  return Object.fromEntries(
    fs.readFileSync(envFile, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        return [key, val];
      })
  );
}

const env     = loadEnv();
const API_KEY = env.ANTHROPIC_API_KEY || '';
const PORT    = parseInt(env.PORT || '3000', 10);

// ── 시작 시 키 확인 ────────────────────────────────────
if (!API_KEY || API_KEY === '여기에_키_입력') {
  console.error('\n⚠️  .env 파일에 ANTHROPIC_API_KEY를 설정해주세요.\n');
  console.error('   echo "ANTHROPIC_API_KEY=sk-ant-..." > .env\n');
  process.exit(1);
}

// ── 서버 ──────────────────────────────────────────────
const server = http.createServer((req, res) => {

  // ① index.html 서빙
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ② Anthropic API 프록시
  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {

      // 요청 본문 검증
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: '잘못된 요청 형식이에요.' } }));
        return;
      }

      const upstream = https.request(
        {
          hostname: 'api.anthropic.com',
          path:     '/v1/messages',
          method:   'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         API_KEY,
            'anthropic-version': '2023-06-01',
          },
        },
        upRes => {
          res.writeHead(upRes.statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          upRes.pipe(res);
        }
      );

      upstream.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: `업스트림 오류: ${err.message}` } }));
      });

      upstream.write(body);
      upstream.end();
    });
    return;
  }

  // ③ 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅  Plot Prequel 캡션 생성기`);
  console.log(`    http://localhost:${PORT}\n`);

  // macOS에서 브라우저 자동 오픈
  try {
    require('child_process').exec(`open http://localhost:${PORT}`);
  } catch (_) {}
});

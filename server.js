// AI Map server — serves ./public and the JSON API:
//   /api/quotes?symbols=…      delayed stock quotes (Yahoo Finance)
//   /api/news?id=…&lang=ko|en  per-company news (Google News RSS)
//   /api/briefing              AI briefing: today's stories grouped and summarized by Claude
//   /api/board                 comparison board: 1y series, returns, market cap for listed companies
//   /api/watch[/…]             data watch (admin, this machine only): review and apply data changes
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// Settings such as PORT and BRIEFING_TTL_MINUTES can live in .env (loadEnvFile: Node 20.12+).
// The briefing reads ANTHROPIC_API_KEY from .env itself — see lib/briefing.js.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // no .env — use the real environment
}

const { getQuotes } = require('./lib/quotes');
const { fetchNews } = require('./lib/news');
const { getCompanies } = require('./lib/companies');
const { getBriefing } = require('./lib/briefing');
const { getBoard } = require('./lib/board');
const watch = require('./lib/watch');

const PORT = Number(process.env.PORT) || 5173;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJSON(res, status, payload) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function handleQuotes(reqUrl, res) {
  const quotes = await getQuotes((reqUrl.searchParams.get('symbols') || '').split(','));
  sendJSON(res, 200, { quotes, fetchedAt: Date.now() });
}

async function handleNews(reqUrl, res) {
  const lang = reqUrl.searchParams.get('lang') === 'en' ? 'en' : 'ko';
  const company = getCompanies().byId.get(reqUrl.searchParams.get('id') || '');
  if (!company) return sendJSON(res, 404, { error: 'unknown company' });
  try {
    sendJSON(res, 200, await fetchNews(company, lang));
  } catch (err) {
    console.warn(`[news] ${company.id}/${lang}: ${err.message}`);
    sendJSON(res, 502, { error: err.message });
  }
}

// ───────── Data watch (admin) ─────────
// These endpoints change the data every visitor sees, so they only answer requests from this
// machine, and writes must be same-origin JSON: a cross-site form or fetch from another tab
// can't send that without a CORS preflight, which this server never grants.
function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function adminRejection(req, { write }) {
  if (!isLoopback(req.socket.remoteAddress)) return '이 컴퓨터에서만 쓸 수 있어요.';
  if (!write) return null;
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      // unparsable origin → rejected below
    }
    if (host !== req.headers.host) return '다른 사이트에서 온 요청은 받지 않아요.';
  }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return 'JSON 요청만 받아요.';
  return null;
}

function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(Object.assign(new Error('요청이 너무 커요.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('JSON 형식이 아니에요.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const WATCH_ACTIONS = {
  run: () => {
    watch.run('manual');
  },
  apply: (b) => watch.applyProposal(String(b.id), b.patch || null, b.relation || null),
  dismiss: (b) => watch.dismissProposal(String(b.id)),
  'dismiss-signal': (b) => watch.dismissSignal(String(b.id)),
  edit: (b) => watch.editCompany(String(b.companyId), b.patch, { signalId: b.signalId && String(b.signalId) }),
  revert: (b) => watch.revert(String(b.companyId)),
  'add-relation': (b) => watch.addRelationManually(b.relation),
  'remove-relation': (b) => watch.removeRelation(String(b.id)),
};

async function handleWatch(reqUrl, res, req) {
  const action = reqUrl.pathname.replace(/^\/api\/watch\/?/, '');
  const write = req.method === 'POST';
  const rejection = adminRejection(req, { write });
  if (rejection) return sendJSON(res, 403, { error: rejection });
  if (!write) return action ? sendJSON(res, 405, { error: 'POST로 요청해 주세요.' }) : sendJSON(res, 200, watch.getWatchState());

  const fn = WATCH_ACTIONS[action];
  if (!fn) return sendJSON(res, 404, { error: '없는 작업이에요.' });
  try {
    await fn(await readJsonBody(req));
    sendJSON(res, 200, watch.getWatchState());
  } catch (err) {
    sendJSON(res, err.status || 400, { error: err.message });
  }
}

const API_ROUTES = {
  '/api/quotes': handleQuotes,
  '/api/news': handleNews,
  '/api/briefing': async (reqUrl, res) => sendJSON(res, 200, getBriefing()),
  '/api/board': async (reqUrl, res) => sendJSON(res, 200, await getBoard()),
};

function serveStatic(reqUrl, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = reqUrl.pathname.startsWith('/api/watch') ? handleWatch : API_ROUTES[reqUrl.pathname];
  if (route) {
    route(reqUrl, res, req).catch((err) => sendJSON(res, 500, { error: err.message }));
    return;
  }
  serveStatic(reqUrl, res);
});

server.listen(PORT, () => {
  console.log(`AI Map running at http://localhost:${PORT}  (데이터 점검: /admin.html)`);
  watch.startScheduler();
});

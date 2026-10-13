// Kleiner Server ohne Abhängigkeiten: liefert die Website aus und leitet /api/* an Chefkoch weiter
// (so umgeht man die CORS-Sperre des Browsers). Start: node server.js  ->  http://localhost:3000
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const API = process.env.CHEFKOCH_API || 'https://api.chefkoch.de/v2';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const target = new URL(API + url.pathname.slice(4) + url.search);
    const lib = target.protocol === 'http:' ? http : https;
    const proxyReq = lib.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 Mahlzeitplaner', Accept: 'application/json' } }, (up) => {
      res.writeHead(up.statusCode || 502, { 'Content-Type': up.headers['content-type'] || 'application/json' });
      up.pipe(res);
    });
    proxyReq.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    return;
  }

  let file = path.normalize(path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Mahlzeitplaner läuft auf http://localhost:${PORT}`));

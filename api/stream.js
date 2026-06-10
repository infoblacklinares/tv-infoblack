const https = require('https');
const http  = require('http');

function fetchStream(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'es-ES,es;q=0.9',
        ...headers,
      },
      timeout: 10000,
    };
    const req = lib.get(url, opts, resolve);
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function getBase(url) {
  return url.substring(0, url.lastIndexOf('/') + 1);
}

function toAbsolute(line, base, origin) {
  if (line.startsWith('http')) return line;
  if (line.startsWith('//')) return 'https:' + line;
  if (line.startsWith('/')) return origin + line;
  return base + line;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Falta parámetro url');

  let targetUrl;
  try { targetUrl = decodeURIComponent(rawUrl); }
  catch { return res.status(400).send('URL inválida'); }

  try {
    const upstream = await fetchStream(targetUrl);
    const ct = upstream.headers['content-type'] || '';
    const isPlaylist = targetUrl.match(/\.m3u8?(\?|$)/i) || ct.includes('mpegurl');

    // Pasar headers relevantes
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    res.setHeader('Cache-Control', 's-maxage=5');

    if (isPlaylist) {
      // Leer el playlist y reescribir URLs
      let content = '';
      for await (const chunk of upstream) content += chunk;

      const base   = getBase(targetUrl);
      const origin = new URL(targetUrl).origin;
      const self   = `/api/stream?url=`;

      const rewritten = content.split('\n').map(raw => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return raw;
        const abs = toAbsolute(line, base, origin);
        return self + encodeURIComponent(abs);
      }).join('\n');

      res.send(rewritten);
    } else {
      // Streaming binario (segmentos .ts, etc.)
      upstream.pipe(res);
    }
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
};

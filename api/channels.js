const https = require('https');
const http  = require('http');

// Listas de iptv-org actualizadas diariamente
const LISTS = {
  sports:  'https://iptv-org.github.io/iptv/categories/sports.m3u',
  spa:     'https://iptv-org.github.io/iptv/languages/spa.m3u',
  mx:      'https://iptv-org.github.io/iptv/countries/mx.m3u',
  ar:      'https://iptv-org.github.io/iptv/countries/ar.m3u',
  co:      'https://iptv-org.github.io/iptv/countries/co.m3u',
  pe:      'https://iptv-org.github.io/iptv/countries/pe.m3u',
  us:      'https://iptv-org.github.io/iptv/countries/us.m3u',
  news:    'https://iptv-org.github.io/iptv/categories/news.m3u',
  movies:  'https://iptv-org.github.io/iptv/categories/movies.m3u',
  music:   'https://iptv-org.github.io/iptv/categories/music.m3u',
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseM3U(text) {
  const lines   = text.split('\n');
  const channels = [];
  let meta = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const name  = (line.match(/,(.+)$/)            || [])[1]?.trim() || 'Canal';
      const logo  = (line.match(/tvg-logo="([^"]+)"/) || [])[1] || '';
      const group = (line.match(/group-title="([^"]+)"/) || [])[1] || 'General';
      const id    = (line.match(/tvg-id="([^"]+)"/)   || [])[1] || '';
      const lang  = (line.match(/tvg-language="([^"]+)"/) || [])[1] || '';
      const country = (line.match(/tvg-country="([^"]+)"/) || [])[1] || '';
      meta = { name, logo, group, id, lang, country };
    } else if (line && !line.startsWith('#') && meta) {
      channels.push({ ...meta, url: line });
      meta = null;
    }
  }
  return channels;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const list   = req.query.list || 'sports';
  const limit  = parseInt(req.query.limit) || 500;
  const search = (req.query.q || '').toLowerCase();

  const url = LISTS[list];
  if (!url) return res.status(400).json({ error: 'Lista no válida. Opciones: ' + Object.keys(LISTS).join(', ') });

  try {
    const text     = await fetch(url);
    let channels   = parseM3U(text);

    if (search) {
      channels = channels.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.group.toLowerCase().includes(search)
      );
    }

    // Limitar resultados
    const total = channels.length;
    channels = channels.slice(0, limit);

    res.json({ ok: true, list, total, returned: channels.length, channels });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

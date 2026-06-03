import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(GiB|MiB|KiB|TiB|B)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { 'b': 1, 'kib': 1024, 'mib': 1024 ** 2, 'gib': 1024 ** 3, 'tib': 1024 ** 4 };
  return value * (multipliers[unit] || 0);
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q = '', c = '0_0', f = '0', page = '1', s = '', o = '' } = req.query;

    if (!q.trim()) {
      return res.json({ results: [], total: 0 });
    }


    const params = new URLSearchParams({
      page: 'rss',
      q: q.trim(),
      c,
      f,
    });

    if (parseInt(page) > 1) {
      params.set('p', page);
    }
    if (s) params.set('s', s);
    if (o) params.set('o', o);

    const nyaaUrl = `https://nyaa.si/?${params.toString()}`;

    const response = await fetch(nyaaUrl, {
      headers: {
        'User-Agent': 'AnimeLookup/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Nyaa responded with ${response.status}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    if (!parsed.rss || !parsed.rss.channel || !parsed.rss.channel.item) {
      return res.json({ results: [], total: 0 });
    }

    const items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];

    const TRACKERS = [
      'http://nyaa.tracker.wf:7777/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
    ];

    const results = items.map((item) => {
      const torrentUrl = item.link || '';

      // Extract info hash from nyaa:infoHash (preferred) or fallback to parsing link/guid
      let infoHash = '';
      if (item['nyaa:infoHash']) {
        infoHash = String(item['nyaa:infoHash']).toLowerCase();
      } else {
        const hashMatch = torrentUrl.match(/btih:([a-fA-F0-9]{40})/i)
          || (item.guid && typeof item.guid === 'string' ? item.guid.match(/btih:([a-fA-F0-9]{40})/i) : null);
        if (hashMatch) infoHash = hashMatch[1].toLowerCase();
      }

      // Build a proper magnet URI from the info hash
      const title = item.title || 'Unknown';
      let magnet = torrentUrl; // fallback to .torrent URL
      if (infoHash) {
        const trackerParams = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
        magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}${trackerParams}`;
      }

      const guidStr = item.guid?.['#text'] || item.guid || '';
      const idMatch = String(guidStr).match(/(\d+)$/);
      const id = idMatch ? idMatch[1] : '';

      return {
        id,
        title,
        magnet,
        torrentUrl,
        size: item['nyaa:size'] || 'Unknown',
        sizeBytes: parseSizeToBytes(item['nyaa:size'] || ''),
        date: item.pubDate || '',
        seeders: parseInt(item['nyaa:seeders']) || 0,
        leechers: parseInt(item['nyaa:leechers']) || 0,
        downloads: parseInt(item['nyaa:downloads']) || 0,
        category: item['nyaa:category'] || 'Unknown',
        categoryId: item['nyaa:categoryId'] || '0_0',
        isTrusted: item['nyaa:trusted'] === 'Yes',
        isRemake: item['nyaa:remake'] === 'Yes',
        infoHash,
      };
    });


    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    return res.json({
      results,
      total: results.length,
      query: q,
      page: parseInt(page),
    });
  } catch (error) {
    console.error('[Search Error]', error.message);
    return res.status(500).json({ error: 'Failed to search Nyaa. Please try again.' });
  }
}

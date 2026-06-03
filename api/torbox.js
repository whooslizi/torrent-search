const TORBOX_BASE = 'https://api.torbox.app/v1/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, key, ...params } = req.body || {};

    if (!key) return res.status(400).json({ error: 'Missing API key' });
    if (!action) return res.status(400).json({ error: 'Missing action' });

    const headers = { 'Authorization': `Bearer ${key}` };
    let result;

    switch (action) {
      case 'createTorrent': {
        const form = new FormData();
        form.append('magnet', params.magnet);

        const resp = await fetch(`${TORBOX_BASE}/torrents/createtorrent`, {
          method: 'POST',
          headers,
          body: form,
        });
        result = await resp.json();
        if (!resp.ok) throw new Error(result.detail || result.error || `TorBox error ${resp.status}`);
        break;
      }

      case 'getTorrentList': {
        const url = new URL(`${TORBOX_BASE}/torrents/mylist`);
        if (params.id) url.searchParams.set('id', params.id);
        url.searchParams.set('bypass_cache', 'true');

        const resp = await fetch(url.toString(), { headers });
        result = await resp.json();
        if (!resp.ok) throw new Error(result.detail || result.error || `TorBox error ${resp.status}`);
        break;
      }

      case 'requestDl': {
        const url = new URL(`${TORBOX_BASE}/torrents/requestdl`);
        url.searchParams.set('token', key);
        url.searchParams.set('torrent_id', String(params.torrent_id));
        if (params.file_id !== undefined) url.searchParams.set('file_id', String(params.file_id));

        const resp = await fetch(url.toString());
        result = await resp.json();
        if (!resp.ok) throw new Error(result.detail || result.error || `TorBox error ${resp.status}`);
        break;
      }

      case 'getUser': {
        const resp = await fetch(`${TORBOX_BASE}/user/me`, { headers });
        result = await resp.json();
        if (!resp.ok) throw new Error(result.detail || result.error || `TorBox error ${resp.status}`);
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json(result);
  } catch (err) {
    console.error('[TorBox Proxy Error]', err.message);
    return res.status(500).json({ error: err.message || 'TorBox proxy error' });
  }
}

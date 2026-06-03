(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const loginScreen = $('#login-screen');
  const appHeader = $('#app-header');
  const appMain = $('#app-main');
  const searchForm = $('#search-form');
  const searchInput = $('#search-input');
  const filterCategory = $('#filter-category');
  const filterQuality = $('#filter-quality');
  const filterSort = $('#filter-sort');
  const filterOrder = $('#filter-order');
  const resultsSection = $('#results-section');
  const resultsGrid = $('#results-grid');
  const resultsTitle = $('#results-title');
  const resultsCount = $('#results-count');
  const loadingSection = $('#loading-section');
  const emptySection = $('#empty-section');
  const errorSection = $('#error-section');
  const errorTitle = $('#error-title');
  const errorMessage = $('#error-message');
  const pagination = $('#pagination');
  const debridModal = $('#debrid-modal');
  const debridProgressModal = $('#debrid-progress-modal');
  const debridApiKeyInput = $('#debrid-api-key');
  const debridStatusDot = $('#debrid-status-dot');
  const keyStatus = $('#key-status');
  const toastContainer = $('#toast-container');

  let currentQuery = '';
  let currentPage = 1;
  let isSearching = false;
  let isLoggedIn = false;

  const DEBRID_SERVICES = {
    realdebrid: {
      name: 'Real-Debrid',
      base: 'https://api.real-debrid.com/rest/1.0',
      authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    },
    alldebrid: {
      name: 'AllDebrid',
      base: 'https://api.alldebrid.com/v4',
      authQuery: (key) => `apikey=${key}`,
    },
    premiumize: {
      name: 'Premiumize',
      base: 'https://www.premiumize.me/api',
      authQuery: (key) => `apikey=${key}`,
    },
    debridlink: {
      name: 'Debrid-Link',
      base: 'https://debrid-link.com/api/v2',
      authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    },
  };

  function getConfig() {
    return {
      service: localStorage.getItem('debrid_service') || '',
      key: localStorage.getItem('debrid_key') || '',
    };
  }

  function saveConfig(service, key) {
    localStorage.setItem('debrid_service', service);
    localStorage.setItem('debrid_key', key);
  }

  function clearConfig() {
    localStorage.removeItem('debrid_service');
    localStorage.removeItem('debrid_key');
  }

  function init() {
    const config = getConfig();
    if (config.service && config.key) {
      enterApp(true);
    } else if (localStorage.getItem('skip_login') === 'true') {
      enterApp(false);
    }
    bindEvents();
  }

  function enterApp(loggedIn) {
    isLoggedIn = loggedIn;
    loginScreen.classList.add('hidden');
    appHeader.classList.remove('hidden');
    appMain.classList.remove('hidden');
    updateDebridStatus();
    searchInput.focus();
  }

  function bindEvents() {
    $('#btn-login-paste').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        $('#login-api-key').value = text.trim();
        toast('Pasted from clipboard', 'success');
      } catch { toast('Cannot read clipboard. Paste manually.', 'error'); }
    });

    $('#btn-login-submit').addEventListener('click', () => {
      const service = $('#login-service').value;
      const key = $('#login-api-key').value.trim();
      if (!key) { toast('Please enter an API key', 'error'); return; }
      saveConfig(service, key);
      localStorage.removeItem('skip_login');
      enterApp(true);
      toast(`Connected to ${DEBRID_SERVICES[service].name}!`, 'success');
    });

    $('#btn-login-skip').addEventListener('click', () => {
      localStorage.setItem('skip_login', 'true');
      enterApp(false);
    });

    searchForm.addEventListener('submit', handleSearch);
    $('#btn-retry').addEventListener('click', () => doSearch(currentQuery, currentPage));

    $('#logo').addEventListener('click', () => {
      showSection(null);
      searchInput.value = '';
      searchInput.focus();
    });

    $('#btn-debrid-settings').addEventListener('click', openDebridModal);
    $('#btn-close-modal').addEventListener('click', closeDebridModal);
    debridModal.querySelector('.modal-backdrop').addEventListener('click', closeDebridModal);
    $('#btn-paste-key').addEventListener('click', pasteApiKey);
    $('#btn-save-key').addEventListener('click', saveDebridKeyFromModal);
    $('#btn-clear-key').addEventListener('click', clearDebridKey);
    $('#btn-test-key').addEventListener('click', testDebridKey);

    $('#btn-logout').addEventListener('click', () => {
      clearConfig();
      localStorage.removeItem('skip_login');
      isLoggedIn = false;
      loginScreen.classList.remove('hidden');
      appHeader.classList.add('hidden');
      appMain.classList.add('hidden');
      showSection(null);
      toast('Logged out', 'info');
    });

    $('#btn-close-progress').addEventListener('click', closeProgressModal);
    debridProgressModal.querySelector('.modal-backdrop').addEventListener('click', closeProgressModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDebridModal(); closeProgressModal(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    });
  }

  function handleSearch(e) {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query || isSearching) return;
    currentQuery = query;
    currentPage = 1;
    doSearch(query, 1);
  }

  async function doSearch(query, page) {
    if (isSearching) return;
    isSearching = true;
    showSection('loading');

    try {
      const params = new URLSearchParams({ q: query, c: filterCategory.value, f: filterQuality.value, page: String(page) });
      if (filterSort.value) params.set('s', filterSort.value);
      if (filterOrder.value) params.set('o', filterOrder.value);

      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      if (!data.results || data.results.length === 0) { showSection('empty'); return; }

      renderResults(data);
      showSection('results');
      currentPage = page;
    } catch (err) {
      errorTitle.textContent = 'Search Failed';
      errorMessage.textContent = err.message || 'Please check your connection and try again.';
      showSection('error');
    } finally {
      isSearching = false;
    }
  }

  function renderResults(data) {
    resultsTitle.textContent = `Results for "${data.query}"`;
    resultsCount.textContent = `${data.total} results`;
    resultsGrid.innerHTML = '';
    data.results.forEach((item, index) => resultsGrid.appendChild(createResultCard(item, index)));
    renderPagination(data);
  }

  function createResultCard(item, index) {
    const card = document.createElement('div');
    card.className = 'result-card';
    if (item.isTrusted) card.classList.add('trusted');
    if (item.isRemake) card.classList.add('remake');
    card.style.animationDelay = `${index * 40}ms`;

    const dateStr = item.date ? formatDate(item.date) : '';
    const nyaaLink = item.id ? `https://nyaa.si/view/${item.id}` : '#';

    const lockedClass = isLoggedIn ? '' : 'btn--locked';
    const lockedTitle = isLoggedIn ? '' : 'Login with a debrid key to unlock';

    card.innerHTML = `
      <div class="card-top">
        <div class="card-title">
          <a href="${escapeHtml(nyaaLink)}" target="_blank" rel="noopener" title="View on Nyaa">${escapeHtml(item.title)}</a>
        </div>
        <div class="card-badges">
          ${item.isTrusted ? '<span class="badge badge--trusted">✓ Trusted</span>' : ''}
          ${item.isRemake ? '<span class="badge badge--remake">Remake</span>' : ''}
          <span class="badge badge--category">${escapeHtml(item.category)}</span>
        </div>
      </div>
      <div class="card-meta">
        <span class="meta-item meta-item--size" title="File size">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          ${escapeHtml(item.size)}
        </span>
        <span class="meta-item meta-item--seeders" title="Seeders">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
          ${item.seeders}
        </span>
        <span class="meta-item meta-item--leechers" title="Leechers">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          ${item.leechers}
        </span>
        <span class="meta-item" title="Downloads">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${item.downloads}
        </span>
        <span class="meta-item" title="Date">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dateStr}
        </span>
      </div>
      <div class="card-actions">
        <button class="btn btn--sm btn--ghost btn--magnet" data-action="copy-magnet" title="Copy magnet link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Magnet
        </button>
        <button class="btn btn--sm btn--ghost btn--player ${lockedClass}" data-action="open-player" title="${lockedTitle || 'Open magnet in Stremio / Nuvio'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Stremio / Nuvio
        </button>
        <button class="btn btn--sm btn--ghost btn--vlc ${lockedClass}" data-action="stream-debrid" title="${lockedTitle || 'Stream via Debrid → VLC'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 19h20L12 2z"/></svg>
          VLC (Debrid)
        </button>
        <button class="btn btn--sm btn--ghost btn--download ${lockedClass}" data-action="download-debrid" title="${lockedTitle || 'Get direct download link via Debrid'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
        ${!isLoggedIn ? '<span class="locked-hint">🔒 Login to stream & download</span>' : ''}
      </div>
    `;

    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, item));
    });

    return card;
  }

  function renderPagination(data) {
    const hasMore = data.results.length >= 75;
    if (!hasMore && currentPage === 1) { pagination.classList.add('hidden'); return; }

    pagination.classList.remove('hidden');
    pagination.innerHTML = '';

    if (currentPage > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn--outline btn--sm';
      prevBtn.textContent = '← Previous';
      prevBtn.addEventListener('click', () => doSearch(currentQuery, currentPage - 1));
      pagination.appendChild(prevBtn);
    }

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `Page ${currentPage}`;
    pagination.appendChild(info);

    if (hasMore) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn--outline btn--sm';
      nextBtn.textContent = 'Next →';
      nextBtn.addEventListener('click', () => doSearch(currentQuery, currentPage + 1));
      pagination.appendChild(nextBtn);
    }
  }

  function handleAction(action, item) {
    if (action === 'copy-magnet') {
      copyToClipboard(item.magnet);
      toast('Magnet link copied!', 'success');
      return;
    }

    if (!isLoggedIn) {
      toast('Login with a debrid key to unlock streaming & downloads', 'error');
      return;
    }

    switch (action) {
      case 'open-player':
        window.open(item.magnet, '_blank');
        toast('Opening in Stremio / Nuvio...', 'info');
        break;
      case 'stream-debrid':
        handleDebridStream(item, 'vlc');
        break;
      case 'download-debrid':
        handleDebridStream(item, 'download');
        break;
    }
  }

  async function handleDebridStream(item, mode) {
    const config = getConfig();
    if (!config.service || !config.key) {
      toast('Please configure your debrid service first', 'error');
      openDebridModal();
      return;
    }

    const service = DEBRID_SERVICES[config.service];
    if (!service) { toast('Unknown debrid service', 'error'); return; }

    openProgressModal();
    resetProgressSteps();

    try {
      let directLinks;

      switch (config.service) {
        case 'realdebrid':
          directLinks = await processRealDebrid(item, config.key);
          break;
        case 'alldebrid':
          directLinks = await processAllDebrid(item, config.key);
          break;
        case 'premiumize':
          directLinks = await processPremiumize(item, config.key);
          break;
        case 'debridlink':
          directLinks = await processDebridLink(item, config.key);
          break;
        default:
          throw new Error('Unsupported debrid service');
      }

      if (!directLinks || directLinks.length === 0) throw new Error('No download links received');

      showDebridLinks(directLinks, mode);

      if (mode === 'vlc' && directLinks.length === 1) {
        openInVLC(directLinks[0].url, directLinks[0].filename);
      }
    } catch (err) {
      const activeStep = debridProgressModal.querySelector('.progress-step.active');
      if (activeStep) setStepState(activeStep.dataset.step, 'error', err.message);
      toast(err.message, 'error');
    }
  }

  async function processRealDebrid(item, key) {
    const base = 'https://api.real-debrid.com/rest/1.0';
    const headers = { 'Authorization': `Bearer ${key}` };

    setStepState('magnet', 'active', 'Adding...');
    const addRes = await fetch(`${base}/torrents/addMagnet`, {
      method: 'POST', headers, body: new URLSearchParams({ magnet: item.magnet }),
    });
    if (!addRes.ok) throw new Error(`Failed to add magnet (${addRes.status})`);
    const { id: torrentId } = await addRes.json();
    setStepState('magnet', 'done', 'Added ✓');

    setStepState('select', 'active', 'Selecting...');
    await fetch(`${base}/torrents/selectFiles/${torrentId}`, {
      method: 'POST', headers, body: new URLSearchParams({ files: 'all' }),
    });
    setStepState('select', 'done', 'Selected ✓');

    setStepState('wait', 'active', 'Waiting for cache...');
    let info;
    for (let i = 0; i < 30; i++) {
      const infoRes = await fetch(`${base}/torrents/info/${torrentId}`, { headers });
      info = await infoRes.json();
      if (info.status === 'downloaded') break;
      if (['magnet_error', 'error', 'dead', 'virus'].includes(info.status)) throw new Error(`Torrent status: ${info.status}`);
      setStepState('wait', 'active', info.progress ? `${info.progress}%` : 'Processing...');
      await sleep(2000);
    }
    if (!info || info.status !== 'downloaded') throw new Error('Timed out waiting for download');
    setStepState('wait', 'done', 'Ready ✓');

    setStepState('unrestrict', 'active', 'Generating links...');
    const links = [];
    for (const link of (info.links || [])) {
      const unRes = await fetch(`${base}/unrestrict/link`, {
        method: 'POST', headers, body: new URLSearchParams({ link }),
      });
      if (unRes.ok) {
        const data = await unRes.json();
        links.push({ filename: data.filename, url: data.download, size: data.filesize });
      }
    }
    setStepState('unrestrict', 'done', `${links.length} link(s) ready ✓`);
    return links;
  }

  async function processAllDebrid(item, key) {
    const base = 'https://api.alldebrid.com/v4';
    const auth = `apikey=${encodeURIComponent(key)}&agent=AnimeLookup`;

    setStepState('magnet', 'active', 'Adding...');
    const addRes = await fetch(`${base}/magnet/upload?${auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `magnets[]=${encodeURIComponent(item.magnet)}`,
    });
    if (!addRes.ok) throw new Error(`Failed to add magnet (${addRes.status})`);
    const addData = await addRes.json();
    if (addData.status !== 'success') throw new Error(addData.error?.message || 'Failed to add magnet');
    const magnetId = addData.data?.magnets?.[0]?.id;
    if (!magnetId) throw new Error('No magnet ID received');
    setStepState('magnet', 'done', 'Added ✓');

    setStepState('select', 'done', 'Auto-selected ✓');

    setStepState('wait', 'active', 'Waiting for cache...');
    let status;
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(`${base}/magnet/status?${auth}&id=${magnetId}`);
      const statusData = await statusRes.json();
      status = statusData.data?.magnets;
      if (status?.statusCode === 4) break;
      if (status?.statusCode >= 5) throw new Error(`Magnet error: ${status.status}`);
      setStepState('wait', 'active', status?.status || 'Processing...');
      await sleep(2000);
    }
    if (!status || status.statusCode !== 4) throw new Error('Timed out');
    setStepState('wait', 'done', 'Ready ✓');

    setStepState('unrestrict', 'active', 'Generating links...');
    const links = [];
    const magnetLinks = status.links || [];
    for (const l of magnetLinks) {
      const unlockRes = await fetch(`${base}/link/unlock?${auth}&link=${encodeURIComponent(l.link)}`);
      if (unlockRes.ok) {
        const unlockData = await unlockRes.json();
        if (unlockData.data?.link) {
          links.push({ filename: unlockData.data.filename || l.filename, url: unlockData.data.link, size: unlockData.data.filesize });
        }
      }
    }
    setStepState('unrestrict', 'done', `${links.length} link(s) ready ✓`);
    return links;
  }

  async function processPremiumize(item, key) {
    const base = 'https://www.premiumize.me/api';
    const auth = `apikey=${encodeURIComponent(key)}`;

    setStepState('magnet', 'active', 'Adding...');
    const addRes = await fetch(`${base}/transfer/directdl?${auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `src=${encodeURIComponent(item.magnet)}`,
    });
    const addData = await addRes.json();

    if (addData.status === 'success' && addData.content) {
      setStepState('magnet', 'done', 'Cached ✓');
      setStepState('select', 'done', 'Auto ✓');
      setStepState('wait', 'done', 'Instant ✓');
      setStepState('unrestrict', 'active', 'Generating links...');

      const links = addData.content
        .filter(f => f.stream_link || f.link)
        .map(f => ({ filename: f.path?.split('/').pop() || 'File', url: f.stream_link || f.link, size: f.size }));

      setStepState('unrestrict', 'done', `${links.length} link(s) ready ✓`);
      return links;
    }

    setStepState('magnet', 'done', 'Added ✓');
    setStepState('select', 'done', 'Auto ✓');

    const createRes = await fetch(`${base}/transfer/create?${auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `src=${encodeURIComponent(item.magnet)}`,
    });
    const createData = await createRes.json();
    if (createData.status !== 'success') throw new Error('Failed to create transfer');
    const transferId = createData.id;

    setStepState('wait', 'active', 'Downloading...');
    for (let i = 0; i < 30; i++) {
      const listRes = await fetch(`${base}/transfer/list?${auth}`);
      const listData = await listRes.json();
      const transfer = listData.transfers?.find(t => t.id === transferId);
      if (!transfer) throw new Error('Transfer lost');
      if (transfer.status === 'finished') {
        setStepState('wait', 'done', 'Ready ✓');
        break;
      }
      if (transfer.status === 'error') throw new Error('Transfer failed');
      setStepState('wait', 'active', transfer.message || `${transfer.progress || 0}%`);
      await sleep(3000);
    }

    setStepState('unrestrict', 'done', 'See downloads in Premiumize ✓');
    return [{ filename: item.title, url: 'https://www.premiumize.me/transfers', size: 0 }];
  }

  async function processDebridLink(item, key) {
    const base = 'https://debrid-link.com/api/v2';
    const headers = { 'Authorization': `Bearer ${key}` };

    setStepState('magnet', 'active', 'Adding...');
    const addRes = await fetch(`${base}/seedbox/add`, {
      method: 'POST', headers,
      body: new URLSearchParams({ url: item.magnet, async: 'true' }),
    });
    if (!addRes.ok) throw new Error(`Failed to add (${addRes.status})`);
    const addData = await addRes.json();
    if (!addData.success) throw new Error(addData.error || 'Failed');
    const torrentId = addData.value?.id;
    setStepState('magnet', 'done', 'Added ✓');
    setStepState('select', 'done', 'Auto ✓');

    setStepState('wait', 'active', 'Waiting...');
    let torrentInfo;
    for (let i = 0; i < 30; i++) {
      const infoRes = await fetch(`${base}/seedbox/list`, { headers });
      const infoData = await infoRes.json();
      torrentInfo = infoData.value?.find(t => t.id === torrentId);
      if (!torrentInfo) throw new Error('Torrent not found');
      if (torrentInfo.downloadPercent === 100) break;
      setStepState('wait', 'active', `${torrentInfo.downloadPercent || 0}%`);
      await sleep(2000);
    }
    setStepState('wait', 'done', 'Ready ✓');

    setStepState('unrestrict', 'active', 'Generating links...');
    const links = (torrentInfo?.files || [])
      .filter(f => f.downloadUrl)
      .map(f => ({ filename: f.name, url: f.downloadUrl, size: f.size }));
    setStepState('unrestrict', 'done', `${links.length} link(s) ready ✓`);
    return links;
  }

  function showDebridLinks(links, mode) {
    const container = $('#debrid-links');
    container.innerHTML = '<h3>🎉 Stream Links Ready</h3>';

    links.forEach((link) => {
      const el = document.createElement('div');
      el.className = 'debrid-link-item';
      el.innerHTML = `
        <span class="debrid-link-name">${escapeHtml(link.filename || 'File')}</span>
        <div class="debrid-link-actions">
          <button class="btn btn--sm btn--outline btn--vlc" data-url="${escapeHtml(link.url)}" data-action="vlc" title="Open in VLC">▶ VLC</button>
          <button class="btn btn--sm btn--outline" data-url="${escapeHtml(link.url)}" data-action="copy" title="Copy direct link">📋 Copy</button>
          <a href="${escapeHtml(link.url)}" class="btn btn--sm btn--outline" target="_blank" rel="noopener" title="Download">⬇ Download</a>
        </div>
      `;

      el.querySelector('[data-action="vlc"]').addEventListener('click', (e) => {
        openInVLC(e.currentTarget.dataset.url, link.filename);
      });

      el.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
        copyToClipboard(e.currentTarget.dataset.url);
        toast('Direct link copied!', 'success');
      });

      container.appendChild(el);
    });

    container.classList.remove('hidden');
  }

  function openInVLC(url, filename) {
    const m3uContent = `#EXTM3U\n#EXTINF:-1,${filename || 'Stream'}\n${url}`;
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${(filename || 'stream').replace(/[^a-zA-Z0-9._-]/g, '_')}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    toast('Opening .m3u in VLC...', 'info');
  }

  function updateDebridStatus() {
    const config = getConfig();
    const hasKey = !!(config.service && config.key);
    debridStatusDot.className = hasKey ? 'status-dot status-dot--active' : 'status-dot status-dot--inactive';
    const serviceName = hasKey ? DEBRID_SERVICES[config.service]?.name : '';
    keyStatus.innerHTML = hasKey
      ? `<span class="status-dot status-dot--active"></span><span>Connected to ${serviceName}</span>`
      : '<span class="status-dot status-dot--inactive"></span><span>No API key configured</span>';
  }

  function openDebridModal() {
    debridModal.classList.remove('hidden');
    const config = getConfig();
    if (config.service) $('#settings-service').value = config.service;
    debridApiKeyInput.value = config.key;
  }

  function closeDebridModal() { debridModal.classList.add('hidden'); }

  async function pasteApiKey() {
    try {
      const text = await navigator.clipboard.readText();
      debridApiKeyInput.value = text.trim();
      toast('Pasted from clipboard', 'success');
    } catch { toast('Cannot read clipboard. Paste manually.', 'error'); }
  }

  function saveDebridKeyFromModal() {
    const service = $('#settings-service').value;
    const key = debridApiKeyInput.value.trim();
    if (!key) { toast('Please enter an API key', 'error'); return; }
    saveConfig(service, key);
    isLoggedIn = true;
    updateDebridStatus();
    toast(`Saved! Connected to ${DEBRID_SERVICES[service].name}`, 'success');
    closeDebridModal();
  }

  function clearDebridKey() {
    clearConfig();
    debridApiKeyInput.value = '';
    isLoggedIn = false;
    updateDebridStatus();
    toast('API key cleared', 'info');
  }

  async function testDebridKey() {
    const service = $('#settings-service').value;
    const key = debridApiKeyInput.value.trim() || getConfig().key;
    if (!key) { toast('No API key to test', 'error'); return; }

    try {
      let res;
      switch (service) {
        case 'realdebrid':
          res = await fetch('https://api.real-debrid.com/rest/1.0/user', { headers: { 'Authorization': `Bearer ${key}` } });
          if (!res.ok) throw new Error('Invalid key');
          const rdUser = await res.json();
          toast(`Connected! Welcome, ${rdUser.username}`, 'success');
          break;
        case 'alldebrid':
          res = await fetch(`https://api.alldebrid.com/v4/user?apikey=${encodeURIComponent(key)}&agent=AnimeLookup`);
          if (!res.ok) throw new Error('Invalid key');
          const adData = await res.json();
          if (adData.status !== 'success') throw new Error('Invalid key');
          toast(`Connected! Welcome, ${adData.data?.user?.username || 'user'}`, 'success');
          break;
        case 'premiumize':
          res = await fetch(`https://www.premiumize.me/api/account/info?apikey=${encodeURIComponent(key)}`);
          if (!res.ok) throw new Error('Invalid key');
          const pmData = await res.json();
          toast(`Connected! Customer #${pmData.customer_id || 'unknown'}`, 'success');
          break;
        default:
          toast('Test not available for this service yet', 'info');
          break;
      }

      saveConfig(service, key);
      debridApiKeyInput.value = key;
      isLoggedIn = true;
      updateDebridStatus();
    } catch (err) {
      toast('API key invalid or connection failed', 'error');
    }
  }

  function openProgressModal() { debridProgressModal.classList.remove('hidden'); }
  function closeProgressModal() { debridProgressModal.classList.add('hidden'); }

  function resetProgressSteps() {
    debridProgressModal.querySelectorAll('.progress-step').forEach(s => {
      s.className = 'progress-step';
      s.querySelector('.step-status').textContent = '';
    });
    $('#debrid-links').classList.add('hidden');
    $('#debrid-links').innerHTML = '';
  }

  function setStepState(stepName, state, statusText) {
    const step = debridProgressModal.querySelector(`[data-step="${stepName}"]`);
    if (!step) return;
    step.className = `progress-step ${state}`;
    if (statusText) step.querySelector('.step-status').textContent = statusText;
  }

  function showSection(name) {
    [resultsSection, loadingSection, emptySection, errorSection].forEach(s => s.classList.add('hidden'));
    switch (name) {
      case 'results': resultsSection.classList.remove('hidden'); break;
      case 'loading': loadingSection.classList.remove('hidden'); break;
      case 'empty': emptySection.classList.remove('hidden'); break;
      case 'error': errorSection.classList.remove('hidden'); break;
    }
  }

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
      if (diffHours < 48) return 'Yesterday';
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    } catch { return dateStr; }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  init();
})();

// ---- API base config ----
const API_BASE =
  (typeof window !== 'undefined' && window.KLEPTOS_API) ||
  new URLSearchParams(location.search).get('api') ||
  ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:5000' : '');

const api = (p) => `${API_BASE}${p}`;

(() => {
  const els = {
    input: document.querySelector('#kleptos .urlInput, .urlInput'),
    downloadBtn: document.getElementById('downloadBtn'),
    settingsBtn: document.getElementById('settings'),
    results: document.querySelector('#kleptos .urlResults'),
    title: document.querySelector('#kleptos .urlResults h2'),
    channel: document.querySelector('#kleptos .urlResults a'),
    infoEls: document.querySelectorAll('#kleptos .videoInfo p'),
    total: document.getElementById('downloadCountTotal'),
    today: document.getElementById('downloadCountToday'),
    thumbImg: document.getElementById('thumbnailPreview'),
    metaBar: document.getElementById('metaProgress'),
    dlBar: document.getElementById('dlProgress'),
    toast: document.getElementById('toast'),
    // playlist UI
    playlistWrap: document.getElementById('playlistInfo'),
    playlistCount: document.getElementById('playlistCount'),
    playlistTitle: document.getElementById('playlistTitle'),
    downloadPlBtn: document.getElementById('downloadPlaylistBtn'),
  };

  // ---- Utils ----
  const fmtCount = (n)=> (n==null? '—' : Number(n).toLocaleString());
  const fmtDuration = (s)=>{
    if (!s && s !== 0) return '—';
    s = Math.max(0, Math.floor(s));
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return (h?`${h}:`:'') + `${h?String(m).padStart(2,'0'):m}:${String(sec).padStart(2,'0')}`;
  };
  const isProbablyUrl = (v)=>/^https?:\/\/\S+/i.test(v);
  const debounce = (fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  async function fetchJSON(url, init){
    const r = await fetch(url, { headers:{'Content-Type':'application/json'}, ...init });
    const ctype = (r.headers.get('Content-Type')||'').toLowerCase();
    if (!r.ok) throw new Error(await r.text().catch(()=>r.statusText));
    if (!ctype.includes('application/json')) return {};
    return r.json();
  }

  function showResults(){ els.results && (els.results.style.display='block'); }
  function hideResults(){ els.results && (els.results.style.display='none'); }
  function enableDownload(ok){ if (els.downloadBtn) els.downloadBtn.disabled = !ok; }
  function setMetaLoading(on,msg){ if(!els.metaBar) return; els.metaBar.hidden = !on; els.metaBar.querySelector('span').textContent = msg||'Collecting data…'; }
  function setDlLoading(on,msg){ if(!els.dlBar) return; els.dlBar.hidden = !on; els.dlBar.querySelector('span').textContent = msg||'Downloading…'; }

  function showToast(title, body, type){
    if (!els.toast) return;
    els.toast.querySelector('.title').textContent = title || '';
    els.toast.querySelector('.body').textContent = body || '';
    els.toast.classList.toggle('error', type === 'error');
    els.toast.hidden = false;
    setTimeout(()=>{ els.toast.hidden = true; }, 3500);
  }

  // ---- Render metadata ----
  function renderMeta(meta){
    if (!meta) return;

    const h2 = els.title;
    const chanEl = els.channel;
    const infoEls = els.infoEls;
    const ex = (meta.extractor || '').toLowerCase();

    const url = meta.url || '';
    const title = meta.title || '';
    const chan = meta.uploader || '';
    const chanUrl = meta.uploaderUrl || meta.channelUrl || '#';
    const views = fmtCount(meta.viewCount);
    const likes = fmtCount(meta.likeCount);
    const subs = fmtCount(meta.subscriberCount);
    const date = meta.uploadDate ? new Date(meta.uploadDate).toLocaleDateString() : '';
    const durStr = fmtDuration(meta.durationSeconds);
    const thumb = meta.thumbnail || '';

    if (h2) h2.textContent = title;
    if (chanEl){ chanEl.textContent = chan || ''; chanEl.href = chan ? chanUrl : '#'; }
    if (els.thumbImg){
      if (thumb){
        const proxied = api('/api/proxy-thumb?src=' + encodeURIComponent(thumb));
        els.thumbImg.src = proxied;
        els.thumbImg.alt = title ? `Thumbnail: ${title}` : 'Video thumbnail';
      } else {
        els.thumbImg.removeAttribute('src'); els.thumbImg.alt = 'No thumbnail available';
      }
    }
    if (infoEls.length >= 5){
      infoEls[0].textContent = date ? `${date} •` : '';
      infoEls[1].textContent = durStr !== '—' ? `${durStr} •` : '';
      infoEls[2].textContent = views !== '—' ? `${views} views •` : '';
      infoEls[3].textContent = likes !== '—' ? `${likes} likes •` : '';
      infoEls[4].textContent = subs !== '—' ? `${subs} ${(ex.includes('youtube')?'subs':'followers')} •` : '';
    }

    // Playlist feedback UI
    const isPl = !!meta.isPlaylist;
    showPlUI(isPl);
    if (isPl){
      if (els.playlistCount) els.playlistCount.textContent = (meta.playlistCount ?? 0).toLocaleString();
      if (els.playlistTitle) els.playlistTitle.textContent = meta.playlistTitle || '';
    }
  }

  function showPlUI(show){
    if (!els.playlistWrap) return;
    els.playlistWrap.hidden = !show;
    // Only allow single-item download when not a playlist
    enableDownload(!show);
  }

  // ---- Metadata fetch on input (no blur/change listeners) ----
  const onInput = debounce(async ()=>{
    const v = (els.input?.value || '').trim();
    hideResults(); setMetaLoading(false); enableDownload(false);
    if (!isProbablyUrl(v)) return;

    try{
      setMetaLoading(true, 'Collecting data…');
      const meta = await fetchJSON(api('/api/metadata'), { method:'POST', body: JSON.stringify({ url: v }) });
      renderMeta(meta); showResults();

      // Single item only; playlists use the separate button
      enableDownload(!meta.isPlaylist);
    }catch(err){
      console.error(err); showToast('Failed to fetch info', String(err.message||err), 'error');
      hideResults(); enableDownload(false);
    }finally{ setMetaLoading(false); }
  }, 250);

  if (els.input){
    els.input.addEventListener('input', onInput);
    els.input.addEventListener('paste', ()=>setTimeout(onInput,0));
  }

  // ---- Settings modal wiring ----
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsClose');
  const saveBtn  = document.getElementById('settingsSave');

  const uiSet = {
    fileFormat: document.getElementById('optFileFormat'),
    fileName:   document.getElementById('optFileName'),
    qualityBox: document.getElementById('optQuality'),
    thumbOnly:  document.getElementById('optThumbOnly'),
  };

  function loadSettings(){
    try{ return JSON.parse(localStorage.getItem('kleptos.settings')||'{}'); }catch{ return {}; }
  }
  function saveSettings(s){
    localStorage.setItem('kleptos.settings', JSON.stringify(s||{}));
    showToast('Saved', 'Settings updated.');
  }
  function openSettings(){
    const s = loadSettings();
    modal?.setAttribute('aria-hidden', 'false');
    uiSet.fileFormat.value = s.fileFormat || 'auto';
    uiSet.fileName.value   = s.fileName || '';
    uiSet.thumbOnly.checked= !!s.thumbOnly;
    [...uiSet.qualityBox.querySelectorAll('button')].forEach(b=>b.classList.toggle('active', b.dataset.q === (s.quality || 'BEST')));
  }
  function closeSettings(){ modal?.setAttribute('aria-hidden', 'true'); }

  document.getElementById('settings')?.addEventListener('click', openSettings);
  closeBtn?.addEventListener('click', closeSettings);
  modal?.querySelector('.kmodal__backdrop')?.addEventListener('click', closeSettings);
  uiSet.qualityBox?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-q]'); if (!btn) return;
    uiSet.qualityBox.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
  saveBtn?.addEventListener('click', ()=>{
    const quality = uiSet.qualityBox.querySelector('button.active')?.dataset.q || 'BEST';
    const s = {
      fileFormat: uiSet.fileFormat.value || 'auto',
      fileName:   uiSet.fileName.value.trim(),
      quality,
      thumbOnly:  uiSet.thumbOnly.checked
    };
    saveSettings(s);
    closeSettings();
  });

  // ---- Build options payload ----
  const QUALITY_MAP = {
    Low:    'b[height<=360]/bv*[height<=360]+ba/b',
    Medium: 'b[height<=480]/bv*[height<=480]+ba/b',
    High:   'b[height<=1080]/bv*[height<=1080]+ba/b',
    BEST:   'b/bestvideo*+bestaudio/best'
  };
  const clean = (o)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined && v!==null && v!==''));

  function buildOptionsFromSettings(){
    const s = loadSettings();

    if (s.thumbOnly) {
      return clean({ thumbnailOnly: true, fileName: s.fileName || undefined });
    }

    let audioOnly = false, audioFormat, container, format;

    if ((s.fileFormat||'').startsWith('audio:')){
      audioOnly   = true;
      audioFormat = s.fileFormat.split(':')[1];
      format      = 'bestaudio/best';
    } else {
      container = (s.fileFormat === 'auto') ? '' : s.fileFormat;
      format    = QUALITY_MAP[s.quality] || QUALITY_MAP.BEST;
    }

    return clean({
      format,
      container,
      audioOnly: audioOnly || undefined,
      audioFormat,
      fileName: s.fileName || undefined
    });
  }

  // ---- Download (single URL) ----
  if (els.downloadBtn){
    els.downloadBtn.addEventListener('click', async ()=>{
      const v = (els.input?.value || '').trim();
      if (!isProbablyUrl(v)){ showToast('Invalid link', 'Paste a valid link first.', 'error'); return; }

      enableDownload(false); setDlLoading(true, 'Downloading…');

      try{
        const options = buildOptionsFromSettings();
        const res = await fetch(api('/api/download'), {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'Accept':'application/octet-stream' },
          body: JSON.stringify({ url: v, options })
        });

        const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
        if (!res.ok || ctype.includes('application/json') || ctype.includes('problem+json')){
          const txt = await res.text().catch(()=>res.statusText);
          throw new Error(txt || res.statusText);
        }

        const blob = await res.blob();
        const dispo = res.headers.get('Content-Disposition');
        const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(dispo || '');
        const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(dispo || '');
        const nameFromHeader = star ? decodeURIComponent(star[1].replace(/["']/g,'')) : (plain ? plain[2] : null);

        const suggested = nameFromHeader || 'download';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = suggested;
        document.body.appendChild(a); a.click();
        setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);

        showToast('Done', 'Your download has completed.');
        refreshStats();
      }catch(e){
        console.error(e);
        showToast('Download failed', String(e.message||e), 'error');
      }finally{
        setDlLoading(false);
        enableDownload(true);
      }
    });
  }

  // ---- Download playlist as .zip ----
  if (els.downloadPlBtn){
    els.downloadPlBtn.addEventListener('click', async ()=>{
      const v = (els.input?.value || '').trim();
      if (!isProbablyUrl(v)){ showToast('Invalid link', 'Paste a valid link first.', 'error'); return; }

      const total = parseInt(els.playlistCount?.textContent || '0', 10);
      setDlLoading(true, total ? `Downloading playlist (${total} items)…` : 'Downloading playlist…');
      els.downloadPlBtn.disabled = true;

      try{
        const options = buildOptionsFromSettings();
        const res = await fetch(api('/api/download-playlist'), {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'Accept':'application/zip' },
          body: JSON.stringify({ url: v, options })
        });

        const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
        if (!res.ok || (!ctype.startsWith('application/zip') && !ctype.includes('octet-stream'))){
          const txt = await res.text().catch(()=>res.statusText);
          throw new Error(txt || res.statusText);
        }

        const blob = await res.blob();
        const dispo = res.headers.get('Content-Disposition');
        const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(dispo || '');
        const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(dispo || '');
        const nameFromHeader = star ? decodeURIComponent(star[1].replace(/["']/g,'')) : (plain ? plain[2] : null);

        const suggested = nameFromHeader || 'playlist - Kleptos.zip';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = suggested;
        document.body.appendChild(a); a.click();
        setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);

        showToast('Done', 'Playlist downloaded.');
        refreshStats();
      }catch(e){
        console.error(e);
        showToast('Download failed', String(e.message||e), 'error');
      }finally{
        setDlLoading(false);
        els.downloadPlBtn.disabled = false;
      }
    });
  }

  // ---- Stats ----
  async function refreshStats(){
    try{
      const s = await fetchJSON(api('/api/stats'));
      if (els.total) els.total.textContent = (s.totalDownloads ?? 0).toLocaleString();
      if (els.today) els.today.textContent = (s.downloadsToday ?? 0).toLocaleString();
    }catch{}
  }

  // init
  hideResults(); enableDownload(false); refreshStats(); setInterval(refreshStats, 30000);
})();

// ---- API base config ----
const API_BASE =
  (typeof window !== 'undefined' && window.KLEPTOS_API) ||
  new URLSearchParams(location.search).get('api') ||
  ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:5000' : '');

const api = (p) => `${API_BASE}${p}`;

(() => {
  // Gates
  const siteGate = document.getElementById('siteGate');
  const footerGate = document.getElementById('footerGate');
  const loginGate = document.getElementById('loginGate');
  const appGate = document.getElementById('appGate');
  const loginStatus = document.getElementById('loginStatus');

  // Auth UI (login gate)
  const authLogin = document.getElementById('authLogin');
  const authUser = document.getElementById('authUser');
  const authEmail = document.getElementById('authEmail');
  const quotaRemaining = document.getElementById('quotaRemaining');
  const authLogout = document.getElementById('authLogout');

  // Auth UI (in-app)
  const authEmailInApp = document.getElementById('authEmailInApp');
  const quotaRemainingInApp = document.getElementById('quotaRemainingInApp');
  const authLogoutInApp = document.getElementById('authLogoutInApp');

  // Main app elements
  const els = {
    input: document.querySelector('.urlInput'),
    downloadBtn: document.getElementById('downloadBtn'),
    settingsBtn: document.getElementById('settings'),
    results: document.querySelector('.urlResults'),
    title: document.querySelector('.urlResults h2'),
    channel: document.querySelector('.urlResults a'),
    infoEls: document.querySelectorAll('.videoInfo p'),
    total: document.getElementById('downloadCountTotal'),
    today: document.getElementById('downloadCountToday'),
    thumbImg: document.getElementById('thumbnailPreview'),
    metaBar: document.getElementById('metaProgress'),
    dlBar: document.getElementById('dlProgress'),
    toast: document.getElementById('toast'),
    playlistWrap: document.getElementById('playlistInfo'),
    playlistCount: document.getElementById('playlistCount'),
    playlistTitle: document.getElementById('playlistTitle'),
    downloadPlBtn: document.getElementById('downloadPlaylistBtn'),
  };

  // Settings modal
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsClose');
  const saveBtn  = document.getElementById('settingsSave');

  const uiSet = {
    fileFormat: document.getElementById('optFileFormat'),
    fileName:   document.getElementById('optFileName'),
    qualityBox: document.getElementById('optQuality'),
    thumbOnly:  document.getElementById('optThumbOnly'),
  };

  const auth = {
    isAuthed: false,
    email: null,
    remainingToday: null,
    isBanned: false,
    banReason: null,
  };

  // ---------------- Utils ----------------
  const fmtCount = (n)=> (n==null? '—' : Number(n).toLocaleString());
  const fmtDuration = (s)=>{
    if (!s && s !== 0) return '—';
    s = Math.max(0, Math.floor(s));
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return (h?`${h}:`:'') + `${h?String(m).padStart(2,'0'):m}:${String(sec).padStart(2,'0')}`;
  };
  const isProbablyUrl = (v)=>/^https?:\/\/\S+/i.test(v);
  const debounce = (fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

  class HttpError extends Error{
    constructor(status, body){
      super(body || `HTTP ${status}`);
      this.status = status;
      this.body = body;
    }
  }

  async function fetchJSON(url, init){
    const r = await fetch(url, { headers:{'Content-Type':'application/json'}, ...init });
    const ctype = (r.headers.get('Content-Type')||'').toLowerCase();

    if (!r.ok){
      const body = await r.text().catch(()=>r.statusText);
      throw new HttpError(r.status, body || r.statusText);
    }

    if (!ctype.includes('application/json')) return {};
    return r.json();
  }

  function showToast(title, body, type){
    if (!els.toast) return;
    els.toast.querySelector('.title').textContent = title || '';
    els.toast.querySelector('.body').textContent = body || '';
    els.toast.classList.toggle('error', type === 'error');
    els.toast.hidden = false;
    setTimeout(()=>{ els.toast.hidden = true; }, 3500);
  }

  function setMetaLoading(on,msg){
    if(!els.metaBar) return;
    els.metaBar.hidden = !on;
    els.metaBar.querySelector('span').textContent = msg||'Collecting data…';
  }

  function setDlLoading(on,msg){
    if(!els.dlBar) return;
    els.dlBar.hidden = !on;
    els.dlBar.querySelector('span').textContent = msg||'Downloading…';
  }

  function showResults(){ els.results && (els.results.style.display='block'); }
  function hideResults(){ els.results && (els.results.style.display='none'); }
  function enableDownload(ok){ if (els.downloadBtn) els.downloadBtn.disabled = !ok; }

  function showPlUI(show){
    if (!els.playlistWrap) return;
    els.playlistWrap.hidden = !show;
    enableDownload(!show);
  }

  function setLoginStatus(msg){
    if (!loginStatus) return;
    loginStatus.textContent = msg || '';
  }

  function loginUrl(){
    const returnTo = location.pathname + location.search + location.hash;
    return api('/auth/login?returnTo=' + encodeURIComponent(returnTo));
  }

  function setGate(isLoggedIn){
    // Logged out: show loginGate, hide appGate
    if (loginGate) loginGate.hidden = !!isLoggedIn;
    if (appGate) appGate.hidden = !isLoggedIn;

    // DO NOT hide navbar/footer anymore
  }

  function setAuthed(ok, me){
    auth.isAuthed = !!ok;

    if (!ok){
      auth.email = null;
      auth.remainingToday = null;
      auth.isBanned = false;
      auth.banReason = null;

      if (authUser) authUser.hidden = true;
      if (authLogin) authLogin.hidden = false;

      setGate(false);
      setLoginStatus('Please login to continue.');
      return;
    }

    auth.email = me?.email ?? null;
    auth.remainingToday = me?.remainingToday ?? null;
    auth.isBanned = !!me?.isBanned;
    auth.banReason = me?.banReason ?? null;

    if (authLogin) authLogin.hidden = true;
    if (authUser) authUser.hidden = false;

    if (authEmail) authEmail.textContent = auth.email || '—';
    if (quotaRemaining) quotaRemaining.textContent = (auth.remainingToday ?? '—').toString();

    if (authEmailInApp) authEmailInApp.textContent = auth.email || '—';
    if (quotaRemainingInApp) quotaRemainingInApp.textContent = (auth.remainingToday ?? '—').toString();

    if (auth.isBanned){
      setGate(false);
      setLoginStatus(auth.banReason || 'Your account is banned.');
      return;
    }

    setGate(true);
    setLoginStatus('');
  }

  function handleAuthError(err){
    if (err && (err.status === 401 || String(err.message||'').includes('401'))){
      setAuthed(false);
      setLoginStatus('Session expired — please login again.');
      return true;
    }
    if (err && (err.status === 403 || String(err.message||'').includes('403'))){
      setAuthed(false);
      setLoginStatus('Access blocked.');
      return true;
    }
    return false;
  }

  async function doLogout(){
    try{ await fetch(api('/auth/logout'), { method:'POST' }); }catch{}
    hideResults();
    enableDownload(false);
    setAuthed(false);
  }

  // ---------------- Settings ----------------
  function loadSettings(){
    try{ return JSON.parse(localStorage.getItem('kleptos.settings')||'{}'); }catch{ return {}; }
  }
  function saveSettings(s){
    localStorage.setItem('kleptos.settings', JSON.stringify(s||{}));
    showToast('Saved', 'Settings updated.');
  }
  function sanitizeFileFormat(v){
    v = (v || 'auto').toLowerCase();
    if (v === 'mov') return 'auto';
    return v;
  }
  function openSettings(){
    const s = loadSettings();
    modal?.setAttribute('aria-hidden', 'false');
    const fmt = sanitizeFileFormat(s.fileFormat || 'auto');
    if (uiSet.fileFormat) uiSet.fileFormat.value = fmt;
    if (uiSet.fileName) uiSet.fileName.value = s.fileName || '';
    if (uiSet.thumbOnly) uiSet.thumbOnly.checked = !!s.thumbOnly;

    if (uiSet.qualityBox){
      [...uiSet.qualityBox.querySelectorAll('button')].forEach(b =>
        b.classList.toggle('active', b.dataset.q === (s.quality || 'BEST'))
      );
    }
  }
  function closeSettings(){ modal?.setAttribute('aria-hidden', 'true'); }

  const QUALITY_MAP = {
    Low:    'b[height<=360]/bv*[height<=360]+ba/b',
    Medium: 'b[height<=480]/bv*[height<=480]+ba/b',
    High:   'b[height<=1080]/bv*[height<=1080]+ba/b',
    BEST:   'b/bestvideo*+bestaudio/best'
  };
  const clean = (o)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined && v!==null && v!==''));

  function buildOptionsFromSettings(){
    const s = loadSettings();
    const fileFormat = sanitizeFileFormat(s.fileFormat || 'auto');

    if (s.thumbOnly) {
      return clean({ thumbnailOnly: true, fileName: s.fileName || undefined });
    }

    let audioOnly = false, audioFormat, container, format;

    if ((fileFormat||'').startsWith('audio:')){
      audioOnly   = true;
      audioFormat = fileFormat.split(':')[1];
      format      = 'bestaudio/best';
    } else {
      container = (fileFormat === 'auto') ? '' : fileFormat;
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

  // ---------------- Render metadata ----------------
  function renderMeta(meta){
    if (!meta) return;

    const title = meta.title || '';
    const chan = meta.uploader || '';
    const chanUrl = meta.uploaderUrl || meta.channelUrl || '#';

    const views = fmtCount(meta.viewCount);
    const likes = fmtCount(meta.likeCount);
    const subs = fmtCount(meta.subscriberCount);
    const date = meta.uploadDate ? new Date(meta.uploadDate).toLocaleDateString() : '';
    const durStr = fmtDuration(meta.durationSeconds);
    const thumb = meta.thumbnail || '';

    if (els.title) els.title.textContent = title;
    if (els.channel){
      els.channel.textContent = chan || '';
      els.channel.href = chan ? chanUrl : '#';
    }

    if (els.thumbImg){
      if (thumb){
        const proxied = api('/api/proxy-thumb?src=' + encodeURIComponent(thumb));
        els.thumbImg.src = proxied;
        els.thumbImg.alt = title ? `Thumbnail: ${title}` : 'Video thumbnail';
      } else {
        els.thumbImg.removeAttribute('src');
        els.thumbImg.alt = 'No thumbnail available';
      }
    }

    if (els.infoEls && els.infoEls.length >= 5){
      els.infoEls[0].textContent = date ? `${date} •` : '';
      els.infoEls[1].textContent = durStr !== '—' ? `${durStr} •` : '';
      els.infoEls[2].textContent = views !== '—' ? `${views} views •` : '';
      els.infoEls[3].textContent = likes !== '—' ? `${likes} likes •` : '';
      els.infoEls[4].textContent = subs !== '—' ? `${subs} subs •` : '';
    }

    const isPl = !!meta.isPlaylist;
    showPlUI(isPl);

    if (isPl){
      if (els.playlistCount) els.playlistCount.textContent = (meta.playlistCount ?? 0).toLocaleString();
      if (els.playlistTitle) els.playlistTitle.textContent = meta.playlistTitle || '';
    }
  }

  // ---------------- Metadata fetch ----------------
  const onInput = debounce(async ()=>{
    const v = (els.input?.value || '').trim();
    hideResults(); setMetaLoading(false); enableDownload(false);
    if (!isProbablyUrl(v)) return;

    try{
      setMetaLoading(true, 'Collecting data…');
      const meta = await fetchJSON(api('/api/metadata'), {
        method:'POST',
        body: JSON.stringify({ url: v })
      });

      renderMeta(meta);
      showResults();
      enableDownload(!meta.isPlaylist);
    }catch(err){
      console.error(err);
      if (handleAuthError(err)) return;
      showToast('Failed to fetch info', String(err.message||err), 'error');
      hideResults(); enableDownload(false);
    }finally{
      setMetaLoading(false);
    }
  }, 250);

  // ---------------- Download single ----------------
  async function doDownload(){
    const v = (els.input?.value || '').trim();
    if (!isProbablyUrl(v)){
      showToast('Invalid link', 'Paste a valid link first.', 'error');
      return;
    }

    enableDownload(false);
    setDlLoading(true, 'Downloading…');

    try{
      const options = buildOptionsFromSettings();
      const res = await fetch(api('/api/download'), {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Accept':'application/octet-stream' },
        body: JSON.stringify({ url: v, options })
      });

      const ctype = (res.headers.get('Content-Type') || '').toLowerCase();

      if (res.status === 401){
        setAuthed(false);
        return;
      }

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
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);

      showToast('Done', 'Your download has completed.');
      await refreshMe();
      await refreshStats();
    }catch(e){
      console.error(e);
      showToast('Download failed', String(e.message||e), 'error');
    }finally{
      setDlLoading(false);
      enableDownload(true);
    }
  }

  // ---------------- Download playlist ----------------
  async function doDownloadPlaylist(){
    const v = (els.input?.value || '').trim();
    if (!isProbablyUrl(v)){
      showToast('Invalid link', 'Paste a valid link first.', 'error');
      return;
    }

    const total = parseInt(els.playlistCount?.textContent || '0', 10);
    setDlLoading(true, total ? `Downloading playlist (${total} items)…` : 'Downloading playlist…');
    if (els.downloadPlBtn) els.downloadPlBtn.disabled = true;

    try{
      const options = buildOptionsFromSettings();
      const res = await fetch(api('/api/download-playlist'), {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Accept':'application/zip' },
        body: JSON.stringify({ url: v, options })
      });

      const ctype = (res.headers.get('Content-Type') || '').toLowerCase();

      if (res.status === 401){
        setAuthed(false);
        return;
      }

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
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);

      showToast('Done', 'Playlist downloaded.');
      await refreshMe();
      await refreshStats();
    }catch(e){
      console.error(e);
      showToast('Download failed', String(e.message||e), 'error');
    }finally{
      setDlLoading(false);
      if (els.downloadPlBtn) els.downloadPlBtn.disabled = false;
    }
  }

  // ---------------- Stats + Me ----------------
  async function refreshStats(){
    if (!auth.isAuthed) return;

    try{
      const s = await fetchJSON(api('/api/stats'));
      const pub = s.publicStats || {};
      const q = s.quota || {};

      if (els.total) els.total.textContent = (pub.totalDownloads ?? 0).toLocaleString();
      if (els.today) els.today.textContent = (pub.downloadsToday ?? 0).toLocaleString();

      if (quotaRemaining) quotaRemaining.textContent = (q.remainingToday ?? '—').toString();
      if (quotaRemainingInApp) quotaRemainingInApp.textContent = (q.remainingToday ?? '—').toString();
    }catch(err){
      console.error(err);
      handleAuthError(err);
    }
  }

  async function refreshMe(){
    try{
      setLoginStatus('Checking login…');
      const me = await fetchJSON(api('/api/me'));
      setAuthed(true, me);
      setLoginStatus('');
    }catch(err){
      console.error(err);
      if (handleAuthError(err)) return;
      setAuthed(false);
      setLoginStatus('Please login to continue.');
    }
  }

  // ---------------- Wire events ----------------
  authLogin?.addEventListener('click', ()=>{ location.href = loginUrl(); });
  authLogout?.addEventListener('click', doLogout);
  authLogoutInApp?.addEventListener('click', doLogout);

  els.settingsBtn?.addEventListener('click', openSettings);
  closeBtn?.addEventListener('click', closeSettings);
  modal?.querySelector('.kmodal__backdrop')?.addEventListener('click', closeSettings);

  uiSet.qualityBox?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-q]');
    if (!btn) return;
    uiSet.qualityBox.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });

  saveBtn?.addEventListener('click', ()=>{
    const quality = uiSet.qualityBox?.querySelector('button.active')?.dataset.q || 'BEST';
    const fileFormat = sanitizeFileFormat(uiSet.fileFormat?.value || 'auto');

    const s = {
      fileFormat,
      fileName:   (uiSet.fileName?.value || '').trim(),
      quality,
      thumbOnly:  !!uiSet.thumbOnly?.checked
    };

    saveSettings(s);
    closeSettings();
  });

  els.input?.addEventListener('input', onInput);
  els.input?.addEventListener('paste', ()=>setTimeout(onInput,0));
  els.downloadBtn?.addEventListener('click', doDownload);
  els.downloadPlBtn?.addEventListener('click', doDownloadPlaylist);

  // ---------------- Init ----------------
  hideResults();
  enableDownload(false);
  setGate(false);
  setLoginStatus('Please login to continue.');
  refreshMe().then(async ()=>{
    if (auth.isAuthed){
      await refreshStats();
      setInterval(refreshStats, 30000);
    }
  });
})();

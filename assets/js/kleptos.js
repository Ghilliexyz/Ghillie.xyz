// kleptos.js
// NOTE (remember dummy): because your frontend is on ghillie.xyz and backend is on onrender.com,
// every request MUST send cookies -> `credentials: 'include'`.
// If the backend CORS isn't set to allow credentials + specific origin, login will still fail.

const DEFAULT_PROD_API = 'https://kleptos-backend.onrender.com';

// ---- API base config ----
const API_BASE =
  (typeof window !== 'undefined' && window.KLEPTOS_API) ||
  new URLSearchParams(location.search).get('api') ||
  (
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:5000'
      : DEFAULT_PROD_API
  );

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

  // Profile menu (in-app)
  const profileMenu = document.getElementById('profileMenu');
  const profileBtn = document.getElementById('profileBtn');
  const profileImg = document.getElementById('profileImg');
  const profileDropdown = document.getElementById('profileDropdown');

  // Admin UI
  const adminBtn = document.getElementById('adminBtn');
  const adminModal = document.getElementById('adminModal');
  const adminClose = document.getElementById('adminClose');
  const adminClose2 = document.getElementById('adminClose2');
  const adminBackdrop = adminModal?.querySelector('.kmodal__backdrop');
  const adminRefresh = document.getElementById('adminRefresh');
  const adminDownloadDb = document.getElementById('adminDownloadDb');
  const adminSearch = document.getElementById('adminSearch');
  const adminUsersWrap = document.getElementById('adminUsers');

  const adminState = { users: [] };

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

  // YouTube cookies UI (per-user, optional)
  const ytUI = {
    status: document.getElementById('ytCookieStatus'),
    file: document.getElementById('ytCookiesFile'),
    upload: document.getElementById('ytCookiesUpload'),
    del: document.getElementById('ytCookiesDelete'),
  };

  const auth = {
    isAuthed: false,
    isAdmin: false,
    email: null,
    remainingToday: null,
    avatarUrl: null,
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
    // remember dummy: DO NOT set Content-Type on GET/HEAD or the browser will preflight,
    // which makes CORS 10x more annoying than it needs to be.
    const method = (init?.method || 'GET').toUpperCase();

    const headers = { ...(init?.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD' && !headers['Content-Type'] && !headers['content-type']){
      headers['Content-Type'] = 'application/json';
    }

    const r = await fetch(url, {
      credentials: 'include', // IMPORTANT: send auth cookie cross-site
      ...init,
      headers
    });

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

  // remember dummy: older bits of this file still call Toast(...). Make it an alias so nothing crashes.
  const Toast = (title, body, type) => showToast(title, body, type);

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
    const returnTo = location.href;
    return api('/auth/login?returnTo=' + encodeURIComponent(returnTo));
  }

  function setGate(isLoggedIn){
    if (loginGate) loginGate.hidden = !!isLoggedIn;
    if (appGate) appGate.hidden = !isLoggedIn;
  }

  function setAuthed(ok, me){
    auth.isAuthed = !!ok;

    if (!ok){
      auth.email = null;
      auth.remainingToday = null;
      auth.avatarUrl = null;
      auth.isAdmin = false;
      auth.isBanned = false;
      auth.banReason = null;

      if (adminBtn) adminBtn.hidden = true;
      setGate(false);
      return;
    }

    auth.email = me?.email || null;
    auth.remainingToday = me?.remainingToday ?? null;
    auth.isAdmin = !!me?.isAdmin;
    auth.avatarUrl = me?.avatarUrl || null;
    auth.isBanned = !!me?.isBanned;
    auth.banReason = me?.banReason || null;

    if (authEmailInApp) authEmailInApp.textContent = auth.email || '-';
    refreshYtCookieStatus();

    if (quotaRemainingInApp) quotaRemainingInApp.textContent = (auth.remainingToday ?? 0).toString();

    if (profileImg){
      if (auth.avatarUrl){
        profileImg.src = auth.avatarUrl;
        profileImg.style.display = 'block';
      }else{
        profileImg.removeAttribute('src');
        profileImg.style.display = 'none';
      }
    }

    if (adminBtn) adminBtn.hidden = !auth.isAdmin;

    setGate(true);
  }

  async function refreshMe(){
    try{
      const me = await fetchJSON(api('/api/me'));
      setAuthed(true, me);
      return me;
    }catch(err){
      console.error(err);
      setAuthed(false);
      return null;
    }
  }

  async function refreshStats(){
    try{
      const st = await fetchJSON(api('/api/stats'));
      if (els.total) els.total.textContent = fmtCount(st.publicStats?.totalDownloads);
      if (els.today) els.today.textContent = fmtCount(st.publicStats?.downloadsToday);
      if (quotaRemainingInApp) quotaRemainingInApp.textContent = fmtCount(st.quota?.remainingToday);
    }catch(err){
      console.error(err);
    }
  }

  function handleAuthError(err){
    if (!err) return false;

    if (err.status === 401 || String(err.message||'').includes('401')){
      setAuthed(false);
      setLoginStatus('Please login.');
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
    try{
      await fetch(api('/auth/logout'), {
        method:'POST',
        credentials: 'include'
      });
    }catch{}
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

  // -------- YouTube cookies (per-user, optional) --------
  async function refreshYtCookieStatus(){
    if (!ytUI.status) return;
    ytUI.status.textContent = 'Checking…';

    try{
      const st = await fetchJSON(api('/api/youtube-cookies'));
      if (!st.enabled){
        ytUI.status.textContent = 'Disabled (server not configured)';
        return;
      }
      ytUI.status.textContent = st.hasCookies
        ? `Enabled (uploaded ${st.updatedAtUtc || ''})`
        : 'Not uploaded';
    }catch(e){
      ytUI.status.textContent = 'Failed to check';
    }
  }

  async function uploadYtCookies(){
    if (!ytUI.file?.files?.length){
      showToast('Upload failed', 'Pick a cookies.txt file first.', 'error');
      return;
    }

    const f = ytUI.file.files[0];
    const fd = new FormData();
    fd.append('file', f);

    const r = await fetch(api('/api/youtube-cookies'), {
      method: 'POST',
      credentials: 'include',
      body: fd
    });

    if (!r.ok){
      const t = await r.text().catch(()=> 'Upload failed');
      throw new Error(t);
    }

    showToast('YouTube cookies', 'Uploaded for your account.', 'success');
    await refreshYtCookieStatus();
  }

  async function deleteYtCookies(){
    await fetchJSON(api('/api/youtube-cookies'), { method:'DELETE' });
    showToast('YouTube cookies', 'Removed.', 'success');
    await refreshYtCookieStatus();
  }

  function openSettings(){
    const s = loadSettings();
    refreshYtCookieStatus();
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

  // Wire YouTube cookie buttons
  ytUI.upload?.addEventListener('click', ()=> uploadYtCookies().catch(e=>showToast('Upload failed', String(e.message||e), 'error')));
  ytUI.del?.addEventListener('click', ()=> deleteYtCookies().catch(e=>showToast('Remove failed', String(e.message||e), 'error')));

  // ---------------- Admin modal ----------------
  // remember dummy: flip this to true while doing frontend work locally
  // const FORCE_SHOW_APP = true;

  // if (FORCE_SHOW_APP) {
  //   setGate(true);
  //   setAuthed(true, { email: 'dev@local', isAdmin: true, remainingToday: 9999 });
  //   // openAdmin();
  //   openSettings();
  //   setLoginStatus('DEV MODE (auth bypassed)');
  //   return; // skip auth checks
  // }
  // ---------------- Metadata fetch on input ----------------
  const onInput = debounce(async ()=>{
    const v = (els.input?.value || '').trim();
    if (!isProbablyUrl(v)){
      hideResults(); enableDownload(false); showPlUI(false);
      return;
    }

    setMetaLoading(true, 'Collecting data…');
    try{
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
      const msg = String(err.message||err);
      const lower = (msg || '').toLowerCase();
      const isBotCheck =
      lower.includes("sign in to confirm you’re not a bot") ||
      lower.includes("sign in to confirm you're not a bot") ||
      lower.includes("not a bot") && lower.includes("sign in");
    if (isBotCheck) {
      showToast('YouTube needs verification', 'Open Settings → upload cookies.txt (per-user) to continue.\nFor help ask the Developer', 'error');
    } else {
      showToast('Failed to fetch info', msg, 'error');
    }
      hideResults(); enableDownload(false);
    }finally{
      setMetaLoading(false);
    }
  }, 250);

  // ---------------- Download single -------
  async function doDownload(){
    const v = (els.input?.value || '').trim();
    if (!isProbablyUrl(v)){
      showToast('Invalid link', 'Paste a valid link first.', 'error');
      return;
    }

    setDlLoading(true, 'Downloading…');
    enableDownload(false);

    try{
      const options = buildOptionsFromSettings();

      const res = await fetch(api('/api/download'), {
        method:'POST',
        credentials: 'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ url: v, options })
      });

      if (res.status === 401){
        setAuthed(false);
        return;
      }

      if (!res.ok){
        const txt = await res.text().catch(()=>res.statusText);
        throw new Error(txt || res.statusText);
      }

      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition');
      const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(dispo || '');
      const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(dispo || '');
      const nameFromHeader = star ? decodeURIComponent(star[1].replace(/["']/g,'')) : (plain ? plain[2] : null);

      const suggested = nameFromHeader || 'download - Kleptos';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = suggested;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);

      showToast('Done', 'Download started.');
      await refreshMe();
      await refreshStats();
    }catch(e){
      console.error(e);
      const msg = String(e.message||e);
      if (msg.includes("Sign in to confirm") || msg.toLowerCase().includes("not a bot")){
        showToast('YouTube needs verification', 'Open Settings → upload cookies.txt (per-user) to continue.', 'error');
      } else {
        showToast('Download failed', msg, 'error');
      }
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
        credentials: 'include',
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
      const msg = String(e.message||e);
      if (msg.includes("Sign in to confirm") || msg.toLowerCase().includes("not a bot")){
        showToast('YouTube needs verification', 'Open Settings → upload cookies.txt (per-user) to continue.', 'error');
      } else {
        showToast('Download failed', msg, 'error');
      }
    }finally{
      setDlLoading(false);
      if (els.downloadPlBtn) els.downloadPlBtn.disabled = false;
    }
  }

  // ---------------- Helpers you already have (unchanged) ----------------
  // buildOptionsFromSettings(), renderMeta(), admin stuff, etc.
  // (Keep your existing implementations below this point.)

  // ---------------- Wiring ----------------
  authLogin?.addEventListener('click', ()=>{ location.href = loginUrl(); });
  authLogoutInApp?.addEventListener('click', doLogout);

  els.settingsBtn?.addEventListener('click', openSettings);
  closeBtn?.addEventListener('click', closeSettings);
  modal?.querySelector('.kmodal__backdrop')?.addEventListener('click', closeSettings);

  saveBtn?.addEventListener('click', ()=>{
    const s = loadSettings();
    s.fileFormat = uiSet.fileFormat?.value || 'auto';
    s.fileName = uiSet.fileName?.value || '';
    s.thumbOnly = !!uiSet.thumbOnly?.checked;

    if (uiSet.qualityBox){
      const active = uiSet.qualityBox.querySelector('button.active');
      s.quality = active?.dataset?.q || 'BEST';
    }

    saveSettings(s);
    closeSettings();
  });

  uiSet.qualityBox?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if (!btn) return;
    [...uiSet.qualityBox.querySelectorAll('button')].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });

  els.input?.addEventListener('input', onInput);
  els.downloadBtn?.addEventListener('click', doDownload);
  els.downloadPlBtn?.addEventListener('click', doDownloadPlaylist);

  // initial boot
  refreshMe().then(()=> refreshStats());
})();

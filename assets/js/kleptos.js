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
  const denyGate = document.getElementById('denyGate');
  const denyLogout = document.getElementById('denyLogout');
  const denyStatus = document.getElementById('denyStatus');
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
    const r = await fetch(url, {
      credentials: 'include', // IMPORTANT: send auth cookie cross-site
      headers: { 'Content-Type':'application/json' },
      ...init
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
    // IMPORTANT: send the FULL absolute URL back to the server,
    // so after Google callback it returns to your ghillie.xyz page, not onrender.
    const returnTo = location.href;
    return api('/auth/login?returnTo=' + encodeURIComponent(returnTo));
  }

  function setGate(isLoggedIn){
    // remember dummy: keep denyGate off unless we explicitly show it
    if (denyGate) denyGate.hidden = true;
    if (loginGate) loginGate.hidden = !!isLoggedIn;
    if (appGate) appGate.hidden = !isLoggedIn;
  }

  function isNotWhitelisted(err){
    if (!err) return false;
    const status = err.status || 0;
    if (status !== 403) return false;
    const body = String(err.body || err.message || '');
    return /not_whitelisted/i.test(body) || /not whitelisted/i.test(body);
  }

  function showDenied(msg){
    // same layout as login screen, but you're hard-blocked
    if (loginGate) loginGate.hidden = true;
    if (appGate) appGate.hidden = true;
    if (denyGate) denyGate.hidden = false;
    if (denyStatus) denyStatus.textContent = msg || 'You are not whitelisted.';
  }
// remember dummy: flip this to true while doing frontend work locally
//   const FORCE_SHOW_APP = true;

// if (FORCE_SHOW_APP) {
//     setGate(true);
//     // openSettings();
//     setLoginStatus('DEV MODE (auth bypassed)');
//     return; // skip auth checks
//   }

  function setAuthed(ok, me){
    auth.isAuthed = !!ok;

    if (!ok){
      auth.email = null;
      auth.remainingToday = null;
      auth.avatarUrl = null;
      auth.isAdmin = false;
      auth.isBanned = false;
      auth.banReason = null;

      if (authUser) authUser.hidden = true;
      if (authLogin) authLogin.hidden = false;
      if (adminBtn) adminBtn.hidden = true;
      if (adminModal) adminModal.setAttribute('aria-hidden','true');

      setGate(false);
      setLoginStatus('Checking login…');
      setProfileMenuOpen(false);
      return;
    }

    auth.email = me?.email ?? null;
    // remember dummy: backend calls this remainingTokens now, but older builds used remainingToday
    auth.remainingToday = (me?.remainingTokens ?? me?.remainingToday) ?? null;
    auth.avatarUrl = me?.avatarUrl ?? me?.picture ?? null;
    auth.isBanned = !!me?.isBanned;
    auth.banReason = me?.banReason ?? null;

    if (authLogin) authLogin.hidden = true;
    if (authUser) authUser.hidden = false;

    if (authEmail) authEmail.textContent = auth.email || '—';
    if (quotaRemaining) quotaRemaining.textContent = (auth.remainingToday ?? '—').toString();

    if (authEmailInApp) authEmailInApp.textContent = auth.email || '—';
    if (quotaRemainingInApp) quotaRemainingInApp.textContent = (auth.remainingToday ?? '—').toString();

    // admin button (server enforced, UI is just a convenience)
    if (adminBtn) adminBtn.hidden = !auth.isAdmin;

    // profile image (optional)
    if (profileImg){
      profileImg.src = auth.avatarUrl || '/assets/img/favicon.png';
      profileImg.alt = auth.email ? `Profile: ${auth.email}` : 'Profile';
    }

    if (auth.isBanned){
      setGate(false);
      setLoginStatus(auth.banReason || 'Your account is banned.');
      setProfileMenuOpen(false);
      return;
    }

    setGate(true);
    setLoginStatus('');
  }

  function setProfileMenuOpen(open){
    if (!profileMenu) return;
    profileMenu.classList.toggle('open', !!open);
    if (profileBtn) profileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function handleAuthError(err){
    // Whitelist lockout (backend returns 403 + not_whitelisted)
    if (isNotWhitelisted(err)){
      showDenied('You are not whitelisted.');
      return true;
    }

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
  // ---------------- Admin modal ----------------
  async function loadAdminUsers(){
    if (!adminUsersWrap) return;
    adminUsersWrap.textContent = 'Loading users…';

    try{
      const raw = await fetchJSON(api('/api/admin/users'));
      const users = Array.isArray(raw) ? raw : (raw.users || raw.data || []);
      adminState.users = users;
      const q = (adminSearch?.value || '').trim().toLowerCase();

      const filtered = !q ? users : users.filter(u => {
        const email = (u.email || '').toLowerCase();
        const sub = (u.sub || u.googleSub || '').toLowerCase();
        return email.includes(q) || sub.includes(q);
      });

      renderAdminUsers(filtered);
    }catch(err){
      console.error(err);
      if (handleAuthError(err)) return;
      adminUsersWrap.textContent = 'Failed to load users.';
      Toast('Admin', 'Failed to load users (check backend admin endpoints).');
    }
  }

  function renderAdminUsers(users){
    if (!adminUsersWrap) return;
    adminUsersWrap.innerHTML = '';

    if (!users || users.length === 0){
      const d = document.createElement('div');
      d.className = 'muted';
      d.textContent = 'No users found.';
      adminUsersWrap.appendChild(d);
      return;
    }

    users.forEach(u => {
      const userId = u.userId ?? u.id ?? null;
      const email = u.email ?? '—';
      const sub = u.sub ?? u.googleSub ?? '—';
      const dailyQuota = u.dailyQuota ?? u.tokensPerDay ?? 25;
      const usedToday = u.usedToday ?? 0;
      const remaining = (u.remainingTokens ?? u.remainingToday ?? Math.max(0, (dailyQuota||0) - (usedToday||0)));

      const row = document.createElement('div');
      row.className = 'adminUserRow';

      // top
      const top = document.createElement('div');
      top.className = 'adminRowTop';

      const ident = document.createElement('div');
      ident.className = 'adminIdent';

      const emailEl = document.createElement('div');
      emailEl.className = 'adminEmail';
      emailEl.textContent = email;

      const subEl = document.createElement('div');
      subEl.className = 'adminSub';
      subEl.textContent = sub;

      ident.appendChild(emailEl);
      ident.appendChild(subEl);

      const pill = document.createElement('span');
      pill.className = 'pill ' + (u.isBanned ? 'bad' : 'good');
      pill.textContent = u.isBanned ? 'BANNED' : 'OK';

      top.appendChild(ident);
      top.appendChild(pill);

      // mid
      const mid = document.createElement('div');
      mid.className = 'adminRowMid';
      mid.innerHTML = `Used today: <b>${usedToday}</b> • Remaining: <b>${remaining}</b>`;

      // quota editor + actions
      const actions = document.createElement('div');
      actions.className = 'adminActions';

      const quotaWrap = document.createElement('div');
      quotaWrap.className = 'adminQuota';

      const qLabel = document.createElement('span');
      qLabel.textContent = 'Tokens/day:';

      const qInput = document.createElement('input');
      qInput.type = 'number';
      qInput.min = '0';
      qInput.step = '1';
      qInput.value = String(dailyQuota);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn secondary small';
      saveBtn.type = 'button';
      saveBtn.textContent = 'Save';

      saveBtn.addEventListener('click', async ()=>{
        const n = Number(qInput.value);
        if (!Number.isFinite(n) || n < 0){
          Toast('Admin', 'Enter a valid number.');
          return;
        }
        try{
          await adminSetQuota(userId, sub, n);
          Toast('Admin', `Updated tokens/day to ${n}.`);
          await loadAdminUsers();
        }catch(err){
          console.error(err);
          Toast('Admin', 'Failed to update quota.');
        }
      });

      quotaWrap.appendChild(qLabel);
      quotaWrap.appendChild(qInput);
      quotaWrap.appendChild(saveBtn);

      const banBtn = document.createElement('button');
      banBtn.className = 'btn secondary small danger';
      banBtn.type = 'button';
      banBtn.textContent = u.isBanned ? 'Unban' : 'Ban';

      banBtn.addEventListener('click', async ()=>{
        try{
          if (u.isBanned){
            if (!confirm(`Unban ${email}?`)) return;
            await adminUnban(userId, sub);
          }else{
            const reason = prompt(`Ban reason for ${email} (optional):`, '');
            if (reason === null) return; // cancelled
            await adminBan(userId, sub, reason || null);
          }
          await loadAdminUsers();
        }catch(err){
          console.error(err);
          Toast('Admin', 'Ban/unban failed.');
        }
      });

      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn secondary small';
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset usage';

      resetBtn.addEventListener('click', async ()=>{
        if (!confirm(`Reset used-today counter for ${email}?`)) return;
        try{
          await adminResetUsage(userId, sub);
          await loadAdminUsers();
        }catch(err){
          console.error(err);
          Toast('Admin', 'Reset usage failed.');
        }
      });

      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn secondary small';
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear downloads';

      clearBtn.addEventListener('click', async ()=>{
        if (!confirm(`Delete ALL download logs for ${email}? This cannot be undone.`)) return;
        try{
          await adminClearDownloads(userId, sub);
          await loadAdminUsers();
        }catch(err){
          console.error(err);
          Toast('Admin', 'Clear downloads failed.');
        }
      });

      actions.appendChild(quotaWrap);
      actions.appendChild(banBtn);
      actions.appendChild(resetBtn);
      actions.appendChild(clearBtn);

      row.appendChild(top);
      row.appendChild(mid);
      row.appendChild(actions);

      adminUsersWrap.appendChild(row);
    });
  }

  async function adminSetQuota(userId, sub, dailyQuota){
    return fetchJSON(api('/api/admin/set-quota'), {
      method: 'POST',
      body: JSON.stringify({ userId, sub, dailyQuota })
    });
  }
  async function adminBan(userId, sub, reason){
    return fetchJSON(api('/api/admin/ban'), {
      method: 'POST',
      body: JSON.stringify({ userId, sub, reason })
    });
  }
  async function adminUnban(userId, sub){
    return fetchJSON(api('/api/admin/unban'), {
      method: 'POST',
      body: JSON.stringify({ userId, sub })
    });
  }
  async function adminResetUsage(userId, sub){
    return fetchJSON(api('/api/admin/reset-usage'), {
      method: 'POST',
      body: JSON.stringify({ userId, sub })
    });
  }
  async function adminClearDownloads(userId, sub){
    return fetchJSON(api('/api/admin/clear-downloads'), {
      method: 'POST',
      body: JSON.stringify({ userId, sub })
    });
  }

  function openAdmin(){
    if (!auth.isAdmin){
      Toast('Admin', 'Admin only.');
      return;
    }
    adminModal?.setAttribute('aria-hidden','false');
    loadAdminUsers();
  }
  function closeAdmin(){ adminModal?.setAttribute('aria-hidden','true'); }



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
        credentials: 'include', // IMPORTANT
        headers:{ 'Content-Type':'application/json', 'Accept':'application/octet-stream' },
        body: JSON.stringify({ url: v, options })
      });

      const ctype = (res.headers.get('Content-Type') || '').toLowerCase();

      if (res.status === 401){
        setAuthed(false);
        return;
      }

      if (res.status === 403){
        const txt = await res.text().catch(()=> '');
        if (/not_whitelisted/i.test(txt) || /not whitelisted/i.test(txt)){
          showDenied('You are not whitelisted.');
          return;
        }
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
        credentials: 'include', // IMPORTANT
        headers:{ 'Content-Type':'application/json', 'Accept':'application/zip' },
        body: JSON.stringify({ url: v, options })
      });

      const ctype = (res.headers.get('Content-Type') || '').toLowerCase();

      if (res.status === 401){
        setAuthed(false);
        return;
      }

      if (res.status === 403){
        const txt = await res.text().catch(()=> '');
        if (/not_whitelisted/i.test(txt) || /not whitelisted/i.test(txt)){
          showDenied('You are not whitelisted.');
          return;
        }
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

      if (isNotWhitelisted(err)){
        showDenied('You are not whitelisted.');
        return;
      }

      if (handleAuthError(err)) return;

      // Common: CORS/credentials misconfig shows as a plain TypeError in fetch().
      if (String(err?.message||'').toLowerCase().includes('failed to fetch')){
        setAuthed(false);
        setLoginStatus('Can\'t reach the API (CORS/cookies). Check backend CORS + SameSite=None cookies.');
        return;
      }

      setAuthed(false);
      setLoginStatus('Checking login…');
    }
  }

  // ---------------- Wire events ----------------
  authLogin?.addEventListener('click', ()=>{ location.href = loginUrl(); });
  authLogout?.addEventListener('click', doLogout);
  authLogoutInApp?.addEventListener('click', doLogout);
  denyLogout?.addEventListener('click', doLogout);

  // Profile menu interactions (click to open/close; no hover so you can actually reach the Logout button)
  profileBtn?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    const open = !(profileMenu?.classList.contains('open'));
    setProfileMenuOpen(open);
  });

  profileDropdown?.addEventListener('click', (e)=> e.stopPropagation());

  document.addEventListener('click', ()=> setProfileMenuOpen(false));
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') setProfileMenuOpen(false); });

  
  adminBtn?.addEventListener('click', openAdmin);
  adminClose?.addEventListener('click', closeAdmin);
  adminClose2?.addEventListener('click', closeAdmin);
  adminBackdrop?.addEventListener('click', closeAdmin);
  adminRefresh?.addEventListener('click', loadAdminUsers);
  adminSearch?.addEventListener('input', ()=>{
    // remember dummy: filter locally so you aren't slamming the backend while typing
    const q = (adminSearch?.value || '').trim().toLowerCase();
    const users = adminState.users || [];
    const filtered = !q ? users : users.filter(u => {
      const email = (u.email || '').toLowerCase();
      const sub = (u.sub || u.googleSub || '').toLowerCase();
      return email.includes(q) || sub.includes(q);
    });
    renderAdminUsers(filtered);
  });

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
  setLoginStatus('Checking login…');
  refreshMe().then(async ()=>{
    if (auth.isAuthed){
      await refreshStats();
      setInterval(refreshStats, 30000);
    }
  });
})();

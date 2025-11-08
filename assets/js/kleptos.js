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
    total: document.getElementById('downloadCountTotal'),
    today: document.getElementById('downloadCountToday'),
    thumbImg: document.getElementById('thumbnailPreview'),
    metaBar: document.getElementById('metaProgress'),
    dlBar: document.getElementById('dlProgress'),
    toast: document.getElementById('toast')
  };

  // ---- Toast ----
  function showToast(title, body, kind=''){
    if (!els.toast) return;
    els.toast.className = 'toast' + (kind ? ' ' + kind : '');
    els.toast.querySelector('.title').textContent = title || '';
    els.toast.querySelector('.body').textContent = body || '';
    els.toast.hidden = false;
    setTimeout(()=>{ els.toast.hidden = true; }, 5000);
  }

  // ---- Cookies for settings ----
  function setCookie(name, value, days=365){
    const d=new Date(); d.setTime(d.getTime()+days*864e5);
    document.cookie=`${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  }
  function getCookie(name){
    const k=name+"="; for(let c of document.cookie.split(';')){
      while(c[0]===' ') c=c.slice(1);
      if(c.indexOf(k)===0) return decodeURIComponent(c.slice(k.length));
    } return null;
  }

  const DEFAULT_SETTINGS = {
    fileFormat: 'auto',  // auto | mp4 | mkv | webm | audio:mp3 | ...
    fileName:   '',
    quality:    'BEST',  // Low | Medium | High | BEST
    thumbOnly:  false
  };

  function loadSettings(){
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(getCookie('kleptos_settings')||'{}')) }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings(s){ setCookie('kleptos_settings', JSON.stringify(s)); }

  // ---- Helpers ----
  const debounce=(fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const isProbablyUrl=(s)=>{ try{ const u=new URL(s); return !!u.protocol&&!!u.host; }catch{return false;} };
  const fetchJSON=async(url,opts)=>{ const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts}); if(!r.ok) throw new Error((await r.text())||r.statusText); return r.json(); };

  function enableDownload(ok){ if(els.downloadBtn){ els.downloadBtn.disabled = !ok; } }
  function showResults(){ if(els.results) els.results.style.display=''; }
  function hideResults(){ if(els.results) els.results.style.display='none'; clearMeta(); }

  // ---- Progress bars (simple) ----
  function setMetaLoading(on){
    if (els.metaBar){
      els.metaBar.hidden = !on;
      const fill = els.metaBar.querySelector('.fill'); if (fill) fill.style.width = on ? '25%' : '0%';
    }
  }
  function setDlLoading(on){
    if (els.dlBar){
      els.dlBar.hidden = !on;
      const fill = els.dlBar.querySelector('.fill'); if (fill) fill.style.width = on ? '25%' : '0%';
    }
  }

  // ---- Metadata render ----
  function clearMeta(){
    if(!els.results) return;
    els.results.querySelector('h2').textContent = '';
    const a = els.results.querySelector('a'); a.textContent=''; a.href='#';
    if (els.thumbImg){ els.thumbImg.removeAttribute('src'); els.thumbImg.alt=''; }
    els.results.querySelectorAll('.videoInfo p').forEach(p=>p.textContent='');
  }

  function renderMeta(meta){
    const titleEl = els.results.querySelector('h2');
    const chanEl  = els.results.querySelector('a');
    const infoEls = els.results.querySelectorAll('.videoInfo p');

    const durStr = meta.durationSeconds ? new Date(meta.durationSeconds*1000).toISOString().substring(11,19) : '—';
    const views  = meta.viewCount?.toLocaleString?.() ?? '—';
    const likes  = meta.likeCount?.toLocaleString?.() ?? '—';
    const date   = meta.uploadDate ? new Date(meta.uploadDate).toLocaleDateString() : '—';
    const chan   = meta.uploader || 'Unknown';
    const chanUrl= meta.uploaderUrl || meta.channelUrl || '#';
    const thumb  = meta.thumbnail || '';

    titleEl.textContent = meta.title || '';
    chanEl.textContent = chan; chanEl.href = chanUrl;

    if (els.thumbImg){
      if (thumb){ els.thumbImg.src = thumb; els.thumbImg.alt = meta.title ? `Thumbnail: ${meta.title}` : 'Video thumbnail'; }
      else { els.thumbImg.removeAttribute('src'); els.thumbImg.alt = 'No thumbnail available'; }
    }
    if (infoEls.length >= 4){
      infoEls[0].textContent = date ? `${date} •` : '';
      infoEls[1].textContent = durStr !== '—' ? `${durStr} •` : '';
      infoEls[2].textContent = views !== '—' ? `${views} views •` : '';
      infoEls[3].textContent = likes !== '—' ? `${likes} likes •` : '';
    }
  }

  // ---- Metadata fetch on input ----
  let HAS_META = false, lastMetaUrl = '';
  const onInput = debounce(async ()=>{
    const v = els.input?.value?.trim() || '';
    HAS_META = false; enableDownload(false); hideResults(); setMetaLoading(false);
    if (!isProbablyUrl(v)) return;
    if (v === lastMetaUrl) { showResults(); HAS_META = true; enableDownload(true); return; }

    try{
      setMetaLoading(true);
      const meta = await fetchJSON(api('/api/metadata'), { method:'POST', body: JSON.stringify({ url: v }) });
      renderMeta(meta); showResults(); HAS_META = true; lastMetaUrl = v; enableDownload(true);
    }catch(err){
      console.error(err); showToast('Failed to fetch info', String(err.message||err), 'error');
      HAS_META = false; enableDownload(false); hideResults();
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

  function openSettings(){
    const s = loadSettings();
    modal?.setAttribute('aria-hidden', 'false');
    uiSet.fileFormat.value = s.fileFormat || 'auto';
    uiSet.fileName.value   = s.fileName || '';
    uiSet.thumbOnly.checked= !!s.thumbOnly;
    [...uiSet.qualityBox.querySelectorAll('button')].forEach(b=>b.classList.toggle('active', b.dataset.q === (s.quality || 'BEST')));
  }
  function closeSettings(){ modal?.setAttribute('aria-hidden', 'true'); }

  els.settingsBtn?.addEventListener('click', openSettings);
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
    Low:    'worst',
    Medium: 'bv*[height<=480]+ba/b[height<=480]/b',
    High:   'bv*[height<=1080]+ba/b[height<=1080]/b',
    BEST:   'bestvideo*+bestaudio/best/best'
  };
  const clean = (o)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined && v!==null && v!==''));

  function buildOptionsFromSettings(){
    const s = loadSettings();

    if (s.thumbOnly) {
      return clean({ thumbnailOnly: true, fileName: s.fileName || undefined });
    }

    let audioOnly = false, audioFormat, container, format;

    if (s.fileFormat.startsWith('audio:')){
      audioOnly   = true;
      audioFormat = s.fileFormat.split(':')[1];
      format      = 'bestaudio/best';
    } else {
      container = (s.fileFormat === 'auto') ? '' : s.fileFormat;           // send only if non-empty
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

  // ---- Browser save helpers ----
  function getFilenameFromDisposition(dispo){
    if (!dispo) return null;
    const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(dispo);
    if (star) return decodeURIComponent(star[1].replace(/["']/g,''));
    const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(dispo);
    return plain ? plain[2] : null;
  }

  async function saveBlob(blob, suggestedName){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = suggestedName || 'download';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // ---- Download ----
  if (els.downloadBtn){
    els.downloadBtn.addEventListener('click', async ()=>{
      const v = els.input?.value?.trim() || '';
      if (!isProbablyUrl(v)){ showToast('Invalid link', 'Paste a valid link first.', 'error'); return; }

      enableDownload(false); setDlLoading(true);

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
        const nameFromHeader = getFilenameFromDisposition(dispo);
        await saveBlob(blob, nameFromHeader || 'download');

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

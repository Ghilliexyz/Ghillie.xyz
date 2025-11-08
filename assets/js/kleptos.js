// Drop-in client logic for Kleptos without changing your design.
// --- API base config (works local now, easy to swap later) ---
const API_BASE =
  (typeof window !== 'undefined' && window.KLEPTOS_API) ||
  new URLSearchParams(location.search).get('api') ||
  ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:5000' : '');

const api = (p) => `${API_BASE}${p}`;

(() => {
  const els = {
    root: document.querySelector('#kleptos') || document.body,
    input: document.querySelector('#kleptos .urlInput, .urlInput'),
    downloadBtn: document.querySelector('#downloadBtn, #kleptos #downloadBtn'),
    settingsBtn: document.querySelector('#settings, #kleptos #settings'),
    results: document.querySelector('#kleptos .urlResults, .urlResults'),
    total: document.querySelector('#downloadCountTotal, #kleptos [data-total-downloads], [data-total-downloads], #totalDownloads'),
    today: document.querySelector('#downloadCountToday, #kleptos [data-downloads-today], [data-downloads-today], #downloadsToday'),
    thumbImg: document.getElementById('thumbnailPreview') || document.querySelector('#kleptos .thumbnail, .thumbnail'),
  };

  // ---- state ----
  let HAS_META = false;
  let lastMetaUrl = '';

  // ---- cookies for settings (unchanged) ----
  function setCookie(name, value, days=365){ const d=new Date(); d.setTime(d.getTime()+days*864e5); document.cookie=`${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`; }
  function getCookie(name){ const k=name+"="; for(let c of document.cookie.split(';')){ while(c[0]===' ') c=c.slice(1); if(c.indexOf(k)===0) return decodeURIComponent(c.slice(k.length)); } return null; }
  const DEFAULTS = { format:"bestvideo*+bestaudio/best", audioOnly:false, embedThumbnail:false, filenameTemplate:"%(title).200B-%(id)s.%(ext)s" };
  let SETTINGS; try{ SETTINGS={...DEFAULTS, ...(JSON.parse(getCookie('kleptosSettings')||'{}'))}; }catch{ SETTINGS={...DEFAULTS}; }
  if (els.settingsBtn){
    els.settingsBtn.addEventListener('click', ()=>{
      const fmt = prompt("yt-dlp format string:", SETTINGS.format); if (fmt!==null) SETTINGS.format=fmt;
      SETTINGS.audioOnly = !!confirm("Audio-only download? OK = Yes, Cancel = No");
      SETTINGS.embedThumbnail = !!confirm("Embed thumbnail (where supported)? OK = Yes, Cancel = No");
      const fn = prompt("Filename template:", SETTINGS.filenameTemplate); if (fn!==null) SETTINGS.filenameTemplate=fn;
      setCookie('kleptosSettings', JSON.stringify(SETTINGS)); alert("Settings saved to cookies.");
    });
  }

  // ---- utils ----
  const debounce=(fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const isProbablyUrl=(s)=>{ try{ const u=new URL(s); return !!u.protocol&&!!u.host; }catch{return false;} };
  const fetchJSON=async(url,opts)=>{ const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts}); if(!r.ok) throw new Error((await r.text())||r.statusText); return r.json(); };

  function enableDownload(ok){
    if(!els.downloadBtn) return;
    els.downloadBtn.disabled = !ok;
    els.downloadBtn.classList.toggle('disabled', !ok);
  }

  // ---- show/hide results so no placeholders appear initially ----
  function hideResults(){ if(els.results) els.results.style.display='none'; clearMeta(); }
  function showResults(){ if(els.results) els.results.style.display=''; }

  // ---- clear + render meta ----
  function clearMeta(){
    if(!els.results) return;
    const titleEl = els.results.querySelector('h2');
    const chanEl  = els.results.querySelector('a'); // ← select anchor regardless of href
    const infoEls = els.results.querySelectorAll('.videoInfo p');
    if (titleEl) titleEl.textContent = '';
    if (chanEl) { chanEl.textContent = ''; chanEl.href = '#'; } // don't remove href attribute
    if (infoEls && infoEls.length >= 4){ infoEls[0].textContent=''; infoEls[1].textContent=''; infoEls[2].textContent=''; infoEls[3].textContent=''; }
    if (els.thumbImg){ els.thumbImg.removeAttribute('src'); els.thumbImg.alt=''; }
  }

  function renderMeta(meta){
    if(!els.results) return;
    const titleEl = els.results.querySelector('h2');
    const chanEl  = els.results.querySelector('a'); // ← stable selection
    const infoEls = els.results.querySelectorAll('.videoInfo p');

    const durStr = meta.durationSeconds ? new Date(meta.durationSeconds*1000).toISOString().substring(11,19) : '—';
    const views  = meta.viewCount?.toLocaleString?.() ?? '—';
    const likes  = meta.likeCount?.toLocaleString?.() ?? '—';
    const date   = meta.uploadDate ? new Date(meta.uploadDate).toLocaleDateString() : '—';
    const chan   = meta.uploader || 'Unknown';
    const chanUrl= meta.uploaderUrl || meta.channelUrl || '#';
    const thumb  = meta.thumbnail || '';

    if (titleEl) titleEl.textContent = meta.title || '';
    if (chanEl) { chanEl.textContent = chan; chanEl.href = chanUrl; }
    if (els.thumbImg){
      if (thumb){ if (els.thumbImg.src !== thumb) els.thumbImg.src = thumb; els.thumbImg.alt = meta.title ? `Thumbnail: ${meta.title}` : 'Video thumbnail'; }
      else { els.thumbImg.removeAttribute('src'); els.thumbImg.alt = 'No thumbnail available'; }
    }
    if (infoEls && infoEls.length >= 4){
      infoEls[0].textContent = date ? `${date} •` : '';
      infoEls[1].textContent = durStr !== '—' ? `${durStr} •` : '';
      infoEls[2].textContent = views !== '—' ? `${views} views •` : '';
      infoEls[3].textContent = likes !== '—' ? `${likes} likes •` : '';
    }
  }

  // ---- input: only enable Download AFTER meta is shown; no duplicate fetch on blur ----
  const onInput = debounce(async ()=>{
    const v = els.input?.value?.trim() || '';
    // Any edit invalidates current meta until re-fetched
    HAS_META = false;
    enableDownload(false);
    hideResults();

    if (!isProbablyUrl(v)) return;
    // Guard: don't refetch if URL hasn't changed
    if (v === lastMetaUrl) { showResults(); HAS_META = true; enableDownload(true); return; }

    try{
      const meta = await fetchJSON(api('/api/metadata'), { method:'POST', body: JSON.stringify({ url: v }) });
      renderMeta(meta);
      showResults();
      HAS_META = true;
      lastMetaUrl = v;
      enableDownload(true);
    }catch(err){
      console.error(err);
      HAS_META = false;
      enableDownload(false);
      hideResults();
    }
  }, 300);

  // wire
  if (els.input){
    els.input.addEventListener('input', onInput);
    els.input.addEventListener('paste', ()=>setTimeout(onInput,0));
    // IMPORTANT: no 'change' handler (it fires on blur and caused the duplicate fetch)
  }

  if (els.downloadBtn){
    els.downloadBtn.addEventListener('click', async ()=>{
      const v = els.input?.value?.trim() || '';
      if (!HAS_META || !isProbablyUrl(v)){
        alert('Paste a valid link first so we can load the details.');
        return;
      }
      enableDownload(false);
      try{
        const payload = { url: v, options: {
          format: SETTINGS.format,
          audioOnly: SETTINGS.audioOnly,
          embedThumbnail: SETTINGS.embedThumbnail,
          filenameTemplate: SETTINGS.filenameTemplate
        }};
        await fetchJSON(api('/api/download'), { method:'POST', body: JSON.stringify(payload) });
        refreshStats();
        alert('Download complete.');
      }catch(e){
        alert('Download failed: ' + e.message);
      }finally{
        enableDownload(HAS_META && isProbablyUrl(els.input?.value?.trim() || ''));
      }
    });
  }

  async function refreshStats(){
    try{
      const s = await fetchJSON(api('/api/stats'));
      if (els.total) els.total.textContent = (s.totalDownloads ?? 0).toLocaleString();
      if (els.today) els.today.textContent = (s.downloadsToday ?? 0).toLocaleString();
    }catch{}
  }

  // initial
  hideResults();
  enableDownload(false);
  refreshStats();
  setInterval(refreshStats, 30000);
})();

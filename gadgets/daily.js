(function(){
  // ------- small utils -------
  const pad2 = n => String(n).padStart(2,'0');
  const fmtHMS = secs => {
    if (secs < 0) secs = 0;
    const h = Math.floor(secs/3600);
    const m = Math.floor((secs%3600)/60);
    const s = Math.floor(secs%60);
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  };
  const isWeekend = d => { const x = d.getDay(); return x===0 || x===6; };
  function targetTodayAt(hours, minutes){
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  }

  // External script loader (file:// friendly)
  const _extLoaded = new Set();
  function loadExternalScriptOnce(src, check, timeoutMs=8000){
    return new Promise((resolve,reject)=>{
      if (_extLoaded.has(src) && check()) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = ()=> {
        const start = Date.now();
        (function waitReady(){
          if (check()) { _extLoaded.add(src); resolve(); }
          else if (Date.now()-start > timeoutMs) reject(new Error('Timeout waiting for '+src));
          else setTimeout(waitReady,100);
        })();
      };
      s.onerror = ()=> reject(new Error('Failed to load '+src));
      document.head.appendChild(s);
    });
  }

  // IP providers
  function getIPGeoFromGeoPlugin(maxWaitMs=4000){
    return new Promise(resolve=>{
      const start = Date.now();
      (function poll(){
        const ok = typeof geoplugin_latitude==='function' && typeof geoplugin_longitude==='function';
        if (ok){
          const lat = parseFloat(geoplugin_latitude());
          const lng = parseFloat(geoplugin_longitude());
          const cc = (typeof geoplugin_countryCode==='function' && geoplugin_countryCode()) || 'NA';
          if (isFinite(lat) && isFinite(lng)) return resolve({lat,lng,country:(cc||'NA').trim(), source:'GeoPlugin'});
        }
        if (Date.now()-start>maxWaitMs) resolve(null); else setTimeout(poll,120);
      })();
    });
  }
// ✅ HTTPS + local-safe IP-based geolocation

  async function ipGeoRace(totalMs=4500){
    const timeout = new Promise(r=>setTimeout(()=>r(null), totalMs));
    const p1 = getIPGeoFromGeoPlugin(totalMs-200);
    const p2 = ipApiJSONP(totalMs-200);
    const winner = await Promise.race([p1,p2,timeout]);
    return winner || null;
  }

  // Method picker
  function pickMethod(country, lat, lng){
    const map = {
      US:'ISNA', CA:'ISNA',
      EG:'Egypt', SA:'Makkah', IR:'Tehran',
      IN:'Karachi', PK:'Karachi', BD:'Karachi',
      GB:'MWL', UK:'MWL', NL:'MWL', IT:'MWL', FR:'MWL', ES:'MWL', DE:'MWL',
      ID:'MWL', MY:'MWL', SG:'MWL', BN:'MWL', TR:'MWL', AU:'MWL', NZ:'MWL', JP:'MWL', CN:'MWL', KR:'MWL'
    };
    if (country && country!=='NA' && map[country]) return map[country];
    if (typeof lat==='number' && typeof lng==='number'){
      if (lat>=5 && lat<=83 && lng>=-170 && lng<=-50) return 'ISNA'; // N. America
    }
    return 'MWL';
  }

  // PrayTimes compute (Shafe‘i Asr)
  function computeTimes(date, lat, lng, method){
    prayTimes.setMethod(method);
    prayTimes.adjust({ asr: 'Standard' }); // Shafe‘i
    return prayTimes.getTimes(date, [lat,lng]);
  }

  // Next Fajr as Date (today or tomorrow)
  function nextFajrDate(lat, lng, method){
    const now = new Date();
    const tToday = computeTimes(now, lat, lng, method);
    const [fh, fm] = tToday.fajr.split(':').map(x=>parseInt(x,10));
    const fajrToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), fh, fm, 0, 0);
    if (now < fajrToday) return fajrToday;
    const tomorrow = new Date(now.getTime() + 86400000);
    const tTomorrow = computeTimes(tomorrow, lat, lng, method);
    const [th, tm] = tTomorrow.fajr.split(':').map(x=>parseInt(x,10));
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), th, tm, 0, 0);
  }

  function mount(host, ctx){
    host.innerHTML = `
      <div id="badge" class="muted" style="margin-bottom:6px;"></div>
      <div id="rows"></div>
      <div class="footer muted fineprint" id="pt-mini"></div>
    `;
    const rowsEl = host.querySelector('#rows');
    const badge  = host.querySelector('#badge');
    const mini   = host.querySelector('#pt-mini');

    // local state
    const state = {
      lat: null, lng: null, country: 'NA', source: '',
      method: 'MWL',
      targets: { t5: null, teod: null, tfaj: null }, // Date objects
      weekend: false
    };

	// Load PrayTimes + GeoPlugin (protocol-safe)
	const libs = Promise.all([
		loadExternalScriptOnce(httpSafe('praytimes.org/code/v2/js/PrayTimes.js'), ()=> typeof prayTimes!=='undefined')
	]);

    function computeTargets(){
      const now = new Date();
      state.weekend = isWeekend(now);

      // 5 pm (weekdays only)
      state.targets.t5   = state.weekend ? null : targetTodayAt(17,0);
      // EOD 10:30 pm
      state.targets.teod = targetTodayAt(22,30);
      // Fajr (needs pray times)
      state.targets.tfaj = nextFajrDate(state.lat, state.lng, state.method);
    }

    function render(){
      const now = new Date();
      const rows = [];

      // Build rows dynamically with show/expired logic
      const defs = [
        { key:'t5',   label:'Time Until 5 pm', show: !state.weekend, expiresAt: state.targets.t5 },
        { key:'teod', label:'Time Until EOD',  show: true,           expiresAt: state.targets.teod },
        { key:'tfaj', label:'Time Until Fajr', show: true,           expiresAt: state.targets.tfaj },
      ];

      // determine expired flags and current
      let currentKey = 'tfaj';
      for (const r of defs){
        if (!r.show || !(r.expiresAt instanceof Date)) { r.expired = true; continue; }
        r.expired = (now >= r.expiresAt);
      }
      const firstActive = defs.find(r => r.show && !r.expired);
      if (firstActive) currentKey = firstActive.key;

      // rows HTML
      const html = defs.map(r=>{
        if (!r.show) return '';
        let status = 'Expired';
        let klass  = r.expired ? 'expired' : 'ok';
        if (!r.expired && r.expiresAt instanceof Date) {
          const secs = Math.max(0, Math.floor((r.expiresAt.getTime() - now.getTime())/1000));
          status = fmtHMS(secs);
        }
        const current = (r.key === currentKey) ? ' current' : '';
        return `
          <div class="row${current} ${klass}">
            <div class="label">${r.label}</div>
            <div class="status">${status}</div>
          </div>
        `;
      }).join('');

      rowsEl.innerHTML = html;
      badge.textContent = state.weekend ? 'Weekend' : 'Weekday';
	  
		// ✅ Guard to avoid toFixed() crash when lat/lng not yet resolved
		if (state.lat == null || state.lng == null || isNaN(state.lat) || isNaN(state.lng)) {
		mini.textContent = 'Location unavailable';
		return;
		}

		mini.textContent  = `Method: ${state.method} · Country: ${state.country} · Lat: ${state.lat.toFixed(3)}, Lng: ${state.lng.toFixed(3)}${state.source ? ' · Source: '+state.source : ''}`;
    }

    async function boot(){
      try {
        await libs;
        // IP geo (race); if both fail, Cairo
        const ip = await ipGeoRace(4500);
		const geo = await window.getBestGeo({ ipTimeoutMs: 4500 });
		state.lat = geo.lat; state.lng = geo.lng; state.country = geo.country || 'NA'; state.source = geo.source || '';
        state.method = pickMethod(state.country, state.lat, state.lng);
        computeTargets();
        render();
      } catch (e) {
        rowsEl.innerHTML = `<div class="muted">Could not initialize milestones.</div>`;
        console.error(e);
      }
    }

    // Tick once per second
    const tick = setInterval(()=>{
      if (!(isFinite(state.lat) && isFinite(state.lng))) return;
      // Recompute Fajr target every minute (cheap) and on day change
      const now = new Date();
      if (now.getSeconds()===0) state.targets.tfaj = nextFajrDate(state.lat, state.lng, state.method);
      render();
    }, 1000);

    // Refresh everything at midnight & when tab re-activates
    let lastDay = (new Date()).getDate();
    const dayChk = setInterval(()=>{
      const d = (new Date()).getDate();
      if (d !== lastDay){
        lastDay = d;
        computeTargets();
        render();
      }
    }, 60*1000);

    document.addEventListener('visibilitychange', ()=> { if (!document.hidden) { computeTargets(); render(); } });

    // start
    boot();

    return ()=>{ clearInterval(tick); clearInterval(dayChk); };
  }

  // expose
  window.GADGETS = window.GADGETS || {};
  window.GADGETS.daily = { mount };
})();

(function(){
  // ------- tiny helpers (scoped) -------
  const pad2 = n => String(n).padStart(2,'0');
  function to12h(tStr){ // "13:07" -> "1:07 PM"
    const [hStr,mStr] = tStr.split(':'); let h = +hStr, m = +mStr;
    const ampm = h >= 12 ? 'PM' : 'AM'; h = h%12; if (h===0) h=12;
    return `${h}:${pad2(m)} ${ampm}`;
  }

  // Load external script once (HTTP-first), then call check() to verify global is ready
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

  // Geo: provider 1 (GeoPlugin via globals)
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

  // Race both IP providers, take first success
  async function ipGeoRace(totalMs=4500){
    const timeout = new Promise(r=>setTimeout(()=>r(null), totalMs));
    const p1 = getIPGeoFromGeoPlugin(totalMs-200);
    const p2 = ipApiJSONP(totalMs-200);
    const winner = await Promise.race([p1,p2,timeout]);
    return winner || null;
  }

  // Method picker: country overrides, else region fallback (ISNA for N. America), else MWL
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

  // Compute times (Shafe‘i Asr)
  function computeTimes(date, lat, lng, method){
    // global prayTimes from PrayTimes.js
    prayTimes.setMethod(method);
    prayTimes.adjust({ asr: 'Standard' }); // Shafe‘i (shadow=1)
    return prayTimes.getTimes(date, [lat,lng]);
  }

  // ------- Gadget API -------
  function mount(host, ctx){
    host.innerHTML = `
      <div class="footer muted fineprint" id="pt-status"></div>
      <div id="pt-rows" style="margin-top:8px;"></div>
    `;
    const statusEl = host.querySelector('#pt-status');
    const rowsEl   = host.querySelector('#pt-rows');

    const state = { lat:null, lng:null, country:'NA', method:'MWL', source:'', times:null };

    // Load external libs (HTTP-first): PrayTimes + GeoPlugin
    const loadLibs = Promise.all([
      loadExternalScriptOnce(httpSafe('praytimes.org/code/v2/js/PrayTimes.js'), () => typeof prayTimes !== 'undefined')
    ]);

    function renderRows(){
      if (!state.times) return;
      const t = state.times;
      const now = new Date();

  // Build the ordered list with today's Date objects for comparison
      const items = [
        { key:'fajr',    en:'Fajr',    ar:'الفجر',   time: t.fajr },
        { key:'sunrise', en:'Sunrise', ar:'الشروق',  time: t.sunrise },
        { key:'dhuhr',   en:'Dhuhr',   ar:'الظهر',   time: t.dhuhr },
        { key:'asr',     en:'Asr',     ar:'العصر',   time: t.asr },
        { key:'maghrib', en:'Maghrib', ar:'المغرب',  time: t.maghrib },
        { key:'isha',    en:'Isha',    ar:'العشاء',  time: t.isha }
      ].map(r => {
        const [hh, mm] = r.time.split(':').map(Number);
        r.dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
        return r;
      });

  // Determine the "current" prayer (most recent ≤ now)
      let currentIdx = items.findIndex(r => r.dt > now) - 1;
  if (currentIdx < 0) currentIdx = items.length - 1;        // before Fajr → treat as Isha
  const nextIdx = (currentIdx + 1) % items.length;          // after Isha → wraps to Fajr

  // Render rows: arrow appears only on the current row (in the middle gap)
      const html = items.map((r, idx) => {
        const isActive = idx === currentIdx;
        return `
          <div class="g-row${isActive ? ' active' : ''}">
            <div class="g-label">${r.en} (${r.ar})</div>
            <div class="g-marker">${isActive ? '▶' : ''}</div>
            <div class="g-value">${to12h(r.time)}</div>
          </div>
          ${isActive ? `
            <div id="pt-countdown" class="g-subvalue">
              <div>⏳ Time Left</div>
              <div id="pt-remaining">--:--:--</div>
            </div>` : ''}
        `;
      }).join('');

      rowsEl.innerHTML = html;

  // Status line (unchanged)
      statusEl.textContent =
        `Method: ${state.method} · Country: ${state.country} · ` +
        `Lat: ${state.lat.toFixed(3)}, Lng: ${state.lng.toFixed(3)}` +
        `${state.source ? ' · Source: ' + state.source : ''}`;

  // Start / restart the 1s countdown for the NEXT prayer
      if (state._ptCountdownTimer) clearInterval(state._ptCountdownTimer);

      state._ptCountdownTimer = setInterval(() => {
        const now2 = new Date();

    // Next prayer Date (today, or tomorrow if already passed)
        const next = new Date(now2);
        const [nh, nm] = items[nextIdx].time.split(':').map(Number);
        next.setHours(nh, nm, 0, 0);
        if (next < now2) next.setDate(next.getDate() + 1);

        let diff = Math.floor((next - now2) / 1000);
        if (diff < 0) diff = 0;

        const H = Math.floor(diff / 3600);
        const M = Math.floor((diff % 3600) / 60);
        const S = diff % 60;

        const remaining = document.getElementById('pt-remaining');
        if (remaining)
          remaining.textContent = `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}:${String(S).padStart(2,'0')}`;

    // When countdown hits zero, re-run refresh() to advance the highlight
        if (diff === 0) {
          clearInterval(state._ptCountdownTimer);
          state._ptCountdownTimer = null;
          refresh();
        }
      }, 1000);
    }

    async function refresh(){
      const now = new Date();
      if (!(isFinite(state.lat) && isFinite(state.lng))) return;
      state.method = pickMethod(state.country, state.lat, state.lng);
      state.times  = computeTimes(now, state.lat, state.lng, state.method);
      renderRows();
    }

    // Boot: load libs → get IP geo (race) → compute & render
    (async function boot(){
      try {
        await loadLibs;
        // Try to reuse cached coords from settings later if you want; for now, do fresh IP race
        const geo = await window.getBestGeo({ ipTimeoutMs: 4500 });
        state.lat = geo.lat; state.lng = geo.lng; state.country = geo.country || 'NA'; state.source = geo.source || '';
        await refresh(); await refresh();

        // 🌍 Update info tooltip once location known
        const cityHint = `${state.country || 'Unknown'} @ ${state.lat.toFixed(2)}, ${state.lng.toFixed(2)}`;
        window.GADGETS.prayers.info = `Location: ${cityHint}`;
        // Notify loader to refresh tooltip (optional)
        //ctx.bus.dispatchEvent(new CustomEvent('gadgets:update'));
      } catch(err){
        statusEl.textContent = 'Could not load prayer time dependencies.';
        console.error(err);
      }
    })();

    // Periodic refresh (lightweight)
    const halfHour = setInterval(refresh, 30*60*1000);
    // Snap after midnight / when tab returns
    let lastDay = (new Date()).getDate();
    const tick = setInterval(()=>{
      const d = new Date().getDate();
      if (d !== lastDay){ lastDay = d; refresh(); }
    }, 60*1000);
    document.addEventListener('visibilitychange', ()=> { if (!document.hidden) refresh(); });

    return ()=>{ clearInterval(halfHour); clearInterval(tick); };
  }

  // 🆕 Info handler: toggles the status line visibility
  function onInfoClick(ctx, { body }){
    const statusEl = body.querySelector('#pt-status');
    if (!statusEl) return;
    const hidden = statusEl.style.display === 'none';
    statusEl.style.display = hidden ? '' : 'none';
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.prayers = {
    info: 'Determining location…',
    mount,
    onInfoClick
  };
})();

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
  // Geo: provider 2 (ip-api JSONP)
  function ipApiJSONP(maxWaitMs=4000){
    return new Promise(resolve=>{
      const cb = 'ipcb_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
      const done = v=>{ try{ delete window[cb]; }catch{} resolve(v); };
      window[cb] = resp=>{
        if (resp && resp.status==='success' && isFinite(resp.lat) && isFinite(resp.lon)){
          done({lat:resp.lat, lng:resp.lon, country:(resp.countryCode||'NA'), source:'ip-api'});
        } else done(null);
      };
      const s = document.createElement('script');
      s.src = 'http://ip-api.com/json/?fields=status,countryCode,lat,lon&callback='+cb;
      s.onerror = ()=> done(null);
      document.head.appendChild(s);
      setTimeout(()=>done(null), maxWaitMs);
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
      loadExternalScriptOnce('http://praytimes.org/code/v2/js/PrayTimes.js', ()=> typeof prayTimes!=='undefined'),
      loadExternalScriptOnce('http://www.geoplugin.net/javascript.gp', ()=> typeof geoplugin_countryCode==='function')
      .catch(()=>{}) // ip-api will cover if this fails
    ]);

    function renderRows(){
      if (!state.times) return;
      const t = state.times;
      const L = [
        ['Fajr','الفجر', t.fajr],
        ['Sunrise','الشروق', t.sunrise],
        ['Dhuhr','الظهر', t.dhuhr],
        ['Asr','العصر', t.asr],
        ['Maghrib','المغرب', t.maghrib],
        ['Isha','العشاء', t.isha]
      ];
      rowsEl.innerHTML = L.map(([en,ar,val]) =>
        `<div class="row"><div class="label">${en} (${ar})</div><div class="status">${to12h(val)}</div></div>`
      ).join('');
      statusEl.textContent = `Method: ${state.method} · Country: ${state.country} · Lat: ${state.lat.toFixed(3)}, Lng: ${state.lng.toFixed(3)}${state.source ? ' · Source: '+state.source : ''}`;
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
        const ip = await ipGeoRace(4500);
        if (ip){
          state.lat = ip.lat; state.lng = ip.lng; state.country = ip.country || 'NA'; state.source = ip.source || '';
        } else {
          // hard fallback Cairo
          state.lat = 30.0444; state.lng = 31.2357; state.country = 'EG'; state.source = 'CairoFallback';
        }
        await refresh();
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

  // Attach gadget
  window.GADGETS = window.GADGETS || {};
  window.GADGETS.prayers = { mount };
})();

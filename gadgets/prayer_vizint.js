(function(){
  // === Manifest (API 1.0) ===
  const manifest = {
    _api: "1.0",
    _class: "PrayerTimes",
    _type: "singleton",
    _id: "Local",
    _ver: "v0.1.0",
    verBlurb: "First VizInt-native version with Chronus/Atlas capabilities, countdown, and info panel.",
    bidi: "ltr",

    label: "Prayer Times",
    publisher: "K&Co.",
    //contact_url: "https://example.com/prayer_vizint",
    //contact_socials: "x:@vizint; ig:@vizint",

    // Capabilities drive preloads/badges
    capabilities: ["chronus","atlas","network"],

    description: "Accurate daily prayer times with live countdown. Auto-detects location (device/IP) and chooses a sensible calculation method."
  };

  // Helpers
  const pad2 = n => String(n).padStart(2,'0');
  const to12h = (h, m) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = (h % 12) || 12;
    return `${h12}:${pad2(m)} ${ampm}`;
  };

  // External libs: PrayTimes
  async function ensurePrayTimes() {
    if (typeof window.loadExternalScriptOnce === 'function') {
      await loadExternalScriptOnce(httpSafe('praytimes.org/code/v2/js/PrayTimes.js'),
        () => typeof window.prayTimes !== 'undefined');
      return;
    }
    // Fallback single-load
    await new Promise((resolve, reject) => {
      if (typeof prayTimes !== 'undefined') return resolve();
      const s = document.createElement('script');
      s.src = httpSafe('praytimes.org/code/v2/js/PrayTimes.js'); s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load PrayTimes.js'));
      document.head.appendChild(s);
    });
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
      if (lat>=5 && lat<=83 && lng>=-170 && lng<=-50) return 'ISNA'; // N. America box
    }
    return 'MWL';
  }

  function mount(host, ctx){
    host.innerHTML = `
      <div class="footer muted fineprint" id="ptz-status"></div>
      <div id="ptz-rows" style="margin-top:8px;"></div>
    `;
    const statusEl = host.querySelector('#ptz-status');
    const rowsEl   = host.querySelector('#ptz-rows');

    const state = { lat:null, lng:null, country:'NA', city:'', method:'MWL', source:'', times:null };

    // Read global diag visibility
    const slot = host.closest('.gadget-slot');
    if (slot) slot._showDiagnostics = !!ctx.settings.showDiag;

    // Preloads by capability (Chronus/Atlas are future hooks; we use shared getBestGeo for now)
    const boot = (async () => {
      await ensurePrayTimes();

      // Geo via shared (uses https geo-permission-if-granted, else IP JSONP)
      const geo = await (window.getBestGeo ? window.getBestGeo({ ipTimeoutMs: 4500 }) : null);
      if (geo) {
        state.lat = geo.lat; state.lng = geo.lng;
        state.country = geo.country || 'NA';
        state.city = geo.city || '';
        state.source = geo.source || '';
      }

      refresh();
      refresh(); // ensure highlight advances immediately

      // Tooltip on the icon (if available)
      const cityLabel = state.city ? `${state.city}, ${state.country}` : `${state.country}`;
      const tooltipInfo = `${cityLabel} · Lat ${state.lat?.toFixed(2)}, Lng ${state.lng?.toFixed(2)}`;
      const mySlot = host.closest('.gadget-slot');
      if (mySlot) {
        const icon = mySlot.querySelector('.g-title .g-iconbox');
        if (icon) icon.title = `Location: ${tooltipInfo}`;
      }
    })().catch(err => {
      console.error(err);
      statusEl.textContent = 'Could not load prayer time dependencies.';
    });

    function computeTimes(date){
      prayTimes.setMethod(state.method);
      prayTimes.adjust({ asr: 'Standard' }); // Shafe‘i
      return prayTimes.getTimes(date, [state.lat, state.lng]);
    }

    function renderRows(){
      if (!state.times) return;
      const now = new Date();
      const order = [
        { key:'fajr', en:'Fajr', ar:'الفجر' },
        { key:'sunrise', en:'Sunrise', ar:'الشروق' },
        { key:'dhuhr', en:'Dhuhr', ar:'الظهر' },
        { key:'asr', en:'Asr', ar:'العصر' },
        { key:'maghrib', en:'Maghrib', ar:'المغرب' },
        { key:'isha', en:'Isha', ar:'العشاء' }
      ];

      const items = order.map(r => {
        const [hh, mm] = String(state.times[r.key]).split(':').map(Number);
        const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
        return { ...r, hh, mm, dt };
      });

      let currentIdx = items.findIndex(r => r.dt > now) - 1;
      if (currentIdx < 0) currentIdx = items.length - 1;
      const nextIdx = (currentIdx + 1) % items.length;

      rowsEl.innerHTML = items.map((r, idx) => `
        <div class="g-row${idx===currentIdx ? ' active' : ''}">
          <div class="g-label">${r.en} (${r.ar})</div>
          <div class="g-marker">${idx===currentIdx ? '▶' : ''}</div>
          <div class="g-value">${to12h(r.hh, r.mm)}</div>
        </div>
        ${idx===currentIdx ? `
          <div class="g-subvalue">
            <div>⏳ Time Left</div>
            <div id="ptz-remaining">--:--:--</div>
          </div>` : ''}
      `).join('');

      statusEl.textContent =
        `Method: ${state.method}` +
        (state.city ? ` · City: ${state.city}` : '') +
        ` · Country: ${state.country}` +
        ` · Lat: ${Number(state.lat).toFixed(3)}, Lng: ${Number(state.lng).toFixed(3)}` +
        `${state.source ? ' · Source: ' + state.source : ''}`;

      const visible = ctx.settings.showDiag || (slot && slot._showDiagnostics);
      statusEl.style.display = visible ? '' : 'none';

      if (state._timer) clearInterval(state._timer);
      state._timer = setInterval(() => {
        const now2 = new Date();
        const target = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), items[nextIdx].hh, items[nextIdx].mm, 0, 0);
        if (target < now2) target.setDate(target.getDate() + 1);
        let diff = Math.floor((target - now2) / 1000);
        if (diff < 0) diff = 0;
        const H = Math.floor(diff / 3600);
        const M = Math.floor((diff % 3600) / 60);
        const S = diff % 60;
        const el = host.querySelector('#ptz-remaining');
        if (el) el.textContent = `${pad2(H)}:${pad2(M)}:${pad2(S)}`;
        if (diff === 0) { clearInterval(state._timer); state._timer = null; refresh(); }
      }, 1000);
    }

    function refresh(){
      if (!(isFinite(state.lat) && isFinite(state.lng))) return;
      state.method = pickMethod(state.country, state.lat, state.lng);
      state.times  = computeTimes(new Date());
      renderRows();
    }

    document.addEventListener('visibilitychange', ()=> { if (!document.hidden) refresh(); });
    const halfHour = setInterval(refresh, 30*60*1000);

    return () => { if (state._timer) clearInterval(state._timer); clearInterval(halfHour); };
  }

  function onInfoClick(ctx, { body }) {
    const slot = body.closest('.gadget-slot');
    if (!slot) return;
    slot._showDiagnostics = !slot._showDiagnostics;
    const statusEl = body.querySelector('#ptz-status');
    if (statusEl) {
      const visible = ctx.settings.showDiag || slot._showDiagnostics;
      statusEl.style.display = visible ? '' : 'none';
    }
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.prayer_vizint = {
    manifest,
    mount,
    onInfoClick
  };
})();

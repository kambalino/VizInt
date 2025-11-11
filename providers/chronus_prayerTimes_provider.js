/*==============================================================================
| Chronus PrayerTimes Provider
| File: providers/chronus_prayerTimes_provider.js
| Tabs: hard tabs (4 spaces visual)
|
| Purpose
|   - Produce daily prayer anchors (fajr, sunrise, dhuhr, asr, maghrib, isha, fajr_next)
|     using PrayTimes.js and the active Chronus context (lat/lng/tz/method).
|
| Notes
|   - source: 'providers/chronus_prayerTimes_provider.js'
|   - category: 'religious'
|   - frame: 'daily'
|   - Returns absolute Date objects in `at`.
==============================================================================*/
(function(){
	// —— Single source of truth for prayer labels (EN + AR)
	const LABELS = {
		'prayer:fajr':      { en: 'Fajr',    ar: 'الفجر' },
		'misc:sunrise':     { en: 'Sunrise', ar: 'الشروق' },
		'prayer:dhuhr':     { en: 'Dhuhr',   ar: 'الظهر' },
		'prayer:asr':       { en: 'Asr',     ar: 'العصر' },
		'prayer:maghrib':   { en: 'Maghrib', ar: 'المغرب' },
		'prayer:isha':      { en: 'Isha',    ar: 'العشاء' },
		'prayer:fajr_next': { en: 'Fajr',    ar: 'الفجر' }
	};

	// —— Helper: safe protocol for CDN
	function httpSafe(url){
		if (location.protocol === 'file:') return 'http://' + url;
		if (location.protocol === 'https:') return 'https://' + url;
		return '//' + url;
	}

	// —— Load a script once (shared.js also exposes a similar helper; this is local fallback)
	async function loadExternalScriptOnce(src, check, timeoutMs=8000){
		try { if (check && check()) return true; } catch(_){}
		let tag = Array.from(document.scripts).find(s => s.src && s.src.endsWith(src));
		if (!tag){
			tag = document.createElement('script');
			tag.src = src;
			tag.async = true;
			document.head.appendChild(tag);
		}
		const t0 = Date.now();
		return await new Promise((resolve, reject)=>{
			function poll(){
				try{
					if (!check || check()) return resolve(true);
				}catch(_){}
				if (Date.now()-t0 >= timeoutMs) return reject(new Error('Timeout '+src));
				setTimeout(poll, 80);
			}
			tag.onload = poll;
			tag.onerror = ()=> reject(new Error('Failed '+src));
			setTimeout(poll, 0);
		});
	}

	// —— Method auto-pick (self-contained)
	function pickMethod(country, lat, lng){
		const map = {
			US:'ISNA', CA:'ISNA',
			EG:'Egypt', SA:'Makkah', IR:'Tehran',
			IN:'Karachi', PK:'Karachi', BD:'Karachi',
			GB:'MWL', UK:'MWL', NL:'MWL', IT:'MWL', FR:'MWL', ES:'MWL', DE:'MWL',
			ID:'MWL', MY:'MWL', SG:'MWL', BN:'MWL', TR:'MWL', AU:'MWL', NZ:'MWL',
			JP:'MWL', CN:'MWL', KR:'MWL'
		};
		if (country && country !== 'NA' && map[country]) return map[country];
		if (typeof lat === 'number' && typeof lng === 'number'){
			// North America geobox
			if (lat >= 5 && lat <= 83 && lng >= -170 && lng <= -50) return 'ISNA';
		}
		return 'MWL';
	}

	// —— Provider
	const NAME = 'chronus/prayerTimes';
	const Provider = {
		name: NAME,
		async provide({ context, frame, cursor }){
			if (frame !== 'daily') return [];

			// Ensure PrayTimes available
			const src = httpSafe('praytimes.org/code/v2/js/PrayTimes.js');
			try{
				await loadExternalScriptOnce(src, ()=> typeof window.prayTimes !== 'undefined', 8000);
			}catch(_){
				// fail gracefully
				return [];
			}

			const date = new Date(cursor);

			// Select method
			let method = (context && typeof context.method === 'string') ? context.method : 'auto';
			if (!method || method.toLowerCase() === 'auto'){
				method = pickMethod(context && context.country, context && context.lat, context && context.lng);
			}
			// [ADD] make the method visible to the renderer via context meta
			try { if (context && !context.method) context.method = method; } catch {}

			try { prayTimes.setMethod(method); } catch {}
			const asrMode = (context && typeof context.asr === 'string') ? context.asr : 'Standard';
			try { prayTimes.adjust({ asr: asrMode }); } catch {}

			// Times (today + tomorrow’s Fajr)
			const toDateAt = (base, hhmm) => {
				const [h,m] = (''+hhmm).split(':').map(n => +n);
				return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
			};

			const t  = prayTimes.getTimes(date, [context.lat, context.lng]);
			const t2d= new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
			const t2 = prayTimes.getTimes(t2d, [context.lat, context.lng]);

			const anchors = [
				{ id:'prayer:fajr',      at: toDateAt(date, t.fajr)    },
				{ id:'misc:sunrise',     at: toDateAt(date, t.sunrise) },
				{ id:'prayer:dhuhr',     at: toDateAt(date, t.dhuhr)   },
				{ id:'prayer:asr',       at: toDateAt(date, t.asr)     },
				{ id:'prayer:maghrib',   at: toDateAt(date, t.maghrib) },
				{ id:'prayer:isha',      at: toDateAt(date, t.isha)    },
				{ id:'prayer:fajr_next', at: toDateAt(t2d,   t2.fajr)  }
			];

			// Attach labels from the single SoT
			return anchors.map(a => {
				const lbl = LABELS[a.id] || { en: a.id, ar: '' };
				return {
					...a,
					label: lbl.en,
					labelAr: lbl.ar,
					frame: 'daily',
					category: (a.id === 'misc:sunrise') ? 'info' : 'religious',
					contextId: context.id,
					source: NAME
				};
			});
		}
	};

	if (window.Chronus && typeof window.Chronus.registerProvider === 'function') {
		window.Chronus.registerProvider(Provider);
	}

	// flag so gadgets can await this file being loaded
	window.__ChronusPrayerProviderReady = true;
})();

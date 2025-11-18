// ./lib/atlas.js — Atlas v1.2 implementation sketch
// Context: VizInt Chronus/Atlas integration
// Atlas: Location/Geo provider for Chronus gadgets
// -------------------------------------------
// Depends on:
//   - httpSafe(url)      from shared.js
//   - ipApiJSONP(ms?)   from shared.js
//
// Exposes:
//   - window.Atlas       singleton (Portal will map this into ctx.libs.Atlas)
//
// Notes:
//   - No DST / offset logic here (Chronus-only).
//   - Non-normative details are marked in comments.
//	
// Tabs: Hard
// $VER: 1.2.0
// $HISTORY:
//   - v1.2.0	2025/11/11	First version cleaved from shared.js & chronus.js
//

(function (global) {
	'use strict';

	// ------------------------
	// 0. Constants / defaults
	// ------------------------

	const LS_KEY = 'Vz:Atlas:GeoCache';

	const CHECK_INTERVAL_MS = 2 * 60 * 1000;   // 2 min (non-normative)
	const MAX_GEO_AGE_MS    = 15 * 60 * 1000;  // 15 min (within 10–30 window)
	const MIN_REFRESH_MS    = 60 * 1000;       // 1 min min gap between refreshes

	const FALLBACK_FILE    = 'file-mode';
	const FALLBACK_OFFLINE = 'offline';
	const FALLBACK_DENIED  = 'permission-denied';
	const FALLBACK_UNKNOWN = 'unknown';

	// Small curated TZ → city/country map (v1.2 only; may grow later)
	const TZ_MAP = {
		'America/Los_Angeles': { city: 'Los Angeles', country: 'US' },
		'America/New_York':    { city: 'New York',    country: 'US' },
		'Europe/London':       { city: 'London',      country: 'GB' },
		'Europe/Paris':        { city: 'Paris',       country: 'FR' },
		'Africa/Cairo':        { city: 'Cairo',       country: 'EG' },
		'Asia/Dubai':          { city: 'Dubai',       country: 'AE' },
		'Asia/Riyadh':         { city: 'Riyadh',      country: 'SA' },
		'Asia/Tokyo':          { city: 'Tokyo',       country: 'JP' },
		'Asia/Singapore':      { city: 'Singapore',   country: 'SG' }
	};

	// ------------------------
	// 1. Internal state
	// ------------------------

	/** @type {ReturnType<createGeo> & { ts?: number }} */
	let _geo = createGeo();
	let _readyResolve;
	const _ready = new Promise(resolve => { _readyResolve = resolve; });

	/** @type {Set<(geo: any) => void>} */
	const _subs = new Set();

	let _lastGeoUpdate   = 0;
	let _lastRefreshTry  = 0;
	let _lastTickTime    = Date.now();
	let _intervalHandle  = null;

	const isFileMode = (location.protocol === 'file:');
	const tzGuess = getBrowserTimeZone();
	const initialOnline = navigator.onLine !== false;

	// ------------------------
	// 2. Canonical geo object
	// ------------------------

	function createGeo() {
		return {
		city: null,
		country: null,
		tz: null,
		lat: null,
		lon: null,
		confidence: 'low',   // 'high' | 'medium' | 'low'
		fallback: FALLBACK_UNKNOWN,
		source: 'seed'       // 'device' | 'ip' | 'tz-only' | 'manual' | 'seed'
		};
	}

	function cloneGeo() {
		return { ..._geo };
	}

	function setGeo(patch, options) {
		const prev = _geo;
		_geo = { ..._geo, ...patch };
		_lastGeoUpdate = Date.now();
		if (options && options.preserveFallback && prev && prev.fallback) {
		_geo.fallback = prev.fallback;
		}
		notifySubscribers();
	}

	function notifySubscribers() {
		const snapshot = cloneGeo();
		_subs.forEach(fn => {
		try { fn(snapshot); } catch (e) { /* swallow */ }
		});
	}

	// ------------------------
	// 3. Persistence helpers
	// ------------------------

	function loadCache() {
		try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return;

		const downgraded = downgradeConfidence(parsed);
		_geo = { ...createGeo(), ...downgraded };
		_lastGeoUpdate = typeof parsed.ts === 'number' ? parsed.ts : Date.now();
		} catch {
		// ignore cache errors
		}
	}

	function saveCache() {
		try {
		const now = Date.now();
		const payload = { ..._geo, ts: now };
		localStorage.setItem(LS_KEY, JSON.stringify(payload));
		} catch {
		// ignore quota or serialization errors
		}
	}

	function downgradeConfidence(g) {
		const out = { ...g };
		switch (g.confidence) {
		case 'high':   out.confidence = 'medium'; break;
		case 'medium': out.confidence = 'low';    break;
		case 'low':
		default:       out.confidence = 'low';    break;
		}
		return out;
	}

	// ------------------------
	// 4. Environment helpers
	// ------------------------

	function getBrowserTimeZone() {
		try {
		const opts = Intl.DateTimeFormat().resolvedOptions();
		return opts.timeZone || null;
		} catch {
		return null;
		}
	}

	function isOnlineNow() {
		return navigator.onLine !== false;
	}

	function baseFallbackInit() {
		const tz = tzGuess;
		const online = initialOnline;

		const geo = createGeo();
		geo.tz = tz;

		if (tz && TZ_MAP[tz]) {
		geo.city = TZ_MAP[tz].city;
		geo.country = TZ_MAP[tz].country;
		geo.source = 'tz-only';
		}

		if (isFileMode) {
		geo.fallback = FALLBACK_FILE;
		} else if (!online) {
		geo.fallback = FALLBACK_OFFLINE;
		} else {
		geo.fallback = FALLBACK_UNKNOWN;
		}

		_geo = geo;
		_lastGeoUpdate = Date.now();
	}

	// ------------------------
	// 5. Acquisition steps
	// ------------------------

	// 5.1 Device geo (only if already granted, secure context)
	function canUseDeviceGeo() {
		if (location.protocol !== 'https:') return false;
		if (!navigator.permissions || !navigator.geolocation) return false;
		return true;
	}

	function getDeviceGeoIfGranted() {
		if (!canUseDeviceGeo()) return Promise.resolve(null);

		return navigator.permissions.query({ name: 'geolocation' }).then(status => {
		if (status.state !== 'granted') {
			// Do not prompt, fall back to IP/TZ.
			return null;
		}
		return new Promise(resolve => {
			navigator.geolocation.getCurrentPosition(
			pos => {
				if (!pos || !pos.coords) return resolve(null);
				resolve({
				lat: pos.coords.latitude,
				lon: pos.coords.longitude
				});
			},
			() => resolve(null),
			{ maximumAge: 5 * 60 * 1000, timeout: 10 * 1000 }
			);
		});
		}).catch(() => null);
	}

	// 5.2 IP geo via ipwho.is JSONP (shared.js)
	function getIpGeo(timeoutMs) {
		const fn = global.ipApiJSONP;
		if (typeof fn !== 'function') return Promise.resolve(null);
		return fn(timeoutMs || 8000); // returns {lat,lng,country,city?} or null
	}

	// 5.3 Main refresh pipeline
	function refreshGeo(reason) {
		const now = Date.now();
		if (now - _lastRefreshTry < MIN_REFRESH_MS) {
		return Promise.resolve(cloneGeo());
		}
		_lastRefreshTry = now;

		const online = isOnlineNow();
		const tz = getBrowserTimeZone() || _geo.tz || tzGuess;

		// Offline: use cache or tz-only
		if (!online) {
		if (!_geo.city && tz && TZ_MAP[tz]) {
			setGeo({
			tz,
			city: TZ_MAP[tz].city,
			country: TZ_MAP[tz].country,
			source: 'tz-only',
			confidence: 'low',
			fallback: FALLBACK_OFFLINE
			});
		} else {
			setGeo({
			tz,
			confidence: _geo.confidence || 'low',
			fallback: FALLBACK_OFFLINE
			});
		}
		saveCache();
		return Promise.resolve(cloneGeo());
		}

		// Online: device + IP in parallel
		const devicePromise = getDeviceGeoIfGranted();
		const ipPromise     = getIpGeo(8000);

		return Promise.all([devicePromise, ipPromise]).then(([device, ip]) => {
		const isDegradedEnv = isFileMode || !online;
		let patch = {};
		let fallback = null;
		let source = _geo.source;
		let confidence = _geo.confidence || 'low';

		if (device) {
			patch.lat = device.lat;
			patch.lon = device.lon;
			source = 'device';
			confidence = 'high';
		}

		if (ip) {
			// Only override device lat/lon if device is absent
			if (!device) {
			patch.lat = ip.lat;
			patch.lon = ip.lng;
			}
			patch.country = ip.country || patch.country || null;
			// ip.city might not be available in current shared.js; safe-guard:
			if (ip.city && !_geo.city) {
			patch.city = ip.city;
			}
			source = source === 'device' ? 'device' : 'ip';
			if (!device) confidence = 'medium';
		}

		if (!device && !ip) {
			// Fall back to tz-only
			if (tz && TZ_MAP[tz]) {
			patch = {
				tz,
				city: TZ_MAP[tz].city,
				country: TZ_MAP[tz].country,
				source: 'tz-only',
				confidence: 'low'
			};
			} else {
			patch = {
				tz,
				source: 'tz-only',
				confidence: 'low'
			};
			}
			fallback = isDegradedEnv ? (isFileMode ? FALLBACK_FILE : FALLBACK_UNKNOWN)
									: FALLBACK_UNKNOWN;
		} else {
			// Success path
			patch.tz = tz;
			patch.source = source;
			patch.confidence = confidence;

			if (isDegradedEnv) {
			// Preserve environmental fallback (file/offline) per spec.
			if (isFileMode) fallback = FALLBACK_FILE;
			else if (!online) fallback = FALLBACK_OFFLINE;
			} else {
			fallback = null;
			}
		}

		if (fallback !== null) {
			patch.fallback = fallback;
		}

		setGeo(patch, { preserveFallback: isDegradedEnv });
		saveCache();
		return cloneGeo();
		}).catch(() => {
		// Last-resort tz-only if everything fails
		const tz2 = tz || tzGuess;
		const patch = { tz: tz2, source: 'tz-only', confidence: 'low' };
		if (tz2 && TZ_MAP[tz2]) {
			patch.city = TZ_MAP[tz2].city;
			patch.country = TZ_MAP[tz2].country;
		}
		patch.fallback = isFileMode ? FALLBACK_FILE : FALLBACK_UNKNOWN;
		setGeo(patch, { preserveFallback: true });
		saveCache();
		return cloneGeo();
		});
	}

	// ------------------------
	// 6. Adaptive refresh loop
	// ------------------------

	function tick() {
		const now = Date.now();
		const elapsed = now - _lastTickTime;
		_lastTickTime = now;

		const visible = !document.hidden;
		if (!visible) return;

		// Detect large discontinuity → assume sleep/hibernate resume
		if (elapsed > CHECK_INTERVAL_MS * 4) {
		// Force refresh even if lastRefreshTry is recent
		_lastRefreshTry = 0;
		refreshGeo('time-discontinuity');
		return;
		}

		// Age-based refresh
		if (now - _lastGeoUpdate > MAX_GEO_AGE_MS) {
		refreshGeo('age-threshold');
		}
	}

	function attachEventListeners() {
		document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			refreshGeo('visibility');
		}
		});

		window.addEventListener('focus', () => {
		refreshGeo('focus');
		});

		window.addEventListener('online', () => {
		refreshGeo('online');
		});

		// We do not special-handle 'offline' beyond marking fallback inside refreshGeo.
	}

	function startInterval() {
		if (_intervalHandle) return;
		_intervalHandle = setInterval(tick, CHECK_INTERVAL_MS);
	}

	// ------------------------
	// 7. Public API
	// ------------------------

	const Atlas = {
		// Lifecycle
		ready: _ready,

		// High-level accessor
		getBestGeo() {
		return cloneGeo();
		},

		// Convenience getters
		getCity() {
		return _geo.city || null;
		},
		getCountry() {
		return _geo.country || null;
		},
		getLatLon() {
		if (typeof _geo.lat === 'number' && typeof _geo.lon === 'number') {
			return { lat: _geo.lat, lon: _geo.lon };
		}
		return null;
		},
		getTimeZone() {
		return _geo.tz || null;
		},
		getFallbackReason() {
		return _geo.fallback || null;
		},

		// Subscription
		subscribe(handler) {
		if (typeof handler !== 'function') return () => {};
		_subs.add(handler);
		// Immediately send current snapshot
		try { handler(cloneGeo()); } catch {}
		return () => _subs.delete(handler);
		}
	};

	// ------------------------
	// 8. Init sequence
	// ------------------------

	(function init() {
		loadCache();
		baseFallbackInit();       // tz + TZ_MAP + basic fallback
		attachEventListeners();
		startInterval();

		// Kick off first real refresh; resolve ready on first pass
		refreshGeo('boot').finally(() => {
		if (_readyResolve) _readyResolve();
		});
	})();

	// ------------------------
	// 9. Global exports & legacy alias
	// ------------------------

	global.Atlas = Atlas;

	// Back-compat alias for legacy gadgets
	if (!global.getBestGeo) {
		global.getBestGeo = function () {
		return Atlas.getBestGeo();
		};
	}

})(window);

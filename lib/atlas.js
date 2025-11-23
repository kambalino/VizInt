//	$HISTORY:
//		2025/11/23	1.2.2	U:Atlas	 Added normalizeGeoEnvelope helper & hardened IP/device geo handling
//		2025/11/13	1.2.1	U:Atlas	 Implemented cache-first boot & permission-denied fallback
//		2025/11/11	1.2.0	U:Atlas	 First version cleaved from shared.js & chronus.js
//	$VER: 1.2.2

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

	// Curated tz→city/country mapping (non-exhaustive, non-normative)
	const TZ_MAP = {
		'Europe/London':       { city: 'London',      country: 'GB' },
		'Europe/Paris':        { city: 'Paris',       country: 'FR' },
		'Europe/Berlin':       { city: 'Berlin',      country: 'DE' },
		'Europe/Rome':         { city: 'Rome',        country: 'IT' },
		'Europe/Madrid':       { city: 'Madrid',      country: 'ES' },
		'Europe/Amsterdam':    { city: 'Amsterdam',   country: 'NL' },
		'Europe/Zurich':       { city: 'Zurich',      country: 'CH' },

		'America/New_York':    { city: 'New York',    country: 'US' },
		'America/Chicago':     { city: 'Chicago',     country: 'US' },
		'America/Denver':      { city: 'Denver',      country: 'US' },
		'America/Los_Angeles': { city: 'Los Angeles', country: 'US' },
		'America/Vancouver':   { city: 'Vancouver',   country: 'CA' },
		'America/Toronto':     { city: 'Toronto',     country: 'CA' },

		'Asia/Tokyo':          { city: 'Tokyo',       country: 'JP' },
		'Asia/Singapore':      { city: 'Singapore',   country: 'SG' },
		'Asia/Dubai':          { city: 'Dubai',       country: 'AE' },
		'Asia/Riyadh':         { city: 'Riyadh',      country: 'SA' },

		'Africa/Johannesburg': { city: 'Johannesburg', country: 'ZA' },
		'Africa/Lagos':        { city: 'Lagos',       country: 'NG' },
		'Africa/Cairo':        { city: 'Cairo',       country: 'EG' },

		'UTC':                 { city: 'UTC',         country: null },
		'Etc/UTC':             { city: 'UTC',         country: null }
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

	function normalizeGeoEnvelope(input) {
		const src = (input && typeof input === 'object') ? input : {};

		function normString(v) {
			return (typeof v === 'string' && v.trim() !== '') ? v.trim() : null;
		}

		function normNumber(v) {
			if (typeof v === 'number' && Number.isFinite(v)) return v;
			if (typeof v === 'string') {
				const n = Number(v);
				if (Number.isFinite(n)) return n;
			}
			return null;
		}

		const city    = normString(src.city);
		const country = normString(src.country);
		const tz      = normString(src.tz);

		let lat = normNumber(src.lat);
		let lon = normNumber(src.lon);

		if (lat !== null && (lat < -90 || lat > 90)) {
			lat = null;
		}
		if (lon !== null && (lon < -180 || lon > 180)) {
			lon = null;
		}

		let confidence = (typeof src.confidence === 'string')
			? src.confidence.toLowerCase().trim()
			: null;

		if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
			confidence = 'low';
		}

		let fallback = (typeof src.fallback === 'string')
			? src.fallback.trim()
			: null;

		const allowedFallbacks = [
			FALLBACK_FILE,
			FALLBACK_DENIED,
			FALLBACK_OFFLINE,
			FALLBACK_UNKNOWN
		];

		if (!fallback || allowedFallbacks.indexOf(fallback) === -1) {
			fallback = null;
		}

		let source = (typeof src.source === 'string')
			? src.source.trim()
			: null;

		const allowedSources = [
			'device',
			'ip',
			'tz-only',
			'manual',
			'seed'
		];

		if (!source || allowedSources.indexOf(source) === -1) {
			source = 'manual';
		}

		let ts;
		if (typeof src.ts === 'number' && Number.isFinite(src.ts)) {
			ts = src.ts;
		}

		const envelope = {
			city,
			country,
			tz,
			lat,
			lon,
			confidence,
			fallback,
			source
		};

		if (ts !== undefined) {
			envelope.ts = ts;
		}

		return envelope;
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
			if (!raw) return false;
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return false;

			const downgraded = downgradeConfidence(parsed);
			_geo = { ...createGeo(), ...downgraded };
			_lastGeoUpdate = typeof parsed.ts === 'number' ? parsed.ts : Date.now();
			return true;
		} catch {
			// ignore cache errors
			return false;
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
	// 4. Env helpers
	// ------------------------

	function getBrowserTimeZone() {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
		} catch {
			return null;
		}
	}

	function isOnlineNow() {
		if (typeof navigator.onLine === 'boolean') {
			return navigator.onLine;
		}
		return true;
	}

	// ------------------------
	// 5. Geo acquisition pipeline
	// ------------------------

	// 5.1 Device geo (only if already granted, secure context)
	function canUseDeviceGeo() {
		if (location.protocol !== 'https:') return false;
		if (!navigator.geolocation) return false;
		if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return false;
		return true;
	}

	function getDeviceGeoIfGranted() {
		if (!canUseDeviceGeo()) return Promise.resolve(null);

		return navigator.permissions.query({ name: 'geolocation' }).then(status => {
			if (status.state === 'denied') {
				// Explicitly surface permission-denied, but preserve
				// environmental fallbacks like file-mode/offline if present.
				setGeo({ fallback: FALLBACK_DENIED }, { preserveFallback: true });
				return null;
			}
			if (status.state !== 'granted') {
				// "prompt" or unknown → do not prompt, fall back to IP/TZ.
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
		try {
			const p = fn(timeoutMs || 8000);
			return (p && typeof p.then === 'function') ? p.catch(() => null) : Promise.resolve(null);
		} catch {
			return Promise.resolve(null);
		}
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
				}, { preserveFallback: true });
			} else {
				setGeo({
					fallback: FALLBACK_OFFLINE
				}, { preserveFallback: true });
			}
			saveCache();
			return Promise.resolve(cloneGeo());
		}

		let device = null;
		let ip = null;

		return getDeviceGeoIfGranted()
			.then(d => {
				device = d;
				if (!device) {
					return getIpGeo(8000);
				}
				return null;
			})
			.then(i => {
				ip = i;

				let patch = {};
				let source = _geo.source || 'seed';
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
							tz: tz || null,
							source: 'tz-only',
							confidence: 'low'
						};
					}
				}

				// If we have tz from env or IP, enrich with TZ_MAP if missing city/country
				if (tz && TZ_MAP[tz]) {
					if (!patch.city) {
						patch.city = TZ_MAP[tz].city;
					}
					if (!patch.country) {
						patch.country = TZ_MAP[tz].country;
					}
					patch.tz = tz;
				} else if (!_geo.tz && tz) {
					patch.tz = tz;
				}

				patch.source = source;
				patch.confidence = confidence;

				// In a normal online scenario with device or IP success, we clear fallback.
				patch.fallback = null;

				setGeo(patch, { preserveFallback: isFileMode });
				saveCache();
				return Promise.resolve(cloneGeo());
			})
			.catch(() => {
				// Last-resort: tz-only, preserving file-mode if relevant.
				const lastPatch = {};
				if (tz && TZ_MAP[tz]) {
					lastPatch.tz = tz;
					lastPatch.city = TZ_MAP[tz].city;
					lastPatch.country = TZ_MAP[tz].country;
				} else if (tz) {
					lastPatch.tz = tz;
				}
				lastPatch.source = lastPatch.source || 'tz-only';
				lastPatch.confidence = 'low';
				lastPatch.fallback = isFileMode ? FALLBACK_FILE : FALLBACK_UNKNOWN;

				setGeo(lastPatch, { preserveFallback: true });
				saveCache();
				return cloneGeo();
			});
	}

	// ------------------------
	// 6. Adaptive refresh loop & events
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

		// If geo is too old, trigger a refresh
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

		// Normalization helper
		normalizeGeoEnvelope,

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
		// Load cache (if any) at boot
		loadCache();

		// Seed with tz-only if nothing else
		if (!_geo.tz && tzGuess) {
			if (TZ_MAP[tzGuess]) {
				setGeo({
					tz: tzGuess,
					city: TZ_MAP[tzGuess].city,
					country: TZ_MAP[tzGuess].country,
					source: 'tz-only',
					confidence: 'low',
					fallback: isFileMode ? FALLBACK_FILE : FALLBACK_UNKNOWN
				}, { preserveFallback: true });
			} else {
				setGeo({
					tz: tzGuess,
					source: 'tz-only',
					confidence: 'low',
					fallback: isFileMode ? FALLBACK_FILE : FALLBACK_UNKNOWN
				}, { preserveFallback: true });
			}
		}

		// Online/offline + visibility hooks
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

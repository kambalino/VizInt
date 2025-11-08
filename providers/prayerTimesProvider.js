(function(){ /*
  const NAME = 'PrayerTimesProvider';

  function hhmmToDate(baseDate, hhmm){
    const [h,m] = hhmm.split(':').map(x=>parseInt(x,10));
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m, 0, 0);
    // NOTE: For strict TZ handling, convert with the context.tz via Intl APIs if needed. */
  }

  const Provider = {
    name: NAME,
    async provide({ context, frame, cursor }){
      if (frame !== 'daily') return [];
      if (typeof prayTimes === 'undefined') throw new Error('PrayTimes.js not loaded');

      const date = new Date(cursor);

		// Autonomous method selection: if context.method is 'auto' or missing, use pickMethod
		let method = context && typeof context.method === 'string' ? context.method : 'auto';
		if (!method || method.toLowerCase() === 'auto'){
			method = pickMethod(context && context.country, context && context.lat, context && context.lng);
		}
		try { prayTimes.setMethod(method); } catch {}

		const asrMode = (context && typeof context.asr === 'string') ? context.asr : 'Standard';
		try { prayTimes.adjust({ asr: asrMode }); } catch {}


      const times = prayTimes.getTimes(date, [context.lat, context.lng]);
      const items = [
        ['fajr','Fajr', times.fajr],
        ['sunrise','Sunrise', times.sunrise],
        ['dhuhr','Dhuhr', times.dhuhr],
        ['asr','Asr', times.asr],
        ['maghrib','Maghrib', times.maghrib],
        ['isha','Isha', times.isha],
      ];

      return items.map(([id, label, hhmm]) => ({
        id: 'prayer:'+id,
        label,
        at: hhmmToDate(date, hhmm),
        frame: 'daily',
        category: 'religious',
        contextId: context.id,
        source: NAME
      }));
    }
  };

  if (window.Chronus && typeof window.Chronus.registerProvider === 'function') {
    window.Chronus.registerProvider(Provider);
  }
  window.PrayerTimesProvider = Provider;
})();
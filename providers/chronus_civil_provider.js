/*==============================================================================
| Chronus Civil Provider
| File: providers/chronus_civil_provider.js
| Tabs: hard tabs (4 spaces visual)
|
| 1) Purpose
|	- Provide “regular” civil time anchors:
|	  day:start, day:midday, day:end
|	  week:start, week:end (ISO week start = Monday)
|	  month:start, month:end
|	  year:start, year:end
|
| 2) Assumptions
|	- Uses the active context’s timezone implicitly via Date construction.
|	- Midday is 12:00 local wall-clock (placeholder; a Solar provider can refine).
|	- Week starts Monday (ISO). Configurable later.
|
| 3) Output
|	- Each anchor: { id, label, labelAr, at:Date, frame, category, contextId, source, priority }
|	- frame: 'daily' (day:*), 'weekly' (week:*), 'monthly' (month:*), 'annual' (year:*).
|	- category: 'civil'; priority: 0.
|
| 4) Diagnostics
|	- No console noise except hard failures.
|
| ★ Future hooks
|	- True solar noon via Solar provider.
|	- Configurable week start (Sunday vs Monday).
|
| History
|	- 2025-11-16: Mark provider readiness via __ChronusCivilProviderReady to support
|	  loadExternalScriptOnce() callers (e.g., Runway Viewport).
==============================================================================*/

(function(){
	if (!window.Chronus || typeof window.Chronus.registerProvider !== 'function') {
		return;
	}

	function atYMD(y,m,d,h=0,mi=0){
		return new Date(y,m,d,h,mi,0,0);
	}
	function startOfDay(d){
		return atYMD(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
	}
	function endOfDay(d){
		return atYMD(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
	}
	function midday(d){
		return atYMD(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0);
	}
	function startOfWeekISO(d){
		const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const day = (tmp.getDay() + 6) % 7; // 0=Mon
		tmp.setDate(tmp.getDate() - day);
		return atYMD(tmp.getFullYear(), tmp.getMonth(), tmp.getDate(), 0, 0);
	}
	function endOfWeekISO(d){
		const s = startOfWeekISO(d);
		const e = new Date(s);
		e.setDate(e.getDate() + 6);
		return endOfDay(e);
	}
	function startOfMonth(d){
		return atYMD(d.getFullYear(), d.getMonth(), 1, 0, 0);
	}
	function endOfMonth(d){
		return atYMD(d.getFullYear(), d.getMonth()+1, 0, 23, 59);
	}
	function startOfYear(d){
		return atYMD(d.getFullYear(), 0, 1, 0, 0);
	}
	function endOfYear(d){
		return atYMD(d.getFullYear(), 11, 31, 23, 59);
	}

	const PROVIDER = {
		name: 'chronus/civil',
		async provide({ context, frame, cursor }){
			const d = new Date(cursor);
			const out = [];
			const base = {
				category: 'civil',
				contextId: context.id,
				source: 'chronus/civil',
				priority: 0
			};

			if (frame === 'daily'){
				out.push(
					{ id:'day:start',	label:'Day Start',		labelAr:'بداية اليوم',	at:startOfDay(d),	frame:'daily',	...base },
					{ id:'day:midday',	label:'Midday',		labelAr:'منتصف اليوم',	at:midday(d),		frame:'daily',	...base },
					{ id:'day:end',	label:'Day End',		labelAr:'نهاية اليوم',	at:endOfDay(d),		frame:'daily',	...base }
				);
			}
			if (frame === 'weekly'){
				out.push(
					{ id:'week:start',	label:'Week Start',	labelAr:'بداية الأسبوع',	at:startOfWeekISO(d),	frame:'weekly',	...base },
					{ id:'week:end',	label:'Week End',	labelAr:'نهاية الأسبوع',	at:endOfWeekISO(d),	frame:'weekly',	...base }
				);
			}
			if (frame === 'monthly'){
				out.push(
					{ id:'month:start',	label:'Month Start',	labelAr:'بداية الشهر',	at:startOfMonth(d),	frame:'monthly',	...base },
					{ id:'month:end',	label:'Month End',	labelAr:'نهاية الشهر',	at:endOfMonth(d),	frame:'monthly',	...base }
				);
			}
			if (frame === 'annual'){
				out.push(
					{ id:'year:start',	label:'Year Start',	labelAr:'بداية السنة',	at:startOfYear(d),	frame:'annual',	...base },
					{ id:'year:end',	label:'Year End',	labelAr:'نهاية السنة',	at:endOfYear(d),	frame:'annual',	...base }
				);
			}
			return out;
		}
	};

	try {
		window.Chronus.registerProvider(PROVIDER);
	} catch(_){}

	// Flag so gadgets (Runway, PrayerTimes, etc.) can await this file via loadExternalScriptOnce().
	window.__ChronusCivilProviderReady = true;
})();

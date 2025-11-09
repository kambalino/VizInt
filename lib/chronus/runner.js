/*==============================================================================
| Chronus Runner
| File: lib/chronus/runner.js
| Tabs: hard tabs
|
| 1) Purpose
|	- Programmatically build sequences (“runs”) as anchors:
|		* buildSingleRun(spec)
|		* buildRecurringRun(spec)
|	- You can feed the returned anchors to Chronus.upsertAnchors(source, anchors)
|	  or expose them via a small provider.
|
| 2) Terms
|	- Run: an instantiated Blend (anchors with concrete times).
|	- Steps: ordered items with relative offsets/durations.
|
| 3) API
|	buildSingleRun({
|		id, label,
|		contextId, frame: 'daily'|'weekly'|...,
|		startAt: Date,
|		steps: [{ id, label, offsetMs, durationMs? }, ...],
|		priority? (default -1)
|	}) -> Anchor[]
|
|	buildRecurringRun({
|		id, label,
|		contextId, frame,
|		pattern: { dailyAt?: 'HH:MM', everyMinutes?: number, startDate?: Date },
|		stepTemplate: [{ id, label, offsetMs, durationMs? }, ...],
|		horizonDays?: number (default 7),
|		priority? (default -1)
|	}) -> Anchor[]
|
| 4) Output
|	- Anchors with ids like: run:{runId}:step:{stepId}:{YYYYMMDDTHHMM}
|	- category: 'run', source: 'chronus/runner'
==============================================================================*/
(function(){
	function pad2(n){ return (n<10?'0':'')+n; }

	function buildSingleRun(spec){
		const {
			id, label, contextId, frame,
			startAt, steps=[], priority=-1
		} = spec;
		const base = { category:'run', contextId, frame, source:'chronus/runner', priority };
		const out = [];
		for (const s of steps){
			const at = new Date(startAt.getTime() + (s.offsetMs||0));
			const sid = `run:${id}:step:${s.id}:${at.getFullYear()}${pad2(at.getMonth()+1)}${pad2(at.getDate())}T${pad2(at.getHours())}${pad2(at.getMinutes())}`;
			out.push({
				id: sid,
				label: s.label || s.id,
				labelAr: s.labelAr || '',
				at, frame, ...base,
				meta: { runId:id, runLabel:label, durationMs: s.durationMs||0 }
			});
		}
		out.sort((a,b)=>a.at-b.at);
		return out;
	}

	function parseHHMM(s){
		const [h,m] = String(s||'00:00').split(':').map(n=>+n);
		return { h:(h||0), m:(m||0) };
	}

	function buildRecurringRun(spec){
		const {
			id, label, contextId, frame,
			pattern={}, stepTemplate=[], horizonDays=7, priority=-1
		} = spec;
		const out = [];
		const base = { category:'run', contextId, frame, source:'chronus/runner', priority };
		const startDate = pattern.startDate ? new Date(pattern.startDate) : new Date();

		let cursor = new Date(startDate);
		for (let day=0; day<horizonDays; day++){
			if (pattern.dailyAt){
				const { h, m } = parseHHMM(pattern.dailyAt);
				const anchor0 = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), h, m, 0, 0);
				for (const s of stepTemplate){
					const at = new Date(anchor0.getTime() + (s.offsetMs||0));
					const sid = `run:${id}:step:${s.id}:${at.getFullYear()}${pad2(at.getMonth()+1)}${pad2(at.getDate())}T${pad2(at.getHours())}${pad2(at.getMinutes())}`;
					out.push({
						id: sid,
						label: s.label || s.id,
						labelAr: s.labelAr || '',
						at, frame, ...base,
						meta: { runId:id, runLabel:label, durationMs: s.durationMs||0, recurring:true }
					});
				}
			}
			// Simple minute cadence generator if requested
			if (pattern.everyMinutes && pattern.everyMinutes > 0){
				const stepMs = pattern.everyMinutes * 60 * 1000;
				const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
				const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 0, 0);
				for (let t=dayStart.getTime(); t<=dayEnd.getTime(); t+=stepMs){
					for (const s of stepTemplate){
						const at = new Date(t + (s.offsetMs||0));
						const sid = `run:${id}:step:${s.id}:${at.getFullYear()}${pad2(at.getMonth()+1)}${pad2(at.getDate())}T${pad2(at.getHours())}${pad2(at.getMinutes())}`;
						out.push({
							id: sid, label: s.label || s.id, labelAr: s.labelAr || '',
							at, frame, ...base,
							meta: { runId:id, runLabel:label, durationMs: s.durationMs||0, recurring:true }
						});
					}
				}
			}
			cursor.setDate(cursor.getDate()+1);
		}
		out.sort((a,b)=>a.at-b.at);
		return out;
	}

	window.ChronusRunner = { buildSingleRun, buildRecurringRun };
})();

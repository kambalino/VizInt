/*==============================================================================
| Chronus Sample Blender
| File: lib/chronus/blender.js
| Tabs: hard tabs
|
| Purpose
|	- Provide a helper to build a scoped blend from specific providers
|	  (e.g., 'providers/chronus_prayerTimes_provider.js' + 'providers/chronus_civil_provider.js') for the active slice.
|
| API
|	blendSubset({ contextId, frame, from?, to?, sources: string[] }) -> Anchor[]
|
| Notes
|	- Relies on Chronus.getAnchors(...) which already returns the blended list.
|	- We simply filter by .source and time window, then sort by .at.
==============================================================================*/
(function(){
	if (!window.Chronus) return;

	function blendSubset({ contextId, frame, from=null, to=null, sources=[] }){
		const all = window.Chronus.getAnchors({ contextId, frame }) || [];
		const filtered = all.filter(a => {
			if (sources.length && !sources.includes(a.source)) return false;
			if (from && a.at < from) return false;
			if (to && a.at > to) return false;
			return true;
		});
		filtered.sort((a,b)=> a.at - b.at);
		return filtered;
	}

	function pickSequenceSteps({ ids='*' } = {}){
		const all = (window.Chronus?.getSequences?.() || []);
		if (ids === '*' || !Array.isArray(ids)) return all.flatMap(s => s.steps.map(st => ({...st, sequenceId: s.id, sequenceLabel: s.label })));
		const sel = window.Chronus.getSequences({ ids });
		return sel.flatMap(s => (s.steps||[]).map(st => ({...st, sequenceId: s.id, sequenceLabel: s.label })));
	}

	window.ChronusBlender = { blendSubset, pickSequenceSteps };

})();

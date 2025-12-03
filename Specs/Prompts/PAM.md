# PAM — VizInt Project Asset Manifest
# Version: 1.2-baseline
# Maintained under VW-CXP rules (changes require a CXP Packet)

----------------------------------------------------------------------------------------------
Asset Path							| Description									| Owner ----------------------------------------------------------------------------------------------
/index.html							| Portal entrypoint, script orchestration		| U:Vz
/lib/shared.js						| Shared utilities, global-agnostic helpers		| U:Vz
/lib/portal.js						| Runtime wiring, ctx.libs assembly, lifecycle	| U:Vz
/lib/chrome.js						| UX chrome renderer (titlebars, badges, gear)	| U:Ux
/lib/settings.js					| Settings persistence (pending v1.2 refactor)	| U:Vz
/lib/registry.js					| Gadget registry + bootstrap metadata			| U:Vz

/lib/atlas.js						| Atlas engine, GeoEnvelope pipeline			| U:At
/lib/chronus.js						| Chronus engine, DST, anchors, providers		| U:Ch
/lib/nexus.js						| [TBD] Event bus + IPC							| U:Vz
/lib/core.js						| [TBD] Base utilities, version, environment	| U:Vz

/providers/chronus_civil_provider.js		| Chronus civil events provider 		| U:Cx
/providers/chronus_prayerTimes_provider.js	| Chronus prayer times events provider	| U:Cx

/gadgets/settings.js				| Settings Gadget (modal body in v1.2+)			| U:Ux

/styles/common.css					| Global visual styling							| U:Ux
/styles/chrome.css					| Chrome-specific styles						| U:Ux
/styles/gadgets/*.css				| Gadget-specific visual rules					| U:Ux

/Specs/VizInt-Atlas.md				| Atlas spec (GeoEnvelope + getBestGeo)			| U:At
/Specs/VizInt-Chronus.md			| Chronus spec (Anchors, DST, providers)		| U:Ch
/Specs/VizInt-Gadgets.md			| Gadget Authoring Guide						| U:Gx
/Specs/VizInt-Portal.md				| Portal v1.2 Spec (runtime, descriptors)		| U:Vz
/Specs/VizInt-Chrome.md				| UX Chrome Guidelines (chrome.js behaviors)	| U:Ux
/Specs/Prompts/VW-CXP_Protocol.md	| Coordination & Execution Protocol				| U:Ox
/Specs/Prompt/PAM.md				| This file										| U:Ox

-------------------------------------------------------------------------------

These things don't exist btw:

/gadgets/*/manifest.json		| Gadget manifests (authoring contract)			| U:Gx
/gadgets/*/gadget.js			| Gadget implementation							| U:Fx
/gadgets/*/spec.md				| Gadget specification & version history		| U:Fx + U:Gx
/assets/icons/*.svg				| Iconography (chrome & gadget icons)			| U:Ux
/assets/img/*.png				| Static images									| U:Ux
/gadgets/header/				| System gadget (header), non-closeable; This does not yet exist - it is hardcoded inside the portal code somewhere (where?) | U:Ux


# Notes
- Repo-wide identity and ownership governed by VW-CXP v1.4.4.
- Asset additions/removals/ownership changes MUST be executed via CXP Packets.
- `/settings.js` will be replaced or modularized during the v1.2+ settings refactor (future CXP).
- All gadgets with supportsSettings:true follow the modal-settings model once implemented.

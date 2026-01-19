window.VIZINT_VERSION = '$VER: #055';

window.VIZINT_HISTORY = [
  {
  ver: '#055',
  title: '+time to poi gadget alpha version (broken)',
  bullets: [
    '+time to poi gadget alpha version (broken)',
    'refactored gadget spec location and naming convention + Iqama gadget spec',
    'moved location of flashcards gadget',
    'Auto: version bump to #054'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#054',
  title: 'Adding Iqama Countdown gadget.',
  bullets: [
    'Adding Iqama Countdown gadget.',
    'Auto: version bump to #053'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#053',
  title: 'Update VizInt Gadget Authoring Specification to v1.2.2',
  bullets: [
    'Update VizInt Gadget Authoring Specification to v1.2.2',
    'Enhance tile movement policy to prevent header tile from being moved or swapped',
    'Improve DOM manipulation for instance reordering in settings',
    '👍/👎Easy/Hard marks',
    'Added Top Toolbar + copy / share buttons',
    'intendation',
    'portal.js: rerenderQueued settings.js: if tileOrder exists, reordering globally via reorderTile()',
    'portal.js: insertAfterPeer + reorderTile',
    'Settings: Moving to reorderTile instead of reordedInstance',
    'Flashcards Spec.md: New Toolbar & Learning Requirements',
    'Portal.js: Borked intermediate en route to new tiling model',
    'Auto: version bump to #052'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#052',
  title: 'Plumbing for multi-instance gadget detection regardless of state of parent class + rudimentary re-ordering',
  bullets: [
    'Plumbing for multi-instance gadget detection regardless of state of parent class + rudimentary re-ordering',
    'Document canonical DOM identity hooks for multi-instance gadgets',
    'rudimentary support for multi-instance gadget instantiation, removal and renaming',
    'flashcards * fix the encapsulated separators heuristic bug * cloning persisted state so multi-instance gadget do not conflict.',
    '* flashcards multi-instance support',
    'Auto: version bump to #051'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#051',
  title: '* Fixed Multi-instance * Fixed Settings Behaviour',
  bullets: [
    '* Fixed Multi-instance * Fixed Settings Behaviour',
    'Incremental changes towards rationalized MI model',
    'Auto: version bump to #050'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#050',
  title: 'css + spec & prompt md files',
  bullets: [
    'css + spec & prompt md files',
    'Auto: version bump to #049'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#049',
  title: 'Auto: version bump to #048',
  bullets: [
    'Auto: version bump to #048'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#048',
  title: 'refactor(chrome.js): enhance layout persistence and update state management',
  bullets: [
    'refactor(chrome.js): enhance layout persistence and update state management',
    'Auto: version bump to #047'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#047',
  title: 'restored the pen edit behaviour',
  bullets: [
    'restored the pen edit behaviour',
    '+ MULTI-INSTANCE SUPPORT + SETTINGS!',
    '* fixed force enable for settings * refactoring wiring for collapsed/spanWide/fullscreen * further multi-instance semantics',
    'empashize button depression. dynamically resizing white space to shrink/expand',
    '* started cleaving out the portal-owned runtime for future separation from the UX segments.',
    'Incremental unvetted version for historical purposes.',
    'clean up white space in UI',
    'Added 🆎 button to flip q → a, vs. Q&A on same side.',
    'plumbing for settings gear',
    'updated api from loader.js',
    '+Fixing resurrecting settings gadget +plumbing multi-instance support in to settings',
    'Fixed multi-instance for gadget close',
    'Multiple-instance plumbing & future support for chrome.',
    'Adding partial support for instances',
    'Establishing Historical Record - unqualified changes',
    'Establishing Historical Record - unqualified changes.',
    'Gadget name normalization and deduping - in anticipation of multi-instance gadgets',
    'settings enablement',
    'createSettingsModalShell:',
    'Added settings gear to chrome',
    'Prioritizing manifest capabilities, before falling back to registry plumbed settings thru',
    'Changed hint behaviour to onload and on-info trigger only.',
    'Added ✓ / × buttons - but they don`t work yet.',
    'Position Gadget`s own Manifest as primary source - leaving registry as a fallback.',
    'plumbing for chrome to see settings capability',
    'Adding settings support to descriptor',
    'Auto: version bump to #046'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#046',
  title: 'Clarified ambiguities and fixed errors in prior CXP Protocol format',
  bullets: [
    'Clarified ambiguities and fixed errors in prior CXP Protocol format',
    'Restored Info click affordance in tandem with portal.',
    'Restoring info-click-affordance (commented)',
    '- Introduced gadgetType/isSystem descriptor pattern (single|multi|system) for close rules. - Restored info-icon click affordance via chromeCtx.onInfoRequest. - Wired header chrome hooks (safe reset + theme toggle) cleanly from portal.',
    'Fixes to cleaving',
    'regressed edition, capturing for history until we fix.',
    'Next Gen iteration on FRTP - The CXP Protocol',
    'renamed loader.js to portal.js',
    'Cleaved chrome.js out of loader.js',
    'Auto: version bump to #045'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#045',
  title: 'Fixed URL path',
  bullets: [
    'Fixed URL path',
    'feat(FRTP): bump version to v1.3.5 and enhance versioning and history documentation',
    'Auto: version bump to #044'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#044',
  title: 'Renamed FRTP.md to FRTP-Protocol.md',
  bullets: [
    'Renamed FRTP.md to FRTP-Protocol.md',
    'feat(FRTP): update version to v1.3.4, enhance governance rules, and introduce team editing doctrine',
    'feat(chronus): update documentation and enhance API facade with legacy warnings and new utilities',
    'feat(atlas): mark tz-derived cities with ≃ to indicate lower confidence in geo data',
    'feat(flashcards): enhance CSV delimiter detection and improve UI controls for better usability + enlarged size defaults + relocated settings screen to replace gadget viewport, instead of beneath it.',
    'feat(flashcards): enhance CSV parsing and improve modal overlay styling for settings to occupy entire gadget viewport instead of flashcards content.',
    'feat(index): add atlas.js script to the HTML for enhanced functionality',
    'feat(registry): add Atlas Debug gadget to the unified gadget registry',
    'feat(flashcards): update version to v0.2.9 with silent toggleConfig after save',
    'feat(atlas): add Atlas Debug Gadget for real-time GeoEnvelope visualization',
    'feat(atlas): enhance geo handling with normalizeGeoEnvelope function and improved fallback logic',
    'feat(loader): update loader.js to v1.2.4 with factory-based lib construction and improved de-globalization',
    'feat(spec): update VizInt Chronus v1.2 specification to version 1.2.3 with backlog section, Atlas pull-model clarifications, and enhanced provider readiness semantics',
    'Avoids stomping parsed right after save',
    'feat(FRTP): add section on ownership boundaries and modification restrictions for subsystems',
    'feat(spec): introduce VizInt Gadget Authoring Specification v1.2 with enhanced manifest requirements and lifecycle overview',
    'feat(loader): enhance settings management and introduce per-instance settings',
    'Refactor VizInt Chronus v1.2 specification: streamline structure, enhance clarity, and update versioning history',
    'Add complete specification for VizInt Chronus v1.2, detailing responsibilities, architectural model, and API surface',
    'Update FRTP.md: Refine role table and add code standards section',
    'Add shared library wiring and deprecate ctx.shared shim',
    'Update Chronus version and add geo validation in PrayerTimes provider',
    'Add Atlas v1.2 implementation for location and geo services',
    'Add FRTP protocol VizInt Prompts: Chronus and Atlas',
    'Add new index-purge.html file: clean out locaStorage',
    'Moved location of Italian words reference lists: create new flashcards and master list, remove obsolete file',
    'Auto: version bump to #043'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#043',
  title: 'FIXED Runway-ViewPort but lost much functionality -- Refactor Runway Viewport: Enhance self-containment and improve rendering logic',
  bullets: [
    'FIXED Runway-ViewPort but lost much functionality -- Refactor Runway Viewport: Enhance self-containment and improve rendering logic',
    'Auto: version bump to #042'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#042',
  title: 'BADLY Broken Version - with incomplete features for future reference: Refactor runway-viewport: Improve documentation formatting, enhance configuration handling, and streamline rendering logic for better clarity and maintainability.',
  bullets: [
    'BADLY Broken Version - with incomplete features for future reference: Refactor runway-viewport: Improve documentation formatting, enhance configuration handling, and streamline rendering logic for better clarity and maintainability.',
    'Add VizInt Atlas and Portal Specifications v1.2: Define geographic context and portal runtime contract, including responsibilities, API surface, and compliance rules.',
    'Refactor VizInt System Specification: Consolidate and enhance document structure, clarify purpose, and update section organization',
    'Refactor flashcards gadget: Improve text fitting logic and enhance button event handling',
    'Refactor Chronus Civil Provider: Formally indicate \'ProviderReady\' Improve code formatting and enhance readability in documentation sections',
    'Refactor flashcards gadget: Improve code structure, enhance configuration handling, and update button elements for better accessibility and less attempt at less reloading',
    'Update flashcards gadget: Enhance HTML sanitization, improve CSV parsing, and refine configuration handling',
    'Add VizInt Portal Runtime and System Specification documents',
    'Auto: version bump to #041'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#041',
  title: 'Enhance flashcards gadget: Additional status fineprint for diminishing-random cycle for card rotation and improved timer management',
  bullets: [
    'Enhance flashcards gadget: Additional status fineprint for diminishing-random cycle for card rotation and improved timer management',
    'Update embed-web.js to version 0.3.6: add debug checkbox in popover, persist debugColors in settings, and refine comments',
    'Auto: version bump to #040'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#040',
  title: 'Update embed-web.js to version 0.3.5: refine styles, improve debug mode, and adjust default buffer settings',
  bullets: [
    'Update embed-web.js to version 0.3.5: refine styles, improve debug mode, and adjust default buffer settings',
    'Auto: version bump to #039'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#039',
  title: '* embed-web > Further brute force debugging of hover menu.',
  bullets: [
    '* embed-web > Further brute force debugging of hover menu.',
    'Auto: version bump to #038'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#038',
  title: '* embed-web > brute-force fixing for overdrawing on the hover menu & enabling on-site experimentation',
  bullets: [
    '* embed-web > brute-force fixing for overdrawing on the hover menu & enabling on-site experimentation',
    'Auto: version bump to #037'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#037',
  title: '* embed-web: > Fixed z-index depth for iframe vs. config/hover menu',
  bullets: [
    '* embed-web: > Fixed z-index depth for iframe vs. config/hover menu',
    'Auto: version bump to #036'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#036',
  title: '* embed-web: > fixing style sheets to circumvent z-ordering bug with disappearing hover menu',
  bullets: [
    '* embed-web: > fixing style sheets to circumvent z-ordering bug with disappearing hover menu',
    'Auto: version bump to #035'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#035',
  title: 'embed-web: Cleaner timer unmount hygiene',
  bullets: [
    'embed-web: Cleaner timer unmount hygiene',
    '* embed-web: > onInfoClick - as a backup for the hidden menu not working > Supports expanding hidden memory from info icon as a backup. * New, bigger Italian flashcards * VizInt Portal 1.1.md',
    'Auto: version bump to #034'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#034',
  title: 'Flashcards robust context saving/reseting/purging Implemented flush portal context',
  bullets: [
    'Flashcards robust context saving/reseting/purging Implemented flush portal context',
    'Auto: version bump to #033'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#033',
  title: '* Index.html: +code to clear localStorage if it`s kaput * +Chronus suport for sequences * + VizIntGadets.md integration guide * Updated todo * Gadgets: > Sequencer to manage sequence gallery and sequence steps > +embed-web to encapsulate pages in iframes > +Flashcards',
  bullets: [
    '* Index.html: +code to clear localStorage if it`s kaput * +Chronus suport for sequences * + VizIntGadets.md integration guide * Updated todo * Gadgets: > Sequencer to manage sequence gallery and sequence steps > +embed-web to encapsulate pages in iframes > +Flashcards',
    'Auto: version bump to #032'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#032',
  title: 'Forgotten Commit: css',
  bullets: [
    'Forgotten Commit: css',
    'Auto: version bump to #031'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#031',
  title: 'VizInt 1.0 API - Gadgets with Manifests: * prayer_vizint.js as the first showcase * Runway fixes: > Removed 2nd Fajr (1st recurring event from tomorrow) - distinguished between: ▷ & ▶ > AM/PM > Started Per Instance Config > restored fine-print * Settings: > Capability Support > Manifest reading from gadget > pop-ups for manifest meta-data > folding widgets config * Loader > Loading manifests from new v1 gadgets > Pop-ups for window widgets > Support for bidi > Gadget Icon support > instead of [info] icon > Floating Gadget Info > Pass-thru of click event > Capability awareness * Registry > Began support for self-contained manifests * chronus_prayerTimes_provider > pushing meta-data context to chronus consumer for awareness * common.css > Cleaned up + Added some tighter styles',
  bullets: [
    'VizInt 1.0 API - Gadgets with Manifests: * prayer_vizint.js as the first showcase * Runway fixes: > Removed 2nd Fajr (1st recurring event from tomorrow) - distinguished between: ▷ & ▶ > AM/PM > Started Per Instance Config > restored fine-print * Settings: > Capability Support > Manifest reading from gadget > pop-ups for manifest meta-data > folding widgets config * Loader > Loading manifests from new v1 gadgets > Pop-ups for window widgets > Support for bidi > Gadget Icon support > instead of [info] icon > Floating Gadget Info > Pass-thru of click event > Capability awareness * Registry > Began support for self-contained manifests * chronus_prayerTimes_provider > pushing meta-data context to chronus consumer for awareness * common.css > Cleaned up + Added some tighter styles',
    'Auto: version bump to #030'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#030',
  title: '* Re-registering chronus as a full service library including load-completion signaling * New runway gadget registration * Runway: > Updated Styles to shrink/de-emphasize time left > Implemented new await window.ChronusReady * Runway > implemented indentation * loader.js + registry.js > removed redundant manifest definitions',
  bullets: [
    '* Re-registering chronus as a full service library including load-completion signaling * New runway gadget registration * Runway: > Updated Styles to shrink/de-emphasize time left > Implemented new await window.ChronusReady * Runway > implemented indentation * loader.js + registry.js > removed redundant manifest definitions',
    'Auto: version bump to #029'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#029',
  title: 'Moving to Provider > Blender > Runner > ViewPort model',
  bullets: [
    'Moving to Provider > Blender > Runner > ViewPort model',
    '* refactored chronus-core into chronus.js * removed spurious provider frmo chronus-dev * prayertimes-chronus.js: > updates to spec header for prayertimes-chronus > refactored ensurePrayTimes, pickMethod PrayerProvider & others to the chronus_prayerTimes_provider > fixed duplicate labels preventing arabic label for shurouq > fixed bug preventing [Time Left] dislpay > Added City name * chronus.js > now owns ticks > and initial render * chronus-dev - removed spurious provider * share',
    'Auto: version bump to #028'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#028',
  title: '* * chronus & prayerTimesProvider.js being included outside of index.html * chronus core signaling fixes * additional experimental hello world gadget * new chronus-based implementation of prayer-times * Settings +Support for Toast +Support for dynamic gadget loading +from directory scan +from upload directory +or from URL file scan + Enhanced Gadget positioning support - up/down * Shared library + loadExternalScriptOnce to facilitate loading gadget files + serverless gadget discovery, for installByUrl + FolderUpload + picker/scanner + persisting registry + supporting querying city for prayer times',
  bullets: [
    '* * chronus & prayerTimesProvider.js being included outside of index.html * chronus core signaling fixes * additional experimental hello world gadget * new chronus-based implementation of prayer-times * Settings +Support for Toast +Support for dynamic gadget loading +from directory scan +from upload directory +or from URL file scan + Enhanced Gadget positioning support - up/down * Shared library + loadExternalScriptOnce to facilitate loading gadget files + serverless gadget discovery, for installByUrl + FolderUpload + picker/scanner + persisting registry + supporting querying city for prayer times',
    'Auto: version bump to #027'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#027',
  title: 'Chronus: +Chronus Event Anchor libs + gadgets + eom re-implementation via chronus + archived standalone version of eom. +Chronus spec',
  bullets: [
    'Chronus: +Chronus Event Anchor libs + gadgets + eom re-implementation via chronus + archived standalone version of eom. +Chronus spec',
    'Auto: version bump to #026'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#026',
  title: 'Auto: version bump to #025',
  bullets: [
    'Auto: version bump to #025'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#025',
  title: 'Sneaking in sample embed codes for remote testing',
  bullets: [
    'Sneaking in sample embed codes for remote testing',
    'Auto: version bump to #024'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#024',
  title: 'cleaned up unused array',
  bullets: [
    'cleaned up unused array',
    'Enabled Dynamic Gadget Registration + Fixed associated bugs',
    'Auto: version bump to #023'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#023',
  title: 'Fixed bug with gadget ordering in settings.',
  bullets: [
    'Fixed bug with gadget ordering in settings.',
    'Auto: version bump to #022'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#022',
  title: 'fixed broken history/versioning due to poor character escapes.',
  bullets: [
    'fixed broken history/versioning due to poor character escapes.',
    'Auto: version bump to #021'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#021',
  title: '+ensuring widget defaults at load time if no prior context.',
  bullets: [
    '+ensuring widget defaults at load time if no prior context.',
    'initializers for diag button if no context. prayer times: Add city line if available bug fix for diag on/off',
    'Attempt to add city',
    'Showing actual location instead of \'Detecting lcoation\"',
    'Auto: version bump to #020'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#020',
  title: 'prayers.js: enabling hiding location diagnostics',
  bullets: [
    'prayers.js: enabling hiding location diagnostics',
    'info button api update to support clicks shrunk widgets',
    'Auto: version bump to #019'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#019',
  title: 'Auto: version bump to #018',
  bullets: [
    'Auto: version bump to #018'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#018',
  title: 'persisted settings for fullwidth/fullscreen supporting re-ordering of gadgets, and persisting ordering Added style sheets for animated gadget body that may not work entirel yet.',
  bullets: [
    'persisted settings for fullwidth/fullscreen supporting re-ordering of gadgets, and persisting ordering Added style sheets for animated gadget body that may not work entirel yet.',
    'Auto: version bump to #017'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#017',
  title: 'Added WorldTZ Gadget Enabled gadget manifest via registry',
  bullets: [
    'Added WorldTZ Gadget Enabled gadget manifest via registry',
    'Auto: version bump to #016'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#016',
  title: 'Enhanced Dark Theme Support',
  bullets: [
    'Enhanced Dark Theme Support',
    'Auto: version bump to #015'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#015',
  title: 'Todo > md theme changes',
  bullets: [
    'Todo > md theme changes',
    'Auto: version bump to #014'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#014',
  title: 'Internal Todo Tracking',
  bullets: [
    'Internal Todo Tracking',
    'Gadget Highlighting Styles Highlighting Active Prayer + Time Until Next',
    'Auto: version bump to #013'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#013',
  title: 'actual crud removal from history',
  bullets: [
    'actual crud removal from history',
    'Auto: version bump to #012'
  ],
  status: 'Auto-generated'
},
  {
  ver: '#012',
  title: 'actually fixing version tag sorting',
  bullets: [
    'actually fixing version tag sorting',
    'Auto: version bump to #012',
    '+runSilent +Proper sorting of version tag partial cleanup up of crud from history file',
  ],
  status: 'Auto-generated'
},
  {
  ver: '#011',
  title: 'yet another attempt to fix regex',
  bullets: [
    'exchange with backtick?',
    'attempted escape fix anew',
    'removed erroneous code segment',
    'actually included reverse sorting',
    'possible fix for double escape character reversing order of tag sorting to ensure most recent one comes up first',
    'yet another attempt to fix regex',
    'syntax fixes to history/version bumping code',
    'testing new pre-push script',
    'awareness of running from hook.',
    'regex fix',
    'fixes to enable auto-commit workflow from within VScode and avoid blocking the UI',
    'reverse sorted history moved loading shared library to index.html instead of loader.js Added safe strnig parsing of commit history',
    '* Refactored Version History * Added git based versioning',
  ],
  status: 'Auto-generated'
},
	{
		ver: '#010',
		title: '+favicon',
		bullets: [
			'Version/History updates',
			'Add GitHub Actions workflow for GitHub Pages deployment',
		],
		status: 'Auto-generated'
	},
      {
        ver: '#009',
        title: 'GeoLocation Provider Changs [online]',
        bullets: [
          'Changed provider from ip-api to ipwho.is',
          'Added 💫 favicon',
        ],
        status: 'Experimenting with new ip provider'
      },
      {
        ver: '#008',
        title: 'GeoLocation Fixes [online]',
        bullets: [
          'Rewrote geolocation code',
		  'refactored to shared location',
        ],
        status: 'Attempted fix for geolocation code + refactored to shared area'
      },
      {
        ver: '#007',
        title: 'Console Errors [online]',
        bullets: [
          'Async loading to fix console',
        ],
        status: 'Async Loading for online Console Errors'
      },
      {
        ver: '#006',
        title: 'Console Errors [local]',
        bullets: [
          'Refactored Shared ipApi',
          'Fixing Console Errors',
        ],
        status: 'Console Errors + Refactoring'
      },
      {
        ver: '#005',
        title: 'Hygiene+Fixes',
        bullets: [
          'Updated gadget loading defaults',
          'cleaned up redundancy in shared.js',
          'cleaned up redundancy in registry.js',
        ],
        status: 'Fixed Console Errors + Hygiene'
      },
      {
        ver: '#004',
        title: 'Supporting online hosting',
        bullets: [
          'added shared/httpSafe helper',
          'used httpSafe for protocol-independent-loading',
          'fixed lack of inclusion of shared.js',
        ],
        status: 'Adjust http/s protocol independence'
      },
      {
        ver: '#003',
        title: 'Polish & Presentation',
        bullets: [
          'Header auto-minimized + full-width on load',
          'Unified minimized spacing across gadgets',
          'Refined milestone emphasis (font sizing/weights)',
          'Stable full-screen / width toggles',
          'History widget groundwork',
        ],
        status: 'Visually balanced release'
      },
      {
        ver: '#002',
        title: 'Modular Transition',
        bullets: [
          'Gadget-based portal architecture',
          'Per-gadget chrome: ℹ️, ▁, ⟷, ▢, ✕',
          'Persistent gadget selection (Settings immutable)',
          'Built-in VizInt titlebar gadget (full width)',
          'Minimized-state spacing and layout consistency',
        ],
        status: 'Modular and interactive'
      },
      {
        ver: '#001',
        title: 'Initial Release',
        bullets: [
          'Daily Milestones (5 PM / EOD / Fajr sequence)',
          'Prayer Times (IP-based geo, ISNA/MWL auto-method)',
          'Days Left in Month',
          'Settings for refresh + geo fallback',
          'Live countdowns and current-phase emphasis',
        ],
        status: 'Stable MVP'
      },
      {
        ver: '#000',
        title: 'Hidden Payload',
        bullets: [
		  'This is a hidden payload for testing versioning system.',
		],
        status: 'Bogus Payload'
      }

  ];
| Column 1 | Column 2 | Column 3 |
|	User			| Alias		|	User								| Next Step on Kamba
																		{
																			[]	Commit new versions to git/push?
																		}				
|	U:Architect		| K&K		|										|									
|					|			|										|				

|	U:Orchestrator	| U:Ox		|	Chastizing U:Vz						|	★☆★☆★
																		{
																			[x]	FRTP for single vs. multi gadget instance + settings behaviour
																			[]	FRTP for splitting up loader to portal vs. chrome
																			[]	Prompt for making U:Fx
																		}
|	U:Protocol		|			|										|
																		{
		I'll need to test your ability to update the whole file, please.

		Add an update to the FRTP that indicates the following:
		* One FRTP may be intended for several recipients
		* It is preferred if the sender can indicate which sections need action from different recipients
		* Other sections can be assumed to be FYI
		* Recipients should also read the whole FRTP and evaluate if there are any concerns they need to react to in the rest of the sections they are not called out in.
		* U:Ox may send FRTPs directly to many recipients
		* Other senders should expect all their FRTPs to be processed and approved initially by the U:Ox first before being sent to other volk.

		Ok?

																		}
|	U:Consultant	| u:Cx		|	-									|
																		{
																			[x]	Reviewing delta between Chronus.specs - Approved
																			[x]	Reviewing delta between old Chronus and new one half as small!!	-	Approved!

																		}
|	U:Atlas			| U:At		|										|
																		{	
																			Give [OR>ALL:22:01]
																			Give FRTP<Chronus & Get Code
																			FRTP Protocol Update
																			[x]	Help fix atlas-debug
																			[x]	More City Accuracy for file:// based - there's an upper limit for this based on TimeZone?
																		}
|	U:Chronus		| U:Ch		|	FRTP + Spec + Code					|
																		{	
																			[x]	Spec(dbl check)
																			
																			[FRTP > Ox]
																			[FRTP > Vz]
																			[⚠]	Code Payload took a huge cut!
																			[x]	review resulting Code with consultant - Approved!
																			[x]	Help fix atlas-debug

																		}
|	U:Portal		| U:Vz 		|	Fixing -dubious with back-compat	|
																		{	★★★★★
																			[x]	Needs to fix the atlas-debug gadget
																			[]	implement settings widget
																			[]	
																		}					
|	U:UX			| u:UX		|	-									|
																		{
																			[]	Updated Spec for 1.2
																		}
|	U:Gadgetmatix	| u:Gx		|	-									|
																		{
																			[x]	Give [OR>ALL:22:01]
																			[]	Updated Spec for 1.2
																			[]	New Blank Gadget - with configurable payload
																			[]	New blank MULTI-INSTANCE GADGET
																		}
|	U:Factory		| u:Fx		|	-									|									
|	{FlashCards}	|			|										|	★☆★☆★
																		{
																			[]	Settings modal
																			[]	wire settings to new portal widget
																			[]	Implement Punter 👍& Accelerator👎
																		}
|	U:CodeReviewer	| u:Rx		|	-									|									


---

FRTPs 			|	U:Ox	|	U:Vz	|	U:Ch	|	u:At	|	U:Ux	|	U:Gx	|	U:Fx	|
[OR>ALL:27:02]	|			|			|			|	x		|	x		|	x		|			|
[OR>ALL:22:01]	|			|			|			|			|			|			|			|
[CH>OR:27:02]	|	🗹		|			|			|			|			|			|			|
[			]	|			|			|			|			|			|			|			|
[			]	|			|			|			|			|			|			|			|
[			]	|			|			|			|			|			|			|			|




#ID: [PR>OR,UX,GX:27:03]
FROM: U:Portal (U:Vz)
TO: U:Orchestrator (U:Ox), U:UX (U:Ux), U:Gadgematix (U:Gx)
SUBJECT: FRTP - Proposal to Split Portal Runtime vs Chrome, Loader Refactor, and Index Ownership

1. Summary

This FRTP:

- ACKs the unified multi instance and chrome FRTP [OR>PR,UX,GX:27:02] for v1.2.
- Proposes a concrete split between:
  - Portal runtime responsibilities, and
  - UX chrome responsibilities.
- Suggests a file level separation so U:Vz and U:Ux can work in parallel without trampling each other.
- Explicitly accepts index.html as a Portal owned asset.

No behavior is changed by this FRTP. It only proposes how to structure the code that implements the already agreed model.

2. ACK - Unified v1.2 Gadget and Chrome Model

U:Portal ACKs the following as canonical for v1.2:

- Manifest flags:

  ```js
  _api: "1.0",
  multiInstance: true | false
Namespacing:

text
Copy code
vz:gadgets:{classId}:{instanceId}:*
Per instance isolation:

Each instance sees only its own namespace.

No class level or global settings for v1.2.

Cross instance access is out of scope until v1.3.

Settings chrome:

Single instance: checkbox row with icon, label, badges, up or down.

Multi instance:

Class row with plus, info, badges, up or down.

Instance rows with minus, checkbox, icon, editable name, badges, up or down.

Confirm removal modal when deleting an instance.

Badge layout:

Badges aligned by column, not by gadget.

Stable canonical badge ordering, driven by capabilities.

Portal will treat this FRTP as the single source of truth for runtime behavior in v1.2.

Proposed File Split - Runtime vs Chrome

To enable parallel work and separation of concerns, U:Portal proposes the following split:

3.1 Files and Ownership

loader.js [Become →] portal.js

Owner: U:Portal (U:Vz)

Role: Portal runtime and wiring

chrome.js

Owner: U:UX (U:Ux) as primary, with Portal as consumer

Role: Gadget chrome creation, badge layout, and title bar behavior

index.html

Owner: U:Portal (U:Vz)

Role: Portal entry point and script orchestration

3.2 portal.js - Portal Runtime Responsibilities

portal.js will retain and enforce:

Boot and wiring:

Shared lib boot order: Core then Atlas then Chronus then Nexus then gadgets.

Construction of ctx.libs from module instances (not from window).

ctx.shared deprecation shim.

Settings and instances:

Storage and retrieval under vz:gadgets:{classId}:{instanceId}:*.

Per instance ctx.getSettings and ctx.setSettings.

Instance name decisions and instance identifiers.

Emission of gadgets:update events when settings change.

Gadget lifecycle:

Reading Registry and deciding which gadgets and instances are enabled or visible.

Building the logical descriptor for each instance, including:

classId

instanceId

instanceName

manifest snapshot

effective capabilities

badge meta descriptors

flags such as supportsSettings and multiInstance

Invoking chrome builder from portal.chrome.js to get the gadget shell.

Loading gadget code and calling mount(host, ctx).

In short, portal.js owns what happens, in what order, with which settings.

3.3 portal.chrome.js - UX Chrome Responsibilities

portal.chrome.js will export a well defined chrome API, for example:

js
Copy code
window.PortalChrome = {
	buildGadgetShell(descriptor, chromeModel)
};
Where:

descriptor is provided by portal.js and includes:

classId, instanceId, instanceName

manifest data including _api, multiInstance, supportsSettings, capabilities

badge descriptors that already know which badge categories are present

chromeModel includes runtime flags and hooks such as:

isHeader, isSettingsGadget

callbacks such as:

onToggleCollapse

onToggleWide

onToggleFullscreen

onSettingsToggle

onRequestInstanceDelete

onRenameInstance

mode hints such as view versus settings

portal.chrome.js will return a structure such as:

js
Copy code
{
	slot,       // outer shell div
	body,       // mount host for the gadget itself
	titleEl,    // title text container
	actionsEl,  // right side chrome controls container
	badgeRowEl  // container for badge grid
}
Portal will not decide how these are visually arranged. It will only pass in the intent. UX will be free to:

Position the settings gear relative to collapse, wide and fullscreen.

Change the entire title bar to show {GadgetId}:Settings when the instance is in settings mode.

Implement badge grid alignment so columns line up across gadgets.

Style class rows versus instance rows in the settings gadget.

In short, portal.chrome.js owns how it looks and feels.

3.4 Badge Responsibilities Split

To satisfy the unified FRTP on badges without blurring responsibilities:

Portal:

Computes which badge categories are present for a gadget or instance.

Assigns them a stable category based on capabilities and environment.

UX:

Maps categories into fixed grid columns in portal.chrome.js.

Ensures aligned columns and consistent visual representation.

Portal will pass a list of badge descriptors such as:

js
Copy code
[
	{ category: "chronus", emoji: "🕰️", title: "Uses Chronus" },
	{ category: "atlas",   emoji: "📍",  title: "Uses Atlas" }
]
UX will turn these into aligned grid cells.

index.html Ownership

U:Portal proposes and ACKs the following:

index.html is a Portal asset.

Portal owns:

<script> ordering so that chrome.js is loaded before portal.js.

The presence and id of the main dock container.

Any future host containers that Portal runtime needs.

UX will continue to own CSS and visual decisions but will not own index.html as a file.

Implementation Plan (Pending ACK)

If this proposal is accepted, Portal will:

Extract the current chrome builder logic from loader.js into chrome.js with a stable public API as described.

Replace direct chrome construction in loader.js with calls into window.PortalChrome.buildGadgetShell(...).

Update index.html to load:

shared.js and lib scripts

chrome.js

portal.js
in that order.

Document the chrome API in:

Portal v1.2 Spec

UX Chrome Guidelines

No behavior change is intended during the first extraction phase. All existing gadgets, badges and settings should behave identically.

Required Actions

For U:Orchestrator (U:Ox)

ACK or request adjustments to:

The file split and ownership.

The proposed chrome API boundary between runtime and UX.

For U:UX (U:Ux)

ACK that:

portal.chrome.js will be your primary implementation surface for title bar and gadget chrome.

You will own the badge grid layout and visual behavior of the settings gear and instance rows.

For U:Gadgematix (U:Gx)

No immediate code changes required.

After ACK, update Gadget Authoring Guide to:

Reference the finalized chrome model.

Emphasize that visual behaviors are handled by PortalChrome and not by gadgets directly.

Once ACKs arrive, U:Portal will proceed with the extraction and provide a follow up FRTP with concrete diffs for portal.js, chrome.js and index.html.

END OF FRTP
// Known gadgets for the Settings UI
export const GADGET_CATALOG = [
  { id: 'daily',    label: 'Daily Milestones' },
  { id: 'prayers',  label: 'Prayer Times' },
  { id: 'eom',      label: 'End of Month' },
  { id: 'settings', label: 'Settings' },
];

// Dynamic import map (only EOM & Settings implemented here)
export const GADGETS = {
  eom:      () => import('./eom.js'),
  settings: () => import('./settings.js'),
  // daily:  () => import('./daily.js'),     // (future)
  // prayers:() => import('./prayers.js'),   // (future)
};

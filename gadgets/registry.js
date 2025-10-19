
// Dynamic import map (only EOM & Settings implemented here)
const GADGETS = {
  eom:      () => import('./eom.js'),
  settings: () => import('./settings.js'),
  // daily:  () => import('./daily.js'),     // (future)
  // prayers:() => import('./prayers.js'),   // (future)
};

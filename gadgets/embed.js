(function(){
  const KEY = 'embedSnippet';

  function mount(host, ctx){
    // Load saved snippet if any
    const saved = localStorage.getItem(KEY) || '';
    host.innerHTML = `
      <div id="embed-container" class="gadget-embed">
        ${saved ? saved : '<div class="muted">No embed code yet. Click ℹ️ to add one.</div>'}
      </div>
    `;
    return { refresh: () => mount(host, ctx) }; // simple re-mounter
  }

  function onInfoClick(ctx, { body }) {
    // build modal
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: var(--card-bg, #fff);
      color: var(--fg, #000);
      padding: 16px; border-radius: 8px; width: 400px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    box.innerHTML = `
      <h3 style="margin-top:0;">Custom Embed Code</h3>
      <p class="muted" style="font-size:12px;margin-top:0;">
        Paste your HTML snippet below (e.g. CommonNinja embed code):
      </p>
      <textarea id="embed-code" style="width:100%;height:120px;font-family:monospace;"></textarea>
      <div style="margin-top:10px;text-align:right;">
        <button id="save-embed" class="gbtn">Save</button>
        <button id="cancel-embed" class="gbtn">Cancel</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const ta = box.querySelector('#embed-code');
    const saveBtn = box.querySelector('#save-embed');
    const cancelBtn = box.querySelector('#cancel-embed');

    // preload current code
    ta.value = localStorage.getItem(KEY) || '';

    saveBtn.onclick = () => {
      const val = ta.value.trim();
      localStorage.setItem(KEY, val);
      document.body.removeChild(overlay);
      // reload gadget content
      const container = body.querySelector('#embed-container');
      if (container) container.innerHTML = val || '<div class="muted">No embed code yet.</div>';
      // Re-run script if it includes one
      const temp = container.querySelector('script[src]');
      if (temp && temp.src && !document.querySelector(`script[src="${temp.src}"]`)) {
        const s = document.createElement('script');
        s.src = temp.src;
        s.defer = true;
        document.head.appendChild(s);
      }
    };

    cancelBtn.onclick = () => document.body.removeChild(overlay);
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.embed = {
    info: 'Add or edit custom embed HTML',
    mount,
    onInfoClick
  };
})();

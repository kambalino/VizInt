(function(){
  const PID = 'ac13aeae-eaf7-4079-8175-e4b73f9ecc3a';

  // Load CommonNinja SDK only once
  function ensureCommonNinja(){
    if (document.querySelector('script[src*="cdn.commoninja.com/sdk/latest/commonninja.js"]')) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.commoninja.com/sdk/latest/commonninja.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  function mount(host /* el */, ctx /* {settings,setSettings,bus,...} */){
    ensureCommonNinja();

    host.innerHTML = `
      <div class="gadget worldt" style="padding:1em;text-align:center;">
        <div class="commonninja_component pid-${PID}"></div>
      </div>
    `;

    // If already loaded, trigger init immediately
    if (window.CommonNinja && typeof window.CommonNinja.init === 'function') {
      window.CommonNinja.init();
    }

    // Nothing to clean up other than clearing container
    return ()=>{ host.innerHTML = ''; };
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.worldtz = { mount };
})();

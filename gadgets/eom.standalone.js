(function(){
  function daysLeft(){
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    return Math.max(0, daysInMonth - now.getDate());
  }

  function mount(host /* el */, ctx /* {settings,setSettings,bus,...} */){
    host.innerHTML = `
      <div class="row current">
        <div class="label">End of Month</div>
        <div class="status" id="eomDays">…</div>
      </div>
    `;
    const out = host.querySelector('#eomDays');
    function tick(){ out.textContent = `${daysLeft()} Days…`; }
    tick();
    const id = setInterval(tick, 1000);
    return ()=> clearInterval(id);
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.eom = { mount };

})();

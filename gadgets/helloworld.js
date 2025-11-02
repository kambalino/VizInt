(function(){
  function mount(host /* el */, ctx){
    host.innerHTML = `
      <div style="
        font-family:sans-serif;
        text-align:center;
        padding:1em;
        color:var(--fg,black);
      ">
        Hello World!
      </div>
    `;
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.helloworld = {
    info: 'Simple static gadget that says Hello World',
    mount
  };
})();

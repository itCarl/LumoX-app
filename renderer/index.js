// Renderer placeholder — wires nothing visible yet. Sanity-check the bridge
// by logging available output types on load.

(async () => {
  if (!window.lumox) {
    console.warn('window.lumox bridge missing');
    return;
  }
  const types = await window.lumox.outputs.available();
  console.log('Lumox bridge ready. Output types:', types);
})();

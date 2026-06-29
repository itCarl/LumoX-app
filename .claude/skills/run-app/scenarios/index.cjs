// Scenario registry — name → module ({ cover?, async run(ctx) }). The runner
// (../shot.cjs) resolves a scenario by name here, or loads a throwaway .cjs by
// path. `cover` is the hero shot each scenario contributes to the contact sheet.

module.exports = {
  fader: require('./fader.cjs'),
  limits: require('./limits.cjs'),
  'limits-tile': require('./limits-tile.cjs'),
  stage: require('./stage.cjs'),
  tempo: require('./tempo.cjs'),
  flags: require('./flags.cjs'),
  remap: require('./remap.cjs'),
  matrix: require('./matrix.cjs'),
};

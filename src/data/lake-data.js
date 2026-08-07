/**
 * lake-data.js — real, sourced physical facts for the lake pages' facts strip
 * (surface acres, max depth, mean depth). Figures are from each lake's
 * Wikipedia infobox, which cites MN DNR / USGS. Applied at boot by the
 * lake-content seed in server.js, FILL-EMPTY (COALESCE) so admin-entered or
 * DNR-verified values are never overwritten.
 *
 * NOT included: water clarity (Secchi) — that's DNR-specific and not on these
 * sources, so it's left blank rather than guessed. Border lakes (Lake of the
 * Woods, Rainy) are omitted because a single surface-area figure spans Canada
 * and would mislead. Extend this file as figures are verified.
 *
 *   surface_acres  INTEGER   max_depth_ft  INTEGER   mean_depth_ft  INTEGER
 */

module.exports = {
  'lake-minnetonka':     { surface_acres: 14528,  max_depth_ft: 113, mean_depth_ft: 30 },
  'mille-lacs-lake':     { surface_acres: 132516, max_depth_ft: 42 },
  'leech-lake':          { surface_acres: 102947, max_depth_ft: 156 },
  'lake-vermilion':      { surface_acres: 39271,  max_depth_ft: 76,  mean_depth_ft: 25 },
  'lake-winnibigoshish': { surface_acres: 56471,  max_depth_ft: 70 },
  'cass-lake':           { surface_acres: 15958,  max_depth_ft: 120 },
  'lake-bemidji':        { surface_acres: 7000 },
  'otter-tail-lake':     { surface_acres: 13725,  max_depth_ft: 120 },
  'lake-pepin':          { surface_acres: 29248,  max_depth_ft: 60,  mean_depth_ft: 21 },
  'gull-lake':           { surface_acres: 9947,   max_depth_ft: 80,  mean_depth_ft: 30 },
  'white-bear-lake':     { surface_acres: 2428,   max_depth_ft: 83 },
  'lake-carlos':         { surface_acres: 2605,   max_depth_ft: 163, mean_depth_ft: 50 },
  'kabetogama-lake':     { surface_acres: 25760,  max_depth_ft: 80 },
  'burntside-lake':      { surface_acres: 7139,   max_depth_ft: 126 },
  'big-stone-lake':      { surface_acres: 12610,  max_depth_ft: 16 },
  'lake-shetek':         { surface_acres: 3596,   max_depth_ft: 10 },
  'green-lake':          { surface_acres: 5560,   max_depth_ft: 110, mean_depth_ft: 21 },
  'medicine-lake':       { surface_acres: 902,    max_depth_ft: 49,  mean_depth_ft: 18 },
  'lake-minnewaska':     { surface_acres: 8050,   max_depth_ft: 32,  mean_depth_ft: 17 },
  'big-sandy-lake':      { surface_acres: 6526,   max_depth_ft: 84 },
  'bay-lake':            { surface_acres: 2393,   max_depth_ft: 74 },
};

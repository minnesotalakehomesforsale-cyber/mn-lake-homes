/**
 * lake-attributes.js — structured attributes that power the lake tools
 * (Find Your Lake quiz, Compare Lakes). Merged with live lake data by
 * GET /api/tools/lakes. Keep slugs in sync with the lakes table.
 *
 *   p  price tier 1–4   (1 = most attainable, 4 = luxury)
 *   d  driving hours from the Twin Cities (approx)
 *   v  vibe tags        metro | resort | quiet | wilderness | walkable | luxury | bigwater
 *   f  fishing          walleye | muskie | bass | trout | panfish
 *   s  size             small | medium | large | huge
 */
module.exports = {
    'lake-minnetonka':     { p: 4, d: 0.4, v: ['metro', 'luxury', 'bigwater'], f: ['panfish', 'bass', 'muskie'], s: 'huge' },
    'christmas-lake':      { p: 4, d: 0.4, v: ['metro', 'luxury', 'quiet'], f: ['panfish', 'bass'], s: 'small' },
    'lake-minnewashta':    { p: 3, d: 0.5, v: ['metro', 'quiet'], f: ['panfish', 'bass'], s: 'medium' },
    'lake-waconia':        { p: 3, d: 0.6, v: ['metro', 'resort', 'bigwater', 'walkable'], f: ['walleye', 'panfish'], s: 'large' },
    'medicine-lake':       { p: 3, d: 0.3, v: ['metro', 'quiet'], f: ['panfish', 'bass'], s: 'medium' },
    'bald-eagle-lake':     { p: 3, d: 0.4, v: ['metro', 'quiet'], f: ['panfish', 'walleye'], s: 'medium' },
    'white-bear-lake':     { p: 3, d: 0.4, v: ['metro', 'walkable'], f: ['panfish', 'bass'], s: 'large' },
    'prior-lake':          { p: 3, d: 0.5, v: ['metro', 'resort', 'bigwater'], f: ['panfish', 'bass'], s: 'large' },
    'lake-independence':   { p: 3, d: 0.5, v: ['metro', 'quiet'], f: ['panfish', 'bass'], s: 'medium' },
    'big-marine-lake':     { p: 3, d: 0.6, v: ['metro', 'quiet'], f: ['panfish', 'bass'], s: 'medium' },
    'lake-zumbro':         { p: 1, d: 1.3, v: ['quiet', 'metro'], f: ['panfish', 'walleye'], s: 'medium' },
    'lake-pepin':          { p: 2, d: 1.2, v: ['walkable', 'bigwater', 'resort'], f: ['walleye', 'panfish'], s: 'huge' },
    'lake-koronis':        { p: 2, d: 1.5, v: ['resort', 'quiet'], f: ['walleye', 'panfish'], s: 'large' },
    'green-lake':          { p: 2, d: 1.8, v: ['resort', 'quiet', 'walkable'], f: ['walleye', 'panfish'], s: 'large' },
    'mille-lacs-lake':     { p: 1, d: 1.7, v: ['resort', 'bigwater'], f: ['walleye', 'muskie', 'bass'], s: 'huge' },
    'bay-lake':            { p: 2, d: 2.0, v: ['quiet', 'resort'], f: ['walleye', 'panfish'], s: 'medium' },
    'north-long-lake':     { p: 3, d: 2.2, v: ['resort', 'bigwater'], f: ['walleye', 'panfish'], s: 'large' },
    'south-long-lake':     { p: 2, d: 2.2, v: ['quiet'], f: ['panfish', 'bass'], s: 'medium' },
    'gull-lake':           { p: 3, d: 2.3, v: ['resort', 'luxury', 'bigwater'], f: ['walleye', 'muskie', 'panfish'], s: 'large' },
    'big-sandy-lake':      { p: 1, d: 2.3, v: ['quiet'], f: ['walleye', 'panfish'], s: 'large' },
    'lake-minnewaska':     { p: 2, d: 2.3, v: ['resort', 'quiet', 'bigwater'], f: ['walleye', 'panfish'], s: 'large' },
    'lake-carlos':         { p: 3, d: 2.5, v: ['resort', 'quiet'], f: ['walleye', 'trout'], s: 'large' },
    'whitefish-chain':     { p: 4, d: 2.5, v: ['resort', 'luxury', 'bigwater'], f: ['walleye', 'muskie'], s: 'large' },
    'big-stone-lake':      { p: 1, d: 3.0, v: ['quiet', 'bigwater'], f: ['walleye'], s: 'huge' },
    'lake-shetek':         { p: 1, d: 3.0, v: ['quiet', 'resort'], f: ['walleye', 'panfish'], s: 'large' },
    'pelican-lake':        { p: 3, d: 3.0, v: ['resort', 'bigwater'], f: ['walleye', 'panfish'], s: 'large' },
    'otter-tail-lake':     { p: 2, d: 3.0, v: ['resort', 'bigwater'], f: ['walleye', 'panfish'], s: 'large' },
    'pokegama-lake':       { p: 2, d: 3.0, v: ['resort', 'quiet'], f: ['muskie', 'walleye'], s: 'large' },
    'leech-lake':          { p: 1, d: 3.3, v: ['wilderness', 'resort', 'bigwater'], f: ['walleye', 'muskie', 'bass'], s: 'huge' },
    'lake-melissa':        { p: 2, d: 3.5, v: ['quiet', 'resort'], f: ['walleye', 'panfish'], s: 'medium' },
    'detroit-lake':        { p: 2, d: 3.5, v: ['resort', 'walkable', 'bigwater'], f: ['walleye', 'muskie'], s: 'large' },
    'lake-bemidji':        { p: 2, d: 3.5, v: ['resort', 'walkable', 'bigwater'], f: ['walleye', 'panfish'], s: 'large' },
    'cass-lake':           { p: 1, d: 3.5, v: ['wilderness', 'bigwater'], f: ['walleye', 'muskie'], s: 'large' },
    'lake-winnibigoshish': { p: 1, d: 3.5, v: ['wilderness', 'bigwater'], f: ['walleye'], s: 'huge' },
    'lake-vermilion':      { p: 3, d: 4.0, v: ['wilderness', 'resort', 'bigwater', 'luxury'], f: ['walleye', 'bass'], s: 'huge' },
    'burntside-lake':      { p: 2, d: 4.5, v: ['wilderness', 'quiet'], f: ['trout', 'bass'], s: 'large' },
    'kabetogama-lake':     { p: 1, d: 4.5, v: ['wilderness', 'bigwater'], f: ['walleye', 'bass'], s: 'huge' },
    'rainy-lake':          { p: 1, d: 4.5, v: ['wilderness', 'bigwater'], f: ['walleye', 'bass'], s: 'huge' },
    'lake-of-the-woods':   { p: 1, d: 5.0, v: ['wilderness', 'bigwater'], f: ['walleye'], s: 'huge' },
};

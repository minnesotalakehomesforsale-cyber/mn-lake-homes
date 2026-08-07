/**
 * town-seo.js — unique SEO title + meta description for the active lake towns
 * that were missing one (the "thin" towns from the SEO audit).
 *
 * Applied at boot by the town seed in server.js, FILL-EMPTY (COALESCE) so an
 * admin-entered value or a fully-curated town-content.js entry is never
 * overwritten. title ~50–60 chars, description ~150–160.
 */

module.exports = {
  'alexandria':      { title: 'Alexandria MN Homes for Sale | Lakes Area Real Estate', description: 'Homes for sale in Alexandria, Minnesota — the hub of the Alexandria chain of lakes (Carlos, Darling, Le Homme Dieu). Find lake and in-town property with a local agent.' },
  'baxter':          { title: 'Baxter MN Homes for Sale | Brainerd Lakes Real Estate', description: 'Homes for sale in Baxter, Minnesota — the retail and services hub of the Brainerd Lakes area. Find in-town and nearby lake property with a local real estate agent.' },
  'bemidji':         { title: 'Bemidji MN Homes for Sale | Lake Bemidji Real Estate', description: 'Homes for sale in Bemidji, Minnesota — a true four-season lake town on Lake Bemidji near the Mississippi headwaters. Find lake and city homes with a local agent.' },
  'brainerd':        { title: 'Brainerd MN Homes for Sale | Brainerd Lakes Real Estate', description: 'Homes for sale in Brainerd, Minnesota — the heart of the Brainerd Lakes, one of the state’s top lake destinations. Find lake and in-town property with a local agent.' },
  'detroit-lakes':   { title: 'Detroit Lakes MN Homes for Sale | Lakes Area Real Estate', description: 'Homes for sale in Detroit Lakes, Minnesota — a classic resort town ringed by hundreds of lakes and a famous beach. Find lakefront and in-town homes with a local agent.' },
  'fergus-falls':    { title: 'Fergus Falls MN Homes for Sale | Otter Tail Real Estate', description: 'Homes for sale in Fergus Falls, Minnesota — the gateway to Otter Tail County’s lake country. Find in-town and nearby lake property with a local real estate agent.' },
  'forest-lake':     { title: 'Forest Lake MN Homes for Sale | NE Metro Real Estate', description: 'Homes for sale in Forest Lake, Minnesota — a lake town on the northeast edge of the metro with an easy Twin Cities commute. Find lake and in-town homes with a local agent.' },
  'grand-rapids':    { title: 'Grand Rapids MN Homes for Sale | Itasca Lakes Real Estate', description: 'Homes for sale in Grand Rapids, Minnesota — a north-woods town surrounded by lakes and forest, including Pokegama Lake. Find lake and city property with a local agent.' },
  'lino-lakes':      { title: 'Lino Lakes MN Homes for Sale | NE Metro Real Estate', description: 'Homes for sale in Lino Lakes, Minnesota — a growing northeast-metro suburb built around a chain of lakes and parkland. Find lake and in-town homes with a local agent.' },
  'mound':           { title: 'Mound MN Homes for Sale | West Lake Minnetonka Real Estate', description: 'Homes for sale in Mound, Minnesota — an affordable, walkable town on the west end of Lake Minnetonka. Find lake and in-town property with a local Minnetonka agent.' },
  'prior-lake':      { title: 'Prior Lake MN Homes for Sale | SW Metro Real Estate', description: 'Homes for sale in Prior Lake, Minnesota — a popular southwest-metro lake town close to the Twin Cities. Find lakefront and in-town property with a local agent.' },
  'white-bear-lake': { title: 'White Bear Lake MN Homes for Sale | East Metro Real Estate', description: 'Homes for sale in White Bear Lake, Minnesota — a historic east-metro lake town with a walkable downtown. Find lakefront and in-town homes with a local agent.' },
};

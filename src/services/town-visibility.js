'use strict';

// Single source of truth for which town (tags) rows are PUBLIC — i.e. listed in
// the sitemap, linked from the /towns grid, and served with index,follow.
//
// A town is public when it is active, has a hero, AND is either in-state (MN) or
// linked to at least one published lake. Out-of-state border towns (Fargo ND,
// Superior WI, …) with no lake link stay reachable by direct URL but are
// noindex + unlisted + off the grid — a MN lake site shouldn't advertise ND/WI
// towns it hasn't actually treated.
//
// Every surface that decides town visibility funnels through here so the
// predicates can't drift apart. That drift is exactly what orphaned 24 town
// pages: the sitemap required a linked published lake while the route emitted
// index,follow for any active+hero town. The regression test
// (test/town-visibility.test.js) runs eligibleSql() and isTownEligible() over
// the same truth table on a real SQL engine and asserts they agree.

// SQL boolean fragment for the "MN or has a published lake" rule, parameterised
// by the tags alias so it composes into different queries. Callers add the
// active + hero conditions themselves.
function eligibleSql(alias = 't') {
    // Uncorrelated IN-subquery (not a per-row EXISTS): the set of tag ids with a
    // published lake is computed once, which is what these bulk-over-tags queries
    // (sitemap, /towns grid) want.
    return `( UPPER(COALESCE(${alias}.state,'')) = 'MN'
              OR ${alias}.id IN (SELECT lt.tag_id FROM lake_tags lt
                                 JOIN lakes l ON l.id = lt.lake_id
                                 WHERE l.status = 'published') )`;
}

// JS mirror of eligibleSql for per-row decisions. The town route already knows
// the town's state and whether a published lake is linked, so it decides in JS.
function isTownEligible({ state, hasPublishedLake }) {
    return String(state || '').toUpperCase() === 'MN' || !!hasPublishedLake;
}

const ROBOTS_INDEX   = 'index, follow, max-snippet:-1, max-image-preview:large';
const ROBOTS_NOINDEX = 'noindex';

// Robots meta must track sitemap inclusion exactly, so a 200 town page is never
// an orphaned indexable (index,follow but unlisted).
function townRobots(eligible) { return eligible ? ROBOTS_INDEX : ROBOTS_NOINDEX; }

module.exports = { eligibleSql, isTownEligible, townRobots, ROBOTS_INDEX, ROBOTS_NOINDEX };

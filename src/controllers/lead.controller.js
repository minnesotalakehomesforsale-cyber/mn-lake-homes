const pool = require('../database/pool');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const leadRecovery = require('../services/lead-recovery');
const { logActivity } = require('../services/activity-log');
const { geocodeAddress } = require('../services/geocoder');
const { matchTagsAndUsers } = require('../services/tag-matcher');
const { routeLead } = require('../services/lead-router');
const { getLeadMagnetForType } = require('../services/lead-magnet');
const sms = require('../services/sms');
const { scoreLead } = require('../services/lead-score');

const createLead = async (req, res) => {
    let {
        name, email, phone, notes, source, agent_id, listing_id,
        property_address, property_street, property_city,
        property_state, property_zip, property_place_id, lake_slug,
        is_waterfront, waterfront_feet, lead_session_id, want_founder,
        // B1/B2 lead-qualification properties (mirrored to HubSpot).
        target_lake, intent_type, price_band, lead_source_detail,
        target_lake_freetext,   // T149: free text when the buyer picks "other"
        // DEV-01 attribution (first-touch UTM + landing context).
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        gclid, fbclid, landing_page, landing_page_lake, landing_page_town, referrer,
    } = req.body;
    // Sanitize attribution: strip HTML, cap length. Never trusted; always
    // stored/synced via parameterized queries.
    const attrClean = (v, max = 255) => {
        if (v === null || v === undefined) return null;
        const s = String(v).replace(/<[^>]*>/g, '').trim().slice(0, max);
        return s || null;
    };
    const attribution = {
        utm_source:        attrClean(utm_source),
        utm_medium:        attrClean(utm_medium),
        utm_campaign:      attrClean(utm_campaign),
        utm_term:          attrClean(utm_term),
        utm_content:       attrClean(utm_content),
        gclid:             attrClean(gclid),
        fbclid:            attrClean(fbclid),
        landing_page:      attrClean(landing_page, 500),
        landing_page_lake: attrClean(landing_page_lake, 160),
        landing_page_town: attrClean(landing_page_town, 160),
        referrer:          attrClean(referrer, 500),
    };
    // Founder opt-in for lake leads. Defaults TRUE (preserve the founder's
    // exclusive 100%); only an explicit false sends the lead to the lottery.
    const wantFounder = want_founder !== false && want_founder !== 'false';

    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();

    // Test 9.6: Block missing fields immediately
    if (!name || (!email && !(phone || '').trim())) {
        return res.status(400).json({ error: 'Name and either Email or Phone are required to dispatch lead.' });
    }

    // Strict format validation (server-side is the source of truth — never trust
    // the client). Reject garbage/spam-shaped contact info BEFORE we store it or
    // sync to HubSpot. Validate only what's provided; the required check above
    // already guarantees at least one contact method.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (email && !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.', field: 'email' });
    }
    const phoneDigits = (phone || '').replace(/\D/g, '');
    if ((phone || '').trim() && !(phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits[0] === '1'))) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit US phone number.', field: 'phone' });
    }

    // If this submission finishes a form we already captured partially (same
    // client session), drop the partial row so the full lead inserts fresh and
    // routes normally — no duplicate in the agent inbox.
    const sessionId = (lead_session_id || '').toString().trim().slice(0, 64) || null;
    if (sessionId) {
        try { await pool.query(`DELETE FROM leads WHERE lead_session_id = $1 AND is_partial = TRUE`, [sessionId]); }
        catch (e) { console.warn('[createLead] partial cleanup failed:', e.message); }
    }

    const str = (v, max) => {
        if (v === null || v === undefined || v === '') return null;
        return String(v).trim().slice(0, max) || null;
    };
    const propAddress = str(property_address, 500);
    let   propStreet  = str(property_street, 255);
    let   propCity    = str(property_city, 120);
    let   propState   = str(property_state, 50);
    let   propZip     = str(property_zip, 20);
    const propPlaceId = str(property_place_id, 255);
    // Waterfront flag + shoreline estimate (used for founder/waterfront routing).
    const isWaterfront = (is_waterfront === true || is_waterfront === false) ? is_waterfront : null;
    let   wfFeetNum    = parseInt(waterfront_feet, 10);
    if (!Number.isFinite(wfFeetNum) || wfFeetNum < 0 || wfFeetNum > 100000) wfFeetNum = null;

    try {
        // Guard against accidental double-submits (double-click / network retry):
        // an identical non-partial lead (same email or phone) in the last 2
        // minutes is the same submission — return it, don't re-insert or re-email.
        try {
            const recent = await pool.query(
                `SELECT id FROM leads
                  WHERE deleted_at IS NULL AND COALESCE(is_partial, FALSE) = FALSE
                    AND created_at > now() - interval '2 minutes'
                    AND ( ($1 <> '' AND lower(email) = $1)
                       OR ($2 <> '' AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $2) )
                  ORDER BY created_at DESC LIMIT 1`,
                [email || '', phoneDigits || '']);
            if (recent.rowCount) {
                return res.status(201).json({ success: true, message: 'Lead already received', lead_id: recent.rows[0].id, duplicate: true });
            }
        } catch (e) { console.warn('[createLead] double-submit check failed:', e.message); }

        // Coerce agent string if dummy provided
        let finalAgentId = (agent_id && agent_id !== 'uuid-string-dummy') ? agent_id : null;

        // Listing-tied lead (e.g. "request a showing"). Resolve the property
        // server-side so the submitter can't spoof the agent: the lead goes to
        // whoever actually posted the home; its address seeds routing fallback.
        const listingId = (listing_id && String(listing_id).trim()) || null;
        let listing = null;
        if (listingId) {
            try {
                const lr = await pool.query(
                    `SELECT id, agent_id, lake_id, title, address, city, state, zip
                       FROM listings WHERE id = $1 LIMIT 1`, [listingId]);
                listing = lr.rows[0] || null;
            } catch (_) { /* leave null */ }
        }
        if (listing) {
            if (!finalAgentId && listing.agent_id) finalAgentId = listing.agent_id;  // → the posting agent
            // Seed property fields from the listing when the form didn't supply them.
            if (!propStreet && listing.address) propStreet = str(listing.address, 255);
            if (!propCity   && listing.city)    propCity   = str(listing.city, 120);
            if (!propState  && listing.state)   propState  = str(listing.state, 50);
            if (!propZip    && listing.zip)     propZip    = str(listing.zip, 20);
        }

        // Resolve an explicit lake (lead came from a lake page) → its id, so the
        // router can hand it to that lake's founding agent.
        const lakeSlug = str(lake_slug, 120);
        let leadLakeId = null;
        let leadLakeName = null;
        if (lakeSlug) {
            try {
                const lr = await pool.query(`SELECT id, name FROM lakes WHERE slug = $1 LIMIT 1`, [lakeSlug]);
                leadLakeId = lr.rows[0]?.id || null;
                leadLakeName = lr.rows[0]?.name || null;
            } catch (_) { /* leave null */ }
        }

        // ── B1/B2 lead-qualification props (validated enum values only) ──────
        // target_lake: an explicit valid choice wins; otherwise derive from the
        // lake this lead came from (a lake page). Unknown/none → left unset,
        // except a lake page whose lake isn't in the Tier-1 list → 'other'.
        const { validEnumValue, targetLakeValueForName } = require('../data/hubspot-schema');
        let qualTargetLake = validEnumValue('target_lake', target_lake);
        if (!qualTargetLake && leadLakeName) qualTargetLake = targetLakeValueForName(leadLakeName) || 'other';
        const qualIntent      = validEnumValue('intent_type', intent_type);
        const qualPriceBand   = validEnumValue('price_band', price_band);
        // lead_source_detail: explicit valid value, else infer 'lake_page' when
        // the lead came from a lake page, else leave for HubSpot's own source.
        let qualSourceDetail  = validEnumValue('lead_source_detail', lead_source_detail);
        if (!qualSourceDetail && lakeSlug) qualSourceDetail = 'lake_page';

        // Link the lead to a user account by email. Forms no longer require
        // an account — anyone can submit. If the caller is signed in we trust
        // their session; otherwise we look up an existing account by the
        // submitted email. No match → user_id stays null ("unassigned"), and
        // it gets backfilled later if someone signs up with that same email.
        let submittedUserId = req.user?.userId || null;
        if (!submittedUserId && email) {
            const u = await pool.query(
                'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
                [email]
            );
            if (u.rows.length) submittedUserId = u.rows[0].id;
        }

        // ── Lead grading (Spec 1 / B1) — mechanical, stamped once at submission ──
        // Runs after validation, before persistence; never recomputed. Note that
        // spam/junk/invalid submissions are already blocked upstream (spam-guard
        // + the format checks return before this point), so at grading time name
        // and contact are valid; the exclusions that fire here are duplicate,
        // missing-lake and missing-intent. Post-hoc reasons (unreachable,
        // opted_out, industry_contact, out_of_area) are set later by other
        // processes / admin, not this submission grader.
        const { gradeLead, timeframeBucket, isJunkName } = require('../services/lead-grading');
        let isDuplicate = false;
        try {
            const dupOr = [], dupParams = [];
            if (email) { dupParams.push(email); dupOr.push(`lower(l.email) = $${dupParams.length}`); }
            if (phoneDigits && phoneDigits.length >= 10) {
                dupParams.push('%' + phoneDigits.slice(-10));
                dupOr.push(`regexp_replace(COALESCE(l.phone,''), '\\D', '', 'g') LIKE $${dupParams.length}`);
            }
            if (dupOr.length) {
                // Unchanged intent AND lake → a genuine duplicate. A different
                // lake or intent is a new inquiry, not a dupe.
                dupParams.push(qualIntent);      // $n-1
                dupParams.push(qualTargetLake);  // $n
                const dq = await pool.query(
                    `SELECT 1 FROM leads l
                      WHERE (${dupOr.join(' OR ')})
                        AND l.created_at > now() - interval '30 days'
                        AND l.deleted_at IS NULL AND COALESCE(l.is_partial, FALSE) = FALSE
                        AND l.intent_type IS NOT DISTINCT FROM $${dupParams.length - 1}
                        AND l.target_lake IS NOT DISTINCT FROM $${dupParams.length}
                      LIMIT 1`, dupParams);
                isDuplicate = dq.rowCount > 0;
            }
        } catch (e) { console.warn('[grading] dup check failed:', e.message); }

        const { grade: leadGrade, reason: unqualReason } = gradeLead({
            testFlagged: req.body?.test === true || req.body?.is_test === true,
            isDuplicate,
            hasName:    !isJunkName(name),
            hasContact: !!(email || (phoneDigits && (phoneDigits.length === 10 || phoneDigits.length === 11))),
            hasLake:    !!qualTargetLake,
            hasIntent:  ['buyer', 'seller', 'renter', 'not_sure'].includes(qualIntent),
            timeframe:  timeframeBucket(req.body?.timeline || req.body?.timeframe),
            priceBandSet: !!qualPriceBand,
        });

        const query = `
            INSERT INTO leads (
                full_name, first_name, email, phone, message,
                lead_type, lead_source, agent_id, lead_status,
                property_address, property_street, property_city,
                property_state, property_zip, property_place_id,
                user_id, listing_id, is_waterfront, waterfront_feet,
                lead_score, lead_tier, lead_session_id, is_partial,
                lead_grade, unqualified_reason, graded_at, target_lake, intent_type, target_lake_freetext
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, FALSE,
                    $22, $23, NOW(), $24, $25, $26)
            RETURNING id
        `;
        // We extrapolate first name logically
        const firstName = name.split(' ')[0] || 'Unknown';

        // Map source to lead_type enum using exact matching. The founder_match_*
        // sources are the "work with the founder agent" direct-match flow — each
        // is tied to a lake so routeLead delivers it straight to that lake's founder.
        const enumMap = {
            'agent_inquiry': 'agent_inquiry',
            'buyer': 'buyer',
            'seller': 'seller',
            'join_request': 'join_request',
            'market_report': 'market_report',
            'property_question': 'property_question',
            'founder_match_buyer':  'buyer',
            'founder_match_seller': 'seller',
            'founder_match_rent':   'buyer',
            'founder_match':        'buyer',
        };
        const enumType = enumMap[source] || 'general_contact';

        // Quality-score the lead once; stored on the row and reused for the
        // 🔥 hot flag in agent SMS/email alerts.
        const leadScore = scoreLead({ enumType, email, phone, notes, isWaterfront, wfFeetNum,
            address: propAddress || [propStreet, propCity].filter(Boolean).join(', ') });

        const { rows: leadRows } = await pool.query(query, [
            name, firstName, email, phone, notes,
            enumType, source, finalAgentId,
            propAddress, propStreet, propCity, propState, propZip, propPlaceId,
            submittedUserId, listingId, isWaterfront, wfFeetNum,
            leadScore.score, leadScore.tier, sessionId,
            leadGrade, unqualReason, qualTargetLake || null, qualIntent || null,
            (target_lake_freetext || '').trim() ? String(target_lake_freetext).trim().slice(0, 200) : null,
        ]);
        const newLeadId = leadRows[0]?.id;

        // Persist the explicit lake tie (best-effort; column added via migration).
        if (newLeadId && leadLakeId) {
            pool.query(`UPDATE leads SET lake_id = $1 WHERE id = $2`, [leadLakeId, newLeadId])
                .catch(e => console.error('[lead.lake_id] save failed:', e.message));
        }

        // DEV-01: persist attribution (parameterized). Separate UPDATE keeps the
        // big INSERT stable. Best-effort — never block the lead on it.
        if (newLeadId && (Object.values(attribution).some(Boolean) || qualPriceBand)) {
            pool.query(
                `UPDATE leads SET utm_source=$1, utm_medium=$2, utm_campaign=$3, utm_term=$4,
                        utm_content=$5, gclid=$6, fbclid=$7, landing_page=$8,
                        landing_page_lake=$9, landing_page_town=$10, referrer=$11, price_band=$12
                   WHERE id=$13`,
                [attribution.utm_source, attribution.utm_medium, attribution.utm_campaign, attribution.utm_term,
                 attribution.utm_content, attribution.gclid, attribution.fbclid, attribution.landing_page,
                 attribution.landing_page_lake, attribution.landing_page_town, attribution.referrer,
                 qualPriceBand || null, newLeadId])
                .catch(e => console.error('[lead.attribution] save failed:', e.message));
        }

        logActivity({
            event_type: 'lead.create',
            event_scope: 'lead',
            actor: { type: 'public', label: email || phone || name },
            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
            details: { lead_type: enumType, source, agent_id: finalAgentId, email, phone },
            req,
        });

        // Resolve the right lead magnet (PDF) for this lead type before we
        // fire the confirmation email — the email is tuned to include the
        // download button when a magnet exists. Falls back gracefully to the
        // generic confirmation when no magnet is configured / resource is
        // missing.
        let magnet = null;
        if (email) {
            magnet = await getLeadMagnetForType(enumType).catch(() => null);
        }

        // B3: only promise "an agent will reach out" when we can actually back
        // it — a direct assignment, or a paying agent already covering this lake.
        // Held (qualified-but-unserved) and unqualified leads get a neutral
        // confirmation so we never make a promise conditional on an assignment
        // that hasn't happened.
        let willMatch = !!finalAgentId;
        if (!willMatch && leadGrade !== 'Unqualified' && leadLakeId) {
            try {
                const pa = await pool.query(
                    `SELECT 1 FROM agents a JOIN users u ON u.id = a.user_id
                       LEFT JOIN memberships m ON m.id = a.membership_id
                      WHERE a.is_published = TRUE AND a.deleted_at IS NULL
                        AND ((COALESCE(m.code,'free') <> 'free') OR a.tier_comped)
                        AND (EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = a.id AND al.lake_id = $1)
                          OR EXISTS (SELECT 1 FROM user_tags ut JOIN lake_tags lt ON lt.tag_id = ut.tag_id
                                      WHERE ut.user_id = a.user_id AND lt.lake_id = $1))
                      LIMIT 1`, [leadLakeId]);
                willMatch = pa.rowCount > 0;
            } catch (_) { /* conservative: leave willMatch false */ }
        }

        // Fire-and-forget lead confirmation email (only if they provided one)
        if (email) {
            emailService.sendLeadConfirmation({
                email,
                first_name: firstName,
                full_name:  name,
                lead_type:  enumType,
                magnet,
                matched: willMatch,
            });
        }

        // Admin lead email is sent ONCE, from the routing outcome below (routed /
        // held / unrouted), so there's exactly one email per lead with the right
        // context — no more "new lead" + "unrouted" duplicate. Unqualified leads
        // send nothing (the router returns early), so junk stops emailing you.

        // Fire-and-forget HubSpot mirror — leads with no email are skipped
        // inside hubspot.syncContact (email is the canonical key).
        // Field mapping: standard HubSpot contact properties only —
        // firstname/lastname/phone/email + full address fields (address/city/
        // state/zip) for sellers + lifecyclestage='lead' so HubSpot
        // workflows can target form-fill leads. Buyer-specific budget /
        // timeline + seller-specific timeline currently live in the
        // `notes` blob; mapping them to dedicated HubSpot custom properties
        // is documented in docs/launch-tracking-setup.md as a follow-up
        // step (requires the property to be created in HubSpot first).
        if (newLeadId && email) {
            (async () => {
                const lastName = name.split(' ').slice(1).join(' ');
                let r = null;
                try {
                    r = await hubspot.syncContact({
                        email,
                        firstname:      firstName,
                        lastname:       lastName,
                        phone:          phone || undefined,
                        address:        propAddress || propStreet || undefined,
                        city:           propCity  || undefined,
                        state:          propState || undefined,
                        zip:            propZip   || undefined,
                        lifecyclestage: 'lead',
                        user_type:      'lead',
                        signup_source:  source || enumType,
                        lead_id:        newLeadId,   // cross-reference: our UUID on the HubSpot contact
                        // B1/B2 lead-qualification props (retires the old lake_name
                        // duplicate — target_lake is the single source of truth).
                        target_lake:        qualTargetLake || undefined,
                        intent_type:        qualIntent || undefined,
                        price_band:         qualPriceBand || undefined,
                        // B1 grade (stamped at submission; HubSpot value is lowercase for the enum).
                        lead_grade:         leadGrade === 'Unqualified' ? 'unqualified' : (leadGrade || undefined),
                        unqualified_reason: unqualReason || undefined,
                        // HubSpot internal name is *_v2 (original name archived); the
                        // form/validation still use `lead_source_detail` internally.
                        lead_source_detail_v2: qualSourceDetail || undefined,
                        // DEV-01 attribution — whitelisted in hubspot.js; nulls dropped by cleanProps.
                        ...attribution,
                    });
                } catch (e) {
                    // A throw is a real failure — treat like a null return below.
                    console.error('[hubspot] sync threw:', e.message);
                }
                if (r?.id) {
                    // Advance pipeline only from 'received' so a lead that already
                    // routed isn't downgraded (hubspot + routing run concurrently).
                    pool.query(
                        `UPDATE leads
                            SET hs_contact_id = $1,
                                pipeline_status = CASE WHEN pipeline_status = 'received' THEN 'sent_to_hubspot' ELSE pipeline_status END
                          WHERE id = $2`, [r.id, newLeadId])
                        .catch(e => console.error('[hubspot] save id failed:', e.message));
                } else if (hubspot.isActive && hubspot.isActive()) {
                    // T018: HubSpot is enabled + configured but the sync didn't
                    // return a contact → a genuine failure (not a skip). The lead
                    // is already saved; queue a retry with backoff + alert now so
                    // it never silently disappears.
                    leadRecovery.enqueue(newLeadId, 'hubspot', 'syncContact returned no contact id')
                        .catch(e => console.error('[lead-recovery] enqueue threw:', e.message));
                }
            })();
        }

        // Direct assignment (a listing "request a showing", or any lead that
        // arrives with an explicit agent_id): assign to that agent and email
        // them right away — independent of address/lake geo routing, which the
        // block below intentionally skips when finalAgentId is set.
        if (newLeadId && finalAgentId) {
            (async () => {
                try {
                    const ar = await pool.query(
                        `SELECT a.id AS agent_id, a.user_id, a.display_name, u.email
                           FROM agents a LEFT JOIN users u ON u.id = a.user_id
                          WHERE a.id = $1 LIMIT 1`, [finalAgentId]);
                    const ag = ar.rows[0];
                    await pool.query(
                        `UPDATE leads SET assigned_user_id = $1, lead_status = 'contacted',
                                pipeline_status = 'routed', assigned_at = NOW(),
                                routed_at = COALESCE(routed_at, NOW()), updated_at = NOW()
                          WHERE id = $2`, [ag?.user_id || null, newLeadId]);
                    if (ag?.email) {
                        emailService.sendMatchedAgentNotification({
                            to: ag.email,
                            agentFirstName: (ag.display_name || '').split(' ')[0] || 'there',
                            lead: {
                                id: newLeadId, name, email, phone, notes,
                                type: enumType, source,
                                address: listing?.title
                                    || propAddress
                                    || [propStreet, propCity].filter(Boolean).join(', ')
                                    || null,
                            },
                            distanceMiles: null,
                            matchedAreas: [listing?.title].filter(Boolean),
                        });
                    }
                    // Instant SMS to the posting agent (no-op until Twilio set).
                    sms.notifyAgentNewLead({
                        userId: ag?.user_id, agentId: finalAgentId,
                        lead: { name, email, phone, type: enumType, hot: leadScore.tier === 'hot',
                                address: listing?.title || propAddress || [propStreet, propCity].filter(Boolean).join(', ') || null },
                    });
                    logActivity({
                        event_type: 'lead.route_assigned', event_scope: 'lead',
                        actor: { type: 'system', label: 'lead-router' },
                        target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                        details: { direct: true, listing_id: listingId, assigned_agent_id: finalAgentId, assigned_user_id: ag?.user_id || null },
                    });
                } catch (e) { console.warn('[lead direct-assign] failed:', e.message); }
            })();
        }

        // Fire-and-forget geo routing: if we captured a property address,
        // geocode it, find agents whose service-area tags fall within the
        // configured radius, email each matched agent, and record the
        // match set in lead_tags for audit/routing history.
        const addressForRouting = propAddress
            || [propStreet, propCity, propState, propZip].filter(Boolean).join(', ')
            || null;
        // Route when we have a property address to geocode OR the lead is tied
        // to a lake (lake-page leads have no address but still route to the
        // lake's founder).
        if (newLeadId && (addressForRouting || leadLakeId)) {
            (async () => {
                try {
                    // B1/B3: Unqualified leads are never routed to an agent (they'd
                    // burn the A/B promise and skew counts). They're stored + synced
                    // for the record; nothing else happens here.
                    if (leadGrade === 'Unqualified') {
                        logActivity({
                            event_type: 'lead.route_skipped_unqualified',
                            event_scope: 'lead',
                            actor: { type: 'system', label: 'lead-router' },
                            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                            details: { reason: unqualReason },
                        });
                        return;
                    }

                    const geo = addressForRouting ? await geocodeAddress(addressForRouting) : null;

                    // Record which town tags matched (+ distance) for audit — only
                    // when we geocoded an address.
                    if (geo) {
                        const { tags } = await matchTagsAndUsers({ lat: geo.lat, lng: geo.lng });
                        if (tags.length) {
                            const valuesSql = tags.map((_, i) =>
                                `($1, $${i + 2}, $${i + 2 + tags.length})`
                            ).join(', ');
                            const params = [
                                newLeadId,
                                ...tags.map(t => t.id),
                                ...tags.map(t => t.distance_miles),
                            ];
                            await pool.query(
                                `INSERT INTO lead_tags (lead_id, tag_id, distance_miles) VALUES ${valuesSql}`,
                                params
                            );
                        }
                    }

                    // ── Auto-assign via router ──
                    // Skip routing if a direct agent_id was supplied (e.g., lead
                    // came from an agent-profile-specific form). That agent stays.
                    if (finalAgentId) {
                        logActivity({
                            event_type: 'lead.route_skipped_direct_assign',
                            event_scope: 'lead',
                            actor: { type: 'system', label: 'lead-router' },
                            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                            details: { reason: 'direct_agent_id_provided', agent_id: finalAgentId },
                        });
                        // Single admin copy (this lead went straight to a specific agent).
                        emailService.sendAdminLeadNotification({
                            name, first_name: firstName, email, phone, type: enumType,
                            source: `${source || enumType} · direct to agent`, notes,
                        });
                        return;
                    }

                    const pick = await routeLead({ lat: geo?.lat, lng: geo?.lng, lakeId: leadLakeId, wantFounder });
                    if (!pick) {
                        // B3: a QUALIFIED (A/B) lead with no active paying agent on
                        // its lake goes to the HOLD queue — not dropped. This is a
                        // sales trigger: someone is searching a lake we can't serve
                        // yet. Flag it, stamp held_at, and alert immediately with
                        // lake + intent + price band. It auto-releases the moment a
                        // paying agent activates on that lake (see releaseHeldLeads).
                        if (leadGrade === 'A' || leadGrade === 'B') {
                            await pool.query(
                                `UPDATE leads SET held_no_agent = TRUE, held_at = COALESCE(held_at, NOW()),
                                        lead_status = 'held_no_agent', updated_at = NOW()
                                  WHERE id = $1`, [newLeadId]).catch(() => {});
                            logActivity({
                                event_type: 'lead.held_no_agent',
                                event_scope: 'lead',
                                severity: 'warning',
                                actor: { type: 'system', label: 'lead-router' },
                                target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                                details: { grade: leadGrade, lake: leadLakeName || qualTargetLake, intent: qualIntent, price_band: qualPriceBand, reason: 'no_paying_agent' },
                            });
                            emailService.sendAdminLeadNotification({
                                name, first_name: firstName, email, phone, type: enumType,
                                source: `⭐ OPPORTUNITY LAKE · grade ${leadGrade} · HELD (no paying agent)`,
                                notes: `SALES TRIGGER — a grade-${leadGrade} lead is searching ${leadLakeName || qualTargetLake || 'a lake'} and we have NO paying agent there.\n`
                                     + `Lake: ${leadLakeName || qualTargetLake || '—'} · Intent: ${qualIntent || '—'} · Price band: ${qualPriceBand || '—'}\n`
                                     + `Call an agent on this lake today — the lead auto-routes to them the moment they activate.\n\n${notes || ''}`.trim(),
                            });
                            return;
                        }
                        // Grade C (or ungraded) with no agent — stays unassigned as
                        // before; log + notify so it doesn't sit silently.
                        logActivity({
                            event_type: 'lead.route_unassigned',
                            event_scope: 'lead',
                            severity: 'warning',
                            actor: { type: 'system', label: 'lead-router' },
                            target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                            details: { lat: geo?.lat, lng: geo?.lng, lake_id: leadLakeId, reason: 'no_eligible_agent', grade: leadGrade },
                        });
                        emailService.sendAdminLeadNotification({
                            name,
                            first_name: firstName,
                            email,
                            phone,
                            type: enumType,
                            source: source ? `${source} · UNROUTED` : 'UNROUTED',
                            notes: `Routing failed — no eligible agent in the matched service areas near "${geo?.formattedAddress || addressForRouting || 'the selected lake'}". Lead needs manual assignment from the admin Leads queue.\n\n${notes || ''}`.trim(),
                        });
                        return;
                    }

                    // Assign the lead. assigned_user_id is the agent's user record;
                    // agent_id is the agents table row.
                    await pool.query(
                        `UPDATE leads
                            SET agent_id         = $1,
                                assigned_user_id = $2,
                                lead_status      = 'contacted',
                                pipeline_status  = 'routed',
                                assigned_at      = NOW(),
                                routed_at        = COALESCE(routed_at, NOW()),
                                updated_at       = NOW()
                          WHERE id = $3`,
                        [pick.agentId, pick.userId, newLeadId]
                    );

                    // Email just the assigned agent.
                    emailService.sendMatchedAgentNotification({
                        to: pick.email,
                        agentFirstName: (pick.fullName || '').split(' ')[0] || 'there',
                        lead: {
                            id: newLeadId,
                            name,
                            email,
                            phone,
                            notes,
                            type: enumType,
                            source,
                            address: geo?.formattedAddress || addressForRouting || pick.lakeName || null,
                        },
                        distanceMiles: pick.distanceMiles,
                        matchedAreas: [pick.lakeName || pick.tagName].filter(Boolean),
                    });

                    // Single admin copy for a routed lead (the one email per lead).
                    emailService.sendAdminLeadNotification({
                        name, first_name: firstName, email, phone, type: enumType,
                        source: `${source || enumType} · routed to ${pick.fullName || 'agent'}`,
                        notes,
                    });

                    // Instant SMS to the assigned agent (speed-to-lead). No-op
                    // until Twilio is configured; flags 🔥 hot leads.
                    sms.notifyAgentNewLead({
                        userId: pick.userId, agentId: pick.agentId,
                        lead: { name, email, phone, type: enumType, hot: leadScore.tier === 'hot',
                                address: geo?.formattedAddress || addressForRouting || pick.lakeName || null },
                    });

                    // In-app notification centre (#11).
                    try {
                        require('../services/agent-notify').notifyAgent(pick.agentId, {
                            type: 'lead',
                            title: `New ${leadScore.tier === 'hot' ? '🔥 hot ' : ''}lead: ${name || 'someone'}`,
                            body: [enumType, pick.lakeName || pick.tagName].filter(Boolean).join(' · ') || 'Respond fast to win it.',
                            link: '?view=leads',
                        });
                    } catch (_) {}

                    logActivity({
                        event_type: 'lead.route_assigned',
                        event_scope: 'lead',
                        actor: { type: 'system', label: 'lead-router' },
                        target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                        details: {
                            lat: geo?.lat, lng: geo?.lng,
                            lake_id: pick.lakeId || null, lake_name: pick.lakeName || null,
                            tag_id: pick.tagId || null, tag_name: pick.tagName || null,
                            tier: pick.tierCode,
                            assigned_user_id: pick.userId,
                            assigned_agent_id: pick.agentId,
                        },
                    });
                } catch (err) {
                    console.warn('[lead routing] failed:', err.message);
                }
            })();
        }
        // T148: qualified (A/B) lead with NO routing key — no lake matched and no
        // address to geocode (the router block above is gated on lake OR address,
        // so these fell through and just sat: never routed, never held, invisible).
        // Park them in unrouted_no_lake and alert immediately (same urgency as a
        // held lead). Distinct from held_no_agent: there we KNOW the lake and
        // can't serve it; here we don't know the lake yet. Answering "which lake"
        // in the admin clears this and routes normally (setLeadLake).
        else if (newLeadId && (leadGrade === 'A' || leadGrade === 'B') && !leadLakeId) {
            (async () => {
                try {
                    await pool.query(
                        `UPDATE leads SET unrouted_no_lake = TRUE, held_at = COALESCE(held_at, NOW()),
                                lead_status = 'unrouted_no_lake', updated_at = NOW()
                          WHERE id = $1`, [newLeadId]);
                    logActivity({
                        event_type: 'lead.unrouted_no_lake', event_scope: 'lead', severity: 'warning',
                        actor: { type: 'system', label: 'lead-router' },
                        target: { type: 'lead', id: newLeadId, label: `${name} (${enumType})` },
                        details: { grade: leadGrade, target_lake: qualTargetLake || null, freetext: (target_lake_freetext || '').slice(0, 120) || null, intent: qualIntent, reason: 'no_lake_key' },
                    });
                    emailService.sendAdminLeadNotification({
                        name, first_name: firstName, email, phone, type: enumType,
                        source: `⚠️ UNROUTED · grade ${leadGrade} · NO LAKE SPECIFIED`,
                        notes: `A grade-${leadGrade} lead qualified but gave no routable lake (picked "${qualTargetLake || 'other'}"${target_lake_freetext ? `, typed: "${target_lake_freetext}"` : ''}), so it can't route or hold yet.\n`
                             + `Ask which lake they mean and set it on the lead — it then routes normally. A rising count here usually means the form's lake picker is missing lakes, not that buyers are vague.\n\n${notes || ''}`.trim(),
                    });
                } catch (e) { console.warn('[lead unrouted_no_lake]', e.message); }
            })();
        }

        res.status(201).json({ success: true, message: 'Lead logged', lead_id: newLeadId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to insert lead' });
    }
};

// PROTECTED (Admin Only)
const getAdminLeads = async (req, res) => {
    try {
        const query = `
            SELECT l.id, l.full_name as name, l.email, l.phone, l.lead_type as type,
                   l.lead_source as source, l.lead_status as status, l.created_at,
                   a.display_name as assigned_agent_name, u.full_name as assigned_user_name,
                   l.agent_id, l.is_partial, l.lead_score, l.lead_tier,
                   -- T141 held queue + hand-placement state (drives the Held filter
                   -- and the pending-offer badge on the admin leads list).
                   l.lead_grade, l.held_no_agent, l.assigned_manually, l.accepted_at, l.manual_assigned_at,
                   -- T148/T149 unrouted-no-lake state.
                   l.unrouted_no_lake, l.target_lake, l.target_lake_freetext
            FROM leads l
            LEFT JOIN agents a ON l.agent_id = a.id
            LEFT JOIN users u ON l.assigned_user_id = u.id
            ORDER BY l.created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// GET /api/leads/mine — every lead linked to the signed-in user's account.
// Powers the "Your submissions" section on the user dashboard. Requires auth.
//
// Email is the universal identity key, so we match on user_id OR the
// account's own email — this guarantees the dashboard shows EVERY lead
// submitted with that email even if the signup-time backfill missed one
// (e.g. a lead created through a path that didn't link, or a timing gap).
// We also opportunistically backfill: any matching-email lead whose
// user_id is still NULL gets claimed for this account on read, so the
// data self-heals and admin views show the linkage too.
const getMyLeads = async (req, res) => {
    try {
        // Resolve the account's canonical (lowercased) email once.
        const ures = await pool.query(`SELECT LOWER(email) AS email FROM users WHERE id = $1`, [req.user.userId]);
        const myEmail = ures.rows[0]?.email || null;

        // Self-heal: claim any unlinked leads that share this email.
        if (myEmail) {
            pool.query(
                `UPDATE leads SET user_id = $1, updated_at = NOW()
                  WHERE LOWER(email) = $2 AND user_id IS NULL AND deleted_at IS NULL`,
                [req.user.userId, myEmail]
            ).catch(e => console.error('[leads.getMyLeads] backfill failed:', e.message));
        }

        const { rows } = await pool.query(
            `SELECT id, full_name, email, phone, lead_type, lead_source, lead_status,
                    property_address, message, submitted_at, created_at,
                    lead_grade, disposition, disposition_reason, dispute_flag, held_no_agent, routed_at
               FROM leads
              WHERE deleted_at IS NULL
                AND (user_id = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2))
              ORDER BY created_at DESC`,
            [req.user.userId, myEmail]
        );
        res.json(rows);
    } catch (err) {
        console.error('[leads.getMyLeads]', err.message);
        res.status(500).json({ error: 'Failed to load your submissions.' });
    }
};

// POST /api/leads/partial — progressive capture. Fired the moment a visitor
// gives contact info (email/phone) in the lead form, and again on abandon. Saves
// an INCOMPLETE lead keyed by the client's lead_session_id so we recover people
// who don't finish the form. Partial leads are NEVER routed to an agent and
// never trigger notifications — they sit in the admin queue (flagged partial)
// and feed the nurture drip. When the visitor finishes, createLead deletes this
// row and inserts the complete, routed lead.
const createPartialLead = async (req, res) => {
    try {
        const b = req.body || {};
        const sessionId = (b.lead_session_id || '').toString().trim().slice(0, 64);
        if (!sessionId) return res.status(400).json({ error: 'lead_session_id required.' });

        const name  = (b.name || '').toString().trim().slice(0, 200) || 'Incomplete lead';
        const email = (b.email || '').toString().trim().toLowerCase().slice(0, 255) || null;
        const phone = (b.phone || '').toString().trim().slice(0, 50) || null;
        // Nothing to reach them by → nothing worth saving.
        if (!email && !(phone && phone.replace(/[^0-9]/g, '').length >= 7)) {
            return res.json({ success: true, saved: false });
        }

        const firstName = name.split(' ')[0] || 'Lead';
        const notes = (b.notes || '').toString().slice(0, 4000) || null;
        const source = (b.source || 'partial').toString().slice(0, 80);
        const propAddress = (b.property_address || '').toString().trim().slice(0, 500) || null;
        const isWaterfront = (b.is_waterfront === true || b.is_waterfront === false) ? b.is_waterfront : null;
        let wf = parseInt(b.waterfront_feet, 10); if (!Number.isFinite(wf) || wf < 0 || wf > 100000) wf = null;

        const enumMap = { buyer: 'buyer', seller: 'seller' };
        const enumType = enumMap[source] || 'general_contact';
        const score = scoreLead({ enumType, email, phone, notes, isWaterfront, wfFeetNum: wf, address: propAddress });

        // Resolve lake by slug if the form was opened on a lake page.
        let leadLakeId = null;
        const lakeSlug = (b.lake_slug || '').toString().trim().slice(0, 120);
        if (lakeSlug) {
            try { leadLakeId = (await pool.query(`SELECT id FROM lakes WHERE slug = $1 LIMIT 1`, [lakeSlug])).rows[0]?.id || null; }
            catch (_) {}
        }

        // Link to an existing user account by email (backfill happens on signup too).
        let userId = null;
        if (email) {
            try { userId = (await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [email])).rows[0]?.id || null; }
            catch (_) {}
        }

        await pool.query(
            `INSERT INTO leads (
                full_name, first_name, email, phone, message,
                lead_type, lead_source, lead_status, property_address,
                is_waterfront, waterfront_feet, lead_score, lead_tier,
                lead_session_id, is_partial, user_id, lake_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$11,$12,$13,TRUE,$14,$15)
             ON CONFLICT (lead_session_id) WHERE lead_session_id IS NOT NULL
             DO UPDATE SET
                full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name,
                email = EXCLUDED.email, phone = EXCLUDED.phone, message = EXCLUDED.message,
                lead_type = EXCLUDED.lead_type, lead_source = EXCLUDED.lead_source,
                property_address = EXCLUDED.property_address, is_waterfront = EXCLUDED.is_waterfront,
                waterfront_feet = EXCLUDED.waterfront_feet, lead_score = EXCLUDED.lead_score,
                lead_tier = EXCLUDED.lead_tier, user_id = COALESCE(EXCLUDED.user_id, leads.user_id),
                lake_id = COALESCE(EXCLUDED.lake_id, leads.lake_id), updated_at = NOW()
             WHERE leads.is_partial = TRUE`,
            [name, firstName, email, phone, notes, enumType, source, propAddress,
             isWaterfront, wf, score.score, score.tier, sessionId, userId, leadLakeId]);

        res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[createPartialLead]', err.message);
        // Never surface an error to the form — partial capture is best-effort.
        res.json({ success: true, saved: false });
    }
};

/**
 * releaseHeldLeads(agentId) — B3 auto-release. When an agent becomes an active
 * PAYING (or comped) published agent, any held_no_agent leads on the lakes they
 * now cover route to them, newest-first, with routed_at stamped so the hold
 * delay is measurable. Best-effort; safe to call on every activation event.
 */
async function releaseHeldLeads(agentId) {
    if (!agentId) return { released: 0 };
    try {
        const ar = await pool.query(
            `SELECT a.id, a.user_id, a.is_published, u.email,
                    COALESCE(a.display_name, u.full_name) AS name,
                    ((COALESCE(m.code,'free') <> 'free') OR a.tier_comped) AS paying
               FROM agents a JOIN users u ON u.id = a.user_id
               LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.id = $1 LIMIT 1`, [agentId]);
        const ag = ar.rows[0];
        if (!ag || !ag.paying || !ag.is_published) return { released: 0 };

        // Lakes this agent covers (direct agent_lakes OR a shared geo tag).
        const lakes = await pool.query(
            `SELECT DISTINCT l.id, l.slug FROM lakes l
              WHERE EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = $1 AND al.lake_id = l.id)
                 OR EXISTS (SELECT 1 FROM user_tags ut JOIN lake_tags lt ON lt.tag_id = ut.tag_id
                             WHERE ut.user_id = $2 AND lt.lake_id = l.id)`,
            [agentId, ag.user_id]);
        if (!lakes.rows.length) return { released: 0 };
        const lakeIds = lakes.rows.map(r => r.id);
        const lakeSlugs = lakes.rows.map(r => r.slug).filter(Boolean);

        // Held leads on those lakes, newest-first.
        const held = await pool.query(
            `SELECT id, full_name, email, phone, lead_type
               FROM leads
              WHERE held_no_agent = TRUE AND deleted_at IS NULL
                AND (lake_id = ANY($1::uuid[]) OR landing_page_lake = ANY($2::text[]))
              ORDER BY created_at DESC LIMIT 200`,
            [lakeIds, lakeSlugs.length ? lakeSlugs : ['']]);
        let released = 0;
        for (const lead of held.rows) {
            await pool.query(
                `UPDATE leads SET agent_id = $1, assigned_user_id = $2, held_no_agent = FALSE,
                        lead_status = 'contacted', pipeline_status = 'routed',
                        assigned_at = NOW(), routed_at = COALESCE(routed_at, NOW()), updated_at = NOW()
                  WHERE id = $3 AND held_no_agent = TRUE`, [agentId, ag.user_id, lead.id]);
            released++;
            try {
                emailService.sendMatchedAgentNotification({
                    to: ag.email, agentFirstName: (ag.name || '').split(' ')[0] || 'there',
                    lead: { id: lead.id, name: lead.full_name, email: lead.email, phone: lead.phone, type: lead.lead_type },
                });
            } catch (_) {}
            try { require('../services/agent-notify').notifyAgent(agentId, { type: 'lead', title: `A held lead just routed to you: ${lead.full_name || 'someone'}`, body: 'They were waiting for a paying agent on your lake — respond fast.', link: '?view=leads' }); } catch (_) {}
        }
        if (released) {
            console.log(`[held-release] agent ${agentId} → ${released} lead(s)`);
            logActivity({ event_type: 'lead.held_released', event_scope: 'lead', actor: { type: 'system', label: 'held-release' }, target: { type: 'agent', id: agentId }, details: { released } });
        }
        return { released };
    } catch (e) { console.warn('[releaseHeldLeads]', e.message); return { released: 0, error: e.message }; }
}

module.exports = { createLead, createPartialLead, getAdminLeads, getMyLeads, releaseHeldLeads };

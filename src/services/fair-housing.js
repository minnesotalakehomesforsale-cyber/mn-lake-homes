// Fair Housing guardrail — appended to any AI system prompt that can produce
// real-estate or marketing copy. The Fair Housing Act prohibits language that
// indicates a preference, limitation, or discrimination (or that could "steer")
// based on a protected class. AI models will happily write non-compliant phrases
// ("great for families", "safe Christian neighborhood", "perfect for young
// professionals") unless told not to — so we tell them not to, everywhere.
const FAIR_HOUSING_GUARDRAIL = `
FAIR HOUSING COMPLIANCE (mandatory): All output must comply with the U.S. Fair Housing Act. Never use language that indicates a preference, limitation, or steering based on race, color, religion, sex, familial status, national origin, disability, or any other protected class. Describe the PROPERTY and the LAKE/AREA, never the ideal buyer or the people who live there. Do not reference schools by desirability, "safe"/"good"/"bad" neighborhoods, religious institutions as selling points, crime, demographics, or phrases like "family-friendly", "perfect for families/retirees/professionals", "exclusive", or "walking distance to church". Keep all descriptions about features, amenities, and geography only.`;

module.exports = { FAIR_HOUSING_GUARDRAIL };

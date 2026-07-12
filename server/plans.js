// Subscription plan catalog — the single source of truth for what a learner or
// school can buy, and which access tracks each plan unlocks.
//
// Access is expressed as two boolean "tracks" the rest of the app already
// understands: `junior` (KS1–KS3) and `adult` (Higher Education + vocational
// courses). New plans (annual, family, school) simply map onto those tracks, so
// nothing downstream has to change.

export const PLAN_CATALOG = [
  {
    id: "junior", name: "Junior", audience: "KS1–KS3", interval: "month",
    price: "£4.99", tracks: { junior: true, adult: false }, priceEnv: "STRIPE_PRICE_JUNIOR",
    blurb: "All Key Stage 1–3 subjects, games and homework help.",
  },
  {
    id: "juniorAnnual", name: "Junior — Annual", audience: "KS1–KS3", interval: "year",
    price: "£49.99", save: "2 months free", tracks: { junior: true, adult: false }, priceEnv: "STRIPE_PRICE_JUNIOR_ANNUAL",
    blurb: "Everything in Junior, billed yearly — two months free.",
  },
  {
    id: "adult", name: "Higher & Courses", audience: "HE + vocational", interval: "month",
    price: "£7.99", tracks: { junior: false, adult: true }, priceEnv: "STRIPE_PRICE_ADULT",
    blurb: "University-level tutoring plus exam-prep vocational courses.",
  },
  {
    id: "adultAnnual", name: "Higher & Courses — Annual", audience: "HE + vocational", interval: "year",
    price: "£79.99", save: "2 months free", tracks: { junior: false, adult: true }, priceEnv: "STRIPE_PRICE_ADULT_ANNUAL",
    blurb: "Everything in Higher & Courses, billed yearly — two months free.",
  },
  {
    id: "family", name: "Family", audience: "everyone at home", interval: "month",
    price: "£9.99", best: true, tracks: { junior: true, adult: true }, priceEnv: "STRIPE_PRICE_FAMILY",
    blurb: "Every stage for every child in the house — one simple price.",
  },
  {
    id: "school", name: "School / Classroom", audience: "teachers", interval: "month",
    price: "£29.99", tracks: { junior: true, adult: true }, priceEnv: "STRIPE_PRICE_SCHOOL",
    blurb: "Unlock every stage for a whole class, with the teacher portal.",
  },
];

const BY_ID = Object.fromEntries(PLAN_CATALOG.map((p) => [p.id, p]));

export function getPlan(id) {
  return BY_ID[id] || null;
}

// Which access tracks a plan grants. Unknown plans grant nothing.
export function tracksForPlan(id) {
  return getPlan(id)?.tracks || { junior: false, adult: false };
}

// The env var name holding the Stripe price id for a plan.
export function priceEnvFor(id) {
  return getPlan(id)?.priceEnv || null;
}

// Resolve a plan id to its configured Stripe price id (or "" if unset).
export function stripePriceFor(id, env = process.env) {
  const key = priceEnvFor(id);
  return key ? (env[key] || "") : "";
}

// Public catalog (safe to expose): drops the internal env-var names and flags
// which plans are actually purchasable given the configured Stripe prices.
export function publicCatalog(env = process.env) {
  return PLAN_CATALOG.map(({ priceEnv, ...p }) => ({
    ...p,
    available: Boolean(env.STRIPE_SECRET_KEY && env[priceEnv]),
  }));
}

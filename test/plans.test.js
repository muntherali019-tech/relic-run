import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_CATALOG, getPlan, tracksForPlan, stripePriceFor, publicCatalog } from "../server/plans.js";

// The plan catalog is the single source of truth for what can be bought and
// which access tracks each plan unlocks — worth pinning down precisely.

test("catalog contains the monthly, annual, family and school plans", () => {
  const ids = PLAN_CATALOG.map((p) => p.id);
  for (const id of ["junior", "juniorAnnual", "adult", "adultAnnual", "family", "school"]) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
});

test("each plan declares a price, an interval and an env var", () => {
  for (const p of PLAN_CATALOG) {
    assert.ok(p.name && p.price && p.blurb);
    assert.ok(["month", "year"].includes(p.interval));
    assert.ok(p.priceEnv && /^STRIPE_PRICE_/.test(p.priceEnv));
  }
});

test("tracksForPlan maps plans to junior/adult access", () => {
  assert.deepEqual(tracksForPlan("junior"), { junior: true, adult: false });
  assert.deepEqual(tracksForPlan("juniorAnnual"), { junior: true, adult: false });
  assert.deepEqual(tracksForPlan("adult"), { junior: false, adult: true });
  assert.deepEqual(tracksForPlan("adultAnnual"), { junior: false, adult: true });
  // Family and School unlock everything.
  assert.deepEqual(tracksForPlan("family"), { junior: true, adult: true });
  assert.deepEqual(tracksForPlan("school"), { junior: true, adult: true });
});

test("unknown plans grant nothing and resolve to no plan", () => {
  assert.equal(getPlan("nope"), null);
  assert.deepEqual(tracksForPlan("nope"), { junior: false, adult: false });
  assert.equal(stripePriceFor("nope"), "");
});

test("stripePriceFor reads the plan's configured env var", () => {
  const env = { STRIPE_PRICE_FAMILY: "price_fam_123" };
  assert.equal(stripePriceFor("family", env), "price_fam_123");
  assert.equal(stripePriceFor("junior", env), ""); // unset -> empty
});

test("publicCatalog hides env-var names and flags availability", () => {
  const withStripe = publicCatalog({ STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_FAMILY: "price_fam" });
  const fam = withStripe.find((p) => p.id === "family");
  assert.equal(fam.available, true);
  assert.ok(!("priceEnv" in fam));
  const junior = withStripe.find((p) => p.id === "junior");
  assert.equal(junior.available, false); // secret set but no price id

  const noStripe = publicCatalog({});
  assert.ok(noStripe.every((p) => p.available === false));
});

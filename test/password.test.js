import test from "node:test";
import assert from "node:assert/strict";
import { passwordProblem, candidates, isRun, pwnedCount, checkPassword, MIN_LENGTH } from "../server/password.js";

// The point of these tests is the two-sided risk. A strength check that is too
// weak lets "password" through; one that is too eager rejects a perfectly good
// passphrase and pushes the user to something shorter they can retype. Both
// directions are asserted.

// Every message the module is allowed to return. Asserting membership pins them
// as fixed strings, which is also how we know none can echo the user's secret
// back — a substring check can't express that, because the legitimate message
// for "password" contains the word "password".
const MESSAGES = [
  "Password must be text.",
  `Password must be at least ${MIN_LENGTH} characters.`,
  "Please use more than one repeated character.",
  "That password repeats too simple a pattern — please pick another.",
  "Please avoid a straight run of letters, numbers or keyboard keys.",
  "That password is too easy to guess — please pick something less common.",
  "Please choose a password that isn't part of your email address.",
];

const ok = (pw, ctx) => assert.equal(passwordProblem(pw, ctx), null, `should have accepted: ${pw}`);
const bad = (pw, ctx) => {
  const problem = passwordProblem(pw, ctx);
  assert.ok(problem, `should have rejected: ${pw}`);
  assert.ok(MESSAGES.includes(problem), `message is not one of the fixed set: ${problem}`);
  return problem;
};

test("length is still the first gate", () => {
  assert.match(bad("sevench"), /at least 8/);
  assert.match(bad(""), /at least 8/);
  assert.equal(passwordProblem("x".repeat(MIN_LENGTH - 1)), `Password must be at least ${MIN_LENGTH} characters.`);
});

test("rejects the passwords that actually top credential-stuffing lists", () => {
  for (const pw of ["password", "password1", "iloveyou", "letmein1", "football", "welcome1", "sunshine"]) {
    assert.match(bad(pw), /too easy to guess/);
  }
  // "qwertyuiop" is also refused, but as a keyboard run rather than a blocklist
  // hit — it is literally the whole top row. Either message is a correct answer.
  assert.match(bad("qwertyuiop"), /straight run/);
});

test("sees through leetspeak, capitals and punctuation", () => {
  // These all satisfy a naive "upper + digit + symbol" rule, which is exactly
  // why this check is a blocklist rather than a composition rule.
  for (const pw of ["P@ssw0rd", "Passw0rd!", "L3tm31n!", "1Password", "!!iloveyou!!"]) {
    assert.match(bad(pw), /too easy to guess/);
  }
});

test("rejects repetition and straight runs", () => {
  assert.match(bad("aaaaaaaa"), /repeated character/);
  assert.match(bad("abcabcabcabc"), /repeats too simple a pattern/);
  assert.match(bad("12345678"), /straight run/);
  assert.match(bad("abcdefgh"), /straight run/);
  assert.match(bad("87654321"), /straight run/);
  assert.match(bad("qwertyui"), /straight run/);
});

test("rejects the service's own vocabulary", () => {
  for (const pw of ["whiskeracademy", "MochiTheCat", "education1"]) {
    assert.match(bad(pw), /too easy to guess/);
  }
});

test("rejects a password built from the account's own email", () => {
  assert.match(
    bad("bramblewick99", { email: "bramblewick@example.com" }),
    /part of your email address/,
  );
  // Short local parts are not distinctive enough to match on — "sam" would
  // wrongly reject "samples-are-fun".
  ok("samples-are-fun", { email: "sam@example.com" });
});

test("accepts passphrases and ordinary strong passwords", () => {
  // The failure mode worth guarding: a check so eager that good passwords bounce.
  for (const pw of [
    "correct horse battery staple",
    "purple-otter-lamp-73",
    "Tr0ub4dor&3",
    "longenough1",
    "eightchr",
    "my daughter starts year 4",
    "9f2Kq7wZ",
  ]) {
    ok(pw);
  }
});

test("candidates() derives the forms a blocklist entry can hide in", () => {
  // The awkward case: the trailing digit must be stripped BEFORE the 0 is folded,
  // or the 1 becomes an i and nothing matches.
  const c = candidates("P@ssw0rd1");
  assert.ok(c.includes("password"), `expected "password" among: ${c.join(", ")}`);
  assert.ok(!c.includes(""), "no empty candidate");
});

test("isRun() only fires on a whole-string run", () => {
  assert.equal(isRun("abcdef"), true);
  assert.equal(isRun("fedcba"), true);
  assert.equal(isRun("ab"), false, "too short to be meaningful");
  assert.equal(isRun("abcdef-otter"), false, "a run inside a longer password is fine");
});

test("non-string input is handled rather than thrown on", () => {
  for (const v of [undefined, null, 12345678, {}]) {
    assert.ok(passwordProblem(v), `should reject ${String(v)}`);
  }
});

/* ---------- Have I Been Pwned ---------- */

// A password the LOCAL rules accept — the whole point of these tests is the gap
// HIBP closes, and "password" would be refused by the blocklist long before any
// request went out. It also must not be a substring of the request URL: the host
// is api.pwnedPASSWORDs.com, so "password" would false-positive the assertion
// below that the secret never goes on the wire.
const PW = "Tr0ub4dor&3";
const PW_PREFIX = "87457";
const PW_SUFFIX = "2E7A5AE6A49466A6AC578B98ADBA78C6AA6";

// A stand-in for the range endpoint. Records what it was asked for so the tests
// can assert on the request itself, not just the answer.
function fakeRange({ body = "", status = 200, throws = null } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    if (throws) throw throws;
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test("pwnedCount sends ONLY the 5-character hash prefix", async () => {
  // This is the entire privacy claim of the feature, so assert it directly:
  // neither the password nor its full hash may appear anywhere in the request.
  const fetchImpl = fakeRange({ body: `${PW_SUFFIX}:12345\n` });
  await pwnedCount(PW, { fetchImpl });

  const { url, opts } = fetchImpl.calls[0];
  assert.equal(url, `https://api.pwnedpasswords.com/range/${PW_PREFIX}`);

  const wire = url + JSON.stringify(opts?.headers ?? {});
  assert.ok(!wire.includes(PW), "the password must never be sent");
  assert.ok(!wire.includes(PW_SUFFIX), "the hash suffix must never be sent");
  assert.ok(!wire.includes(PW_PREFIX + PW_SUFFIX), "the full hash must never be sent");
  assert.equal(opts.headers["Add-Padding"], "true", "padding hides the prefix from response size");
});

test("pwnedCount reports the breach count, or zero when absent", async () => {
  assert.equal(await pwnedCount(PW, { fetchImpl: fakeRange({ body: `${PW_SUFFIX}:9659365\r\n` }) }), 9659365);
  // Present in the padded response with a count of 0 = not actually breached.
  assert.equal(await pwnedCount(PW, { fetchImpl: fakeRange({ body: `${PW_SUFFIX}:0\n` }) }), 0);
  // Prefix shared, suffix absent.
  assert.equal(await pwnedCount(PW, { fetchImpl: fakeRange({ body: "0000000000000000000000000000000000A:4\n" }) }), 0);
});

test("pwnedCount returns null (not a throw, not a zero) when HIBP misbehaves", async () => {
  // null must be distinguishable from 0 — "unknown" and "clean" are not the same.
  assert.equal(await pwnedCount(PW, { fetchImpl: fakeRange({ status: 503 }) }), null);
  assert.equal(await pwnedCount(PW, { fetchImpl: fakeRange({ throws: new Error("ENOTFOUND") }) }), null);
  assert.equal(await pwnedCount(PW, { fetchImpl: fakeRange({ body: "not a valid body at all" }) }), 0);
});

test("pwnedCount gives up rather than hanging the signup request", async () => {
  const hang = async (_url, opts) =>
    new Promise((_resolve, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const started = Date.now();
  assert.equal(await pwnedCount(PW, { fetchImpl: hang, timeoutMs: 100 }), null);
  assert.ok(Date.now() - started < 2000, "must abort on the timeout, not wait for the socket");
});

test("checkPassword only calls HIBP when enabled, and never for an already-bad password", async () => {
  const never = fakeRange({ body: `${PW_SUFFIX}:1\n` });
  // Disabled: no network call at all.
  assert.equal(await checkPassword("purple-otter-lamp-73", { pwned: false, fetchImpl: never }), null);
  assert.equal(never.calls.length, 0, "must not call HIBP when disabled");

  // Already rejected locally: don't spend a request confirming it.
  assert.match(await checkPassword("short", { pwned: true, fetchImpl: never }), /at least 8/);
  assert.equal(never.calls.length, 0, "must not call HIBP for a password the local rules already refused");
});

test("checkPassword rejects a breached password that passes every local rule", async () => {
  // "Tr0ub4dor&3" passes every local rule (an earlier test asserts exactly that)
  // yet is famously in the corpus. This is precisely the gap HIBP closes, and it
  // is why the local blocklist alone was never enough.
  const breached = fakeRange({ body: `${PW_SUFFIX}:42\n` });
  const problem = await checkPassword(PW, { pwned: true, fetchImpl: breached });
  assert.match(problem, /appeared in a data breach/);
});

test("checkPassword fails OPEN when HIBP is unreachable", async () => {
  // A third-party outage must not stop a parent creating an account. The local
  // rules have already run, so this is a degradation, not an absence of checks.
  const down = fakeRange({ throws: new Error("ECONNREFUSED") });
  assert.equal(await checkPassword("purple-otter-lamp-73", { pwned: true, fetchImpl: down }), null);
  // ...but the local rules still bite while HIBP is down.
  assert.match(await checkPassword("iloveyou", { pwned: true, fetchImpl: down }), /too easy to guess/);
});

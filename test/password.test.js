import test from "node:test";
import assert from "node:assert/strict";
import { passwordProblem, candidates, isRun, MIN_LENGTH } from "../server/password.js";

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

// Password strength, following NIST SP 800-63B.
//
// That guidance is deliberately NOT "one uppercase, one digit, one symbol".
// Composition rules are explicitly discouraged: they push people to "Password1!"
// — which satisfies every rule and is in the first page of every cracking
// dictionary — while blocking passphrases that are genuinely strong. What the
// guidance asks for instead is a *length* minimum plus a check against values
// "commonly used, expected, or compromised". That is what this module does.
//
// Two layers. The list below runs always and offline; the Have I Been Pwned
// corpus (checkPassword, at the bottom) runs when PWNED_PASSWORDS is set and
// covers the ~900 million secrets no hand-written list ever could.

import crypto from "node:crypto";

export const MIN_LENGTH = 8;

// Top credential-stuffing entries, plus the words this particular product invites
// (its own name, its mascot, its audience's vocabulary). Entries are stored in the
// normalised form produced by candidates() below: lowercase, letters and digits
// only. Spell them plainly — "p@ssw0rd" is folded onto "password" automatically.
const COMMON = new Set([
  "password", "passwd", "pass", "letmein", "welcome", "admin", "administrator",
  "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "qazwsx",
  "iloveyou", "princess", "sunshine", "shadow", "monkey", "dragon", "master",
  "football", "baseball", "superman", "batman", "trustno", "starwars", "pokemon",
  "michael", "jennifer", "jordan", "hunter", "harley", "ranger", "buster",
  "computer", "internet", "secret", "freedom", "whatever", "cheese", "chocolate",
  "abc", "abcd", "abcdef", "abcdefg", "abcdefgh", "test", "testing", "temp",
  "login", "user", "guest", "root", "changeme", "default", "access", "money",
  "summer", "winter", "spring", "autumn", "january", "december", "liverpool",
  "arsenal", "chelsea", "manchester", "england", "london", "charlie", "george",
  // Context-specific: the service, its mascot, its subject matter.
  "whisker", "whiskeracademy", "academy", "mochi", "mochithecat",
  "education", "educationacademy", "school", "teacher", "parent", "homework",
]);

// Undo the substitutions people reach for when a site nags them, so "P@ssw0rd"
// and "l3tm31n" are recognised as the dictionary words they are. Punctuation and
// digits are folded separately: "Passw0rd!" needs the 0 folded but the ! merely
// dropped, and folding both at once turns it into "passwordi", which matches
// nothing.
const PUNCT_LEET = { "@": "a", "$": "s", "!": "i" };
const DIGIT_LEET = { "4": "a", "8": "b", "3": "e", "1": "i", "0": "o", "5": "s", "7": "t" };

// Every form a blocklist entry might be hiding in. One clever normalisation can't
// cover this: "password1" needs its trailing digit stripped, "Passw0rd" needs the
// 0 folded, and "P@ssw0rd1" needs the strip BEFORE the fold (fold first and the
// trailing 1 becomes an i). So apply the transforms in combination and test them
// all — 24 cheap string ops, done once per signup.
export function candidates(raw) {
  const low = String(raw).toLowerCase();
  const out = new Set();

  const bases = [
    low.replace(/[^a-z0-9]/g, ""),                                            // punctuation dropped
    low.replace(/[@$!]/g, (c) => PUNCT_LEET[c]).replace(/[^a-z0-9]/g, ""),    // punctuation folded first
  ];
  const foldDigits = (v) => v.replace(/[4831057]/g, (c) => DIGIT_LEET[c] ?? c);

  for (const base of bases) {
    for (const trimmed of [base, base.replace(/\d+$/, ""), base.replace(/^\d+/, "")]) {
      for (const v of [trimmed, foldDigits(trimmed)]) {
        if (v) out.add(v);
        const letters = v.replace(/[^a-z]/g, "");
        if (letters) out.add(letters);
      }
    }
  }
  return [...out];
}

// Straight runs along an alphabet, the number line, or a keyboard row — forwards
// or backwards. Only flagged when the WHOLE password is one run, so "abcdefgh" is
// refused but "abcd-Tuesday-42" is left alone.
const RUNS = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
export function isRun(raw) {
  const low = String(raw).toLowerCase();
  if (low.length < 3) return false;
  const back = [...low].reverse().join("");
  return RUNS.some((row) => row.includes(low) || row.includes(back));
}

/**
 * Returns a learner-safe message describing what is wrong, or null if the
 * password is acceptable. Messages say what to change without lecturing, and
 * never echo the password back.
 *
 * `email` is optional context: a password that contains your own address is
 * guessable by anyone who knows it.
 */
export function passwordProblem(password, { email = "" } = {}) {
  // A JSON body can carry a number, an object or null here. Coercing would hash
  // "[object Object]" and call it a password; require real text instead.
  if (typeof password !== "string") return "Password must be text.";
  const raw = password;

  if (raw.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (/^(.)\1+$/.test(raw)) return "Please use more than one repeated character.";
  if (/^(.{1,3})\1+$/.test(raw)) return "That password repeats too simple a pattern — please pick another.";
  if (isRun(raw)) return "Please avoid a straight run of letters, numbers or keyboard keys.";

  const forms = candidates(raw);
  if (forms.some((f) => COMMON.has(f))) {
    return "That password is too easy to guess — please pick something less common.";
  }

  // Context-specific words: the account's own email, and the service itself.
  const local = String(email).toLowerCase().split("@")[0].replace(/[^a-z0-9]/g, "");
  if (local.length >= 4 && forms.some((f) => f.includes(local))) {
    return "Please choose a password that isn't part of your email address.";
  }

  return null;
}

/* ---------- Have I Been Pwned (opt-in via PWNED_PASSWORDS) ---------- */

const PWNED_URL = "https://api.pwnedpasswords.com/range/";
const PWNED_TIMEOUT_MS = Number(process.env.PWNED_TIMEOUT_MS || 2500);

export const pwnedEnabled = () => /^(1|true|yes|on)$/i.test(process.env.PWNED_PASSWORDS || "");

/**
 * How many times this password appears in the Have I Been Pwned corpus, or
 * `null` if the service could not be reached.
 *
 * **The password never leaves this process, and neither does its full hash.**
 * Only the first five hex characters of the SHA-1 go out (k-anonymity): HIBP
 * returns every suffix sharing that prefix — several hundred of them — and the
 * comparison happens locally. The service cannot tell which suffix we cared
 * about, or whether we found a match. `Add-Padding` asks it to pad the response
 * to a uniform size so an observer cannot infer the prefix from response length.
 *
 * No API key: the range endpoint is unauthenticated and free. No dependency:
 * global fetch. `fetchImpl` is injectable so tests never touch the network.
 */
export async function pwnedCount(password, { fetchImpl = fetch, timeoutMs = PWNED_TIMEOUT_MS } = {}) {
  const sha1 = crypto.createHash("sha1").update(String(password), "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(PWNED_URL + prefix, {
      signal: ctrl.signal,
      headers: { "Add-Padding": "true", "User-Agent": "whisker-academy" },
    });
    if (!res.ok) return null;
    for (const line of (await res.text()).split("\n")) {
      const [suf, count] = line.trim().split(":");
      // Padding rows are real suffixes with a count of 0, so an exact match on a
      // padded row correctly reports "not breached".
      if (suf === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null; // offline, DNS failure, timeout, 5xx — the caller fails open
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The full check: local rules first (free, offline, always on), then the breach
 * corpus if it is enabled. Returns a user-safe message, or null to accept.
 *
 * **Fails open on purpose.** If HIBP is unreachable this resolves to whatever the
 * local rules said — a third-party outage must never stop a parent creating an
 * account, and because the blocklist has already run we are never left with no
 * protection at all.
 */
export async function checkPassword(password, { email = "", fetchImpl, pwned = pwnedEnabled() } = {}) {
  const local = passwordProblem(password, { email });
  if (local || !pwned) return local;

  const count = await pwnedCount(password, fetchImpl ? { fetchImpl } : {});
  if (count === null || count === 0) return null;
  return "That password has appeared in a data breach — please choose a different one.";
}

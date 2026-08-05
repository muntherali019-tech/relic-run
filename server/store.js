import fs from "fs";
import path from "path";
import crypto from "crypto";

// Storage backends (route handlers only use load()/save(); the backend is swappable here):
//   • File (default): a JSON file under server/data — great for local dev and any host
//     with a persistent disk.
//   • Postgres (set DATABASE_URL): the whole dataset is kept as one JSON row, loaded into
//     memory on boot and written back on save, so accounts survive restarts and redeploys
//     even on hosts with an ephemeral filesystem. Run `npm install pg` to enable it.

const DIR = path.join(process.cwd(), "server", "data");
const FILE = path.join(DIR, "db.json");
const EMPTY = { users: {}, children: {}, classes: {}, goals: {} };

let cache = null;       // in-memory copy of the whole dataset
let backend = "file";   // "file" | "pg"
let pool = null;        // pg Pool when backend === "pg"

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(EMPTY, null, 2));
}
function readFile() { ensure(); try { return { ...EMPTY, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch { return { ...EMPTY }; } }
function writeFile(db) { ensure(); fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

// Arbitrary but stable key for the schema advisory lock ("whis" as an int).
const SCHEMA_LOCK = 0x77686973;

// CREATE TABLE IF NOT EXISTS is NOT atomic in Postgres: the existence check and the
// creation are separate steps, so two instances booting together can both find the
// table missing and one dies with a duplicate pg_type row. Deploys and scale-ups
// start instances simultaneously, so this is the normal case, not a corner case —
// and the loser fell through to the file store, quietly serving its own local copy
// of the data. An advisory lock serialises the DDL; it is released with the
// transaction, so a crashed instance cannot wedge the next boot.
async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK]);
    await client.query("CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL)");
    await client.query("CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count int NOT NULL, reset_at bigint NOT NULL)");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Call once at startup (before serving) so the cache is ready.
export async function initStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const pg = await import("pg");
      const Pool = pg.Pool || pg.default?.Pool;
      const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
      pool = new Pool({ connectionString: url, ssl });
      await ensureSchema();
      // Expired windows are dead weight; the hit query resets them in place, so this
      // only reclaims keys nobody has touched again.
      setInterval(() => { pool.query("DELETE FROM rate_limits WHERE reset_at <= $1", [Date.now()]).catch(() => {}); }, 10 * 60000).unref();
      const r = await pool.query("SELECT data FROM app_state WHERE id = 1");
      if (r.rows[0]?.data) {
        cache = { ...EMPTY, ...r.rows[0].data };
      } else {
        // First boot against an empty database: import any existing file-store
        // data so accounts created before the DATABASE_URL switch carry over.
        cache = fs.existsSync(FILE) ? readFile() : { ...EMPTY };
        const imported = Object.keys(cache.users).length;
        await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(cache)]);
        if (imported) console.log(`  Store: imported ${imported} account(s) from the JSON file into Postgres`);
      }
      backend = "pg";
      console.log("  Store: Postgres (durable across restarts)");
      return;
    } catch (e) {
      console.error("  Store: Postgres unavailable (" + (e.message || e) + ") — using the file store instead.");
      console.error("  If you meant to use Postgres, run `npm install pg` and check DATABASE_URL.");
    }
  }
  backend = "file";
  cache = readFile();
  console.log("  Store: JSON file at server/data/db.json");
}

export function load() { if (!cache) cache = backend === "file" ? readFile() : { ...EMPTY }; return cache; }

export function save(db) {
  cache = db;
  if (backend === "pg") persistPg(db);   // async, non-blocking
  else writeFile(db);                     // sync, immediate (unchanged behaviour)
}

async function persistPg(db) {
  try { await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = $1::jsonb", [JSON.stringify(db)]); }
  catch (e) { console.error("  Store: DB write failed —", e.message || e); }
}

/* ---------- shared rate-limit counters ---------- */
// The limiter in index.js counts per process, so N instances behind a load balancer
// allow N times the intended rate. When Postgres is the backend the counters live
// here instead and every instance shares them.
//
// The whole fixed-window step is ONE statement on purpose: a read-then-write would
// let two instances both read count=9 and both allow the request. The upsert takes a
// row lock, so concurrent hits serialise and the count is exact.
//
// Returns null when there is no shared backend — the caller then falls back to its
// own in-memory counter rather than dropping the limit entirely.
export async function rateLimitHit(key, windowMs, now = Date.now()) {
  if (backend !== "pg" || !pool) return null;
  const resetAt = now + windowMs;
  const r = await pool.query(
    `INSERT INTO rate_limits AS t (key, count, reset_at) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE
       SET count    = CASE WHEN t.reset_at <= $3 THEN 1 ELSE t.count + 1 END,
           reset_at = CASE WHEN t.reset_at <= $3 THEN $2 ELSE t.reset_at END
     RETURNING count, reset_at`,
    [key, resetAt, now],
  );
  const row = r.rows[0];
  // bigint comes back as a string from pg; Number() is safe for ms timestamps.
  return { count: Number(row.count), resetAt: Number(row.reset_at) };
}

export const newId = () => crypto.randomUUID();
export const newCode = () => crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char class code

// Mirror of the client progress summary so the dashboards can show stats.
export function overview(state) {
  const stats = state?.stats || {};
  let answered = 0, correct = 0, rounds = 0, best = 0;
  Object.values(stats).forEach((s) => {
    answered += s.answered || 0; correct += s.correct || 0; rounds += s.rounds || 0;
    best = Math.max(best, s.bestStreak || 0);
  });
  const courses = state?.courses || [];
  return {
    stars: state?.stars || 0,
    answered, correct, rounds, bestStreak: best,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    coursesTaken: courses.length,
    coursesPassed: courses.filter((c) => c.passed).length,
    lastActive: state?.history?.[0]?.ts || null,
  };
}

// Lowest-accuracy topics (with a few attempts), for "needs practice" in reports.
export function weakest(state, limit = 3) {
  const rows = [];
  Object.entries(state?.stats || {}).forEach(([key, s]) => {
    const [, subject] = key.split(":");
    Object.entries(s.byTopic || {}).forEach(([topic, t]) => {
      if (t.answered >= 3) rows.push({ subject, topic, accuracy: Math.round((t.correct / t.answered) * 100) });
    });
  });
  return rows.sort((a, b) => a.accuracy - b.accuracy).slice(0, limit);
}

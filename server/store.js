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

// Call once at startup (before serving) so the cache is ready.
export async function initStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const pg = await import("pg");
      const Pool = pg.Pool || pg.default?.Pool;
      const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
      pool = new Pool({ connectionString: url, ssl });
      await pool.query("CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL)");
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

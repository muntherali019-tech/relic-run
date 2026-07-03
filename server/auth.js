import crypto from "crypto";

// Dev auth using Node's built-in crypto (no native deps).
// For production, set AUTH_SECRET to a long random value, add rate limiting,
// email verification, and consider a managed auth provider.
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production")
  console.warn("⚠  AUTH_SECRET is not set — session tokens are signed with the insecure dev secret. Set AUTH_SECRET before going live.");

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  try {
    const h = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
  } catch { return false; }
}

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  try {
    const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch { return null; }
}

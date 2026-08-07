// Talks to the backend for accounts, cross-device sync, goals and classes.
const BASE = import.meta.env.VITE_API_BASE || "/api";
const SKEY = "whisker.session";

export function getSession() { try { return JSON.parse(localStorage.getItem(SKEY)); } catch { return null; } }
export function setSession(s) { try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch {} }
export function clearSession() { setSession(null); }

async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const signup = (email, password, role, name) => {
  let ref; try { ref = localStorage.getItem("whisker.ref") || undefined; } catch {}
  return req("/auth/signup", { method: "POST", body: { email, password, role, name, ref } })
    .then((d) => { try { localStorage.removeItem("whisker.ref"); } catch {} return d; });
};
export const login = (email, password) => req("/auth/login", { method: "POST", body: { email, password } });
export const me = (token) => req("/me", { token });
// Returns a FRESH token: the server invalidates every session opened before the
// change, including this one, so the caller must store what comes back.
export const changePassword = (token, currentPassword, newPassword) =>
  req("/me/password", { method: "PUT", token, body: { currentPassword, newPassword } });
export const leaderboard = (token, childId) => req(`/leaderboard?childId=${encodeURIComponent(childId)}`, { token });
export const claimReferral = (token) => req("/referral/claim", { method: "POST", token }).then((d) => d.bonus || 0);
export const qualifyReferral = (token) => req("/referral/qualify", { method: "POST", token }).then((d) => !!d.credited);

export const listChildren = (token) => req("/children", { token }).then((d) => d.children);
export const addChild = (token, name, ks) => req("/children", { method: "POST", token, body: { name, ks } }).then((d) => d.child);
export const getChildState = (token, id) => req(`/children/${id}/state`, { token }).then((d) => d.state);
export const putChildState = (token, id, state) => req(`/children/${id}/state`, { method: "PUT", token, body: { state } });
export const joinClass = (token, childId, code) => req(`/children/${childId}/join-class`, { method: "POST", token, body: { code } });

export const listGoals = (token, childId) => req(`/children/${childId}/goals`, { token }).then((d) => d.goals);
export const addGoal = (token, childId, goal) => req(`/children/${childId}/goals`, { method: "POST", token, body: goal }).then((d) => d.goal);
export const markGoal = (token, goalId, payload) => req(`/goals/${goalId}/mark`, { method: "POST", token, body: payload }).then((d) => d.goal);
export const setGoalStatus = (token, goalId, status) => req(`/goals/${goalId}`, { method: "PATCH", token, body: { status } }).then((d) => d.goal);
export const deleteGoal = (token, goalId) => req(`/goals/${goalId}`, { method: "DELETE", token });

export const listClasses = (token) => req("/classes", { token }).then((d) => d.classes);
export const addClass = (token, name) => req("/classes", { method: "POST", token, body: { name } }).then((d) => d.class);
export const addPupil = (token, classId, name, ks) => req(`/classes/${classId}/pupils`, { method: "POST", token, body: { name, ks } }).then((d) => d.child);

export const deleteAccount = (token) => req("/me", { method: "DELETE", token });
export const deleteChild = (token, id) => req(`/children/${id}`, { method: "DELETE", token });
export const setWeeklyEmail = (token, weeklyEmail) => req("/me/prefs", { method: "PUT", token, body: { weeklyEmail } }).then((d) => d.user);

// Setup for the Vitest (jsdom) specs under src/.
//
// Deliberately at the repo root rather than in test/: `node --test` discovers
// everything under a test/ directory, and it would try to execute this file and
// fail on the vitest import. The two runners share `npm test` but must not see
// each other's files.
import { afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom has no layout engine, so window.scrollTo throws "Not implemented" and
// floods the run with stack traces. The app scrolls to the top on screen change
// (src/App.jsx); stub it so real failures stay visible.
if (typeof window !== "undefined") window.scrollTo = () => {};

// The app keeps all client state in localStorage under `whisker.*`; clear it
// between tests so each one starts from a known device.
beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

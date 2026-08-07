import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Render smoke tests for the app shell.
//
// These exist because the sibling repo shipped a `ReferenceError: Cannot access
// 'onboard' before initialization` to main with a fully green build: every suite
// covered the Express API or pure logic, nothing ever mounted App, and the app
// rendered nothing but the ErrorBoundary fallback on every load while CI stayed
// green. This codebase has the same shell and the same exposure.
//
// So the bar here is deliberately low and broad: mount the shell exactly the way
// src/main.jsx does and assert real UI appears rather than the crash screen.
// Anything that throws during render fails these.

/** Text ErrorBoundary shows when a child throws — must never appear. */
const CRASH_TEXT = /Mochi tripped/i;

const renderApp = () =>
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );

/** Skip the first-launch language chooser so the home screen renders. */
const asReturningLearner = () => localStorage.setItem("whisker.onboarded", "1");

let errorSpy;

beforeEach(() => {
  // React logs component errors through console.error; capture rather than
  // silence so a crash is still assertable.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

/** Assert nothing threw during render, surfacing the real error if it did. */
function expectNoRenderError() {
  const thrown = errorSpy.mock.calls
    .map((args) => args.map(String).join(" "))
    .filter((line) => /Error:|error occurred in the/i.test(line));
  expect(thrown, `render logged an error:\n${thrown.join("\n")}`).toEqual([]);
  expect(screen.queryByText(CRASH_TEXT)).toBeNull();
}

describe("app shell renders", () => {
  it("mounts on a first launch and shows the language chooser", () => {
    // Fresh device: no whisker.* keys, so onboarding is shown.
    renderApp();
    expectNoRenderError();
    expect(screen.getByText(/Choose your language/i)).toBeInTheDocument();
  });

  it("mounts for a returning learner and shows the stage picker", () => {
    asReturningLearner();
    renderApp();
    expectNoRenderError();

    // The stages are the app's primary navigation — if these are on screen, the
    // shell rendered past every hook in the body.
    expect(screen.getByText(/Key Stage 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Key Stage 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Key Stage 3/i)).toBeInTheDocument();
  });

  it("renders the product name in the header", () => {
    asReturningLearner();
    renderApp();
    expectNoRenderError();
    expect(screen.getAllByText(/Education Academy/i).length).toBeGreaterThan(0);
  });

  it("survives a corrupt saved state instead of showing the crash screen", () => {
    // loadState merges over defaultState; malformed JSON must not take the app down.
    asReturningLearner();
    localStorage.setItem("whisker.v1", "{not valid json");
    renderApp();
    expectNoRenderError();
    expect(screen.getByText(/Key Stage 1/i)).toBeInTheDocument();
  });

  it("mounts twice without leaking state between mounts", () => {
    asReturningLearner();
    const first = renderApp();
    expectNoRenderError();
    first.unmount();

    renderApp();
    expectNoRenderError();
    expect(screen.getByText(/Key Stage 1/i)).toBeInTheDocument();
  });
});

describe("the crash guard itself works", () => {
  // If ErrorBoundary ever stopped catching, the tests above would pass for the
  // wrong reason — a thrown child would fail the whole render instead of
  // rendering the fallback. Pin the guard so those assertions stay meaningful.
  it("shows the fallback when a child throws", () => {
    const Boom = () => {
      throw new Error("boom");
    };
    // jsdom re-reports the caught error as an uncaught window error, which spams
    // the run with a stack trace that looks like a failure. Swallow just this one.
    const quiet = (e) => e.preventDefault();
    window.addEventListener("error", quiet);
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    } finally {
      window.removeEventListener("error", quiet);
    }
    expect(screen.getByText(CRASH_TEXT)).toBeInTheDocument();
  });
});

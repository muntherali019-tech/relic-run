// Reelmint front-end. Talks to the API and does all media work in the browser:
// renders Smart Slides to canvas, previews with voiceover, and exports a real
// .webm video via MediaRecorder.

const $ = (s) => document.querySelector(s);

let TOKEN = localStorage.getItem("reelmint_token") || "";
const api = (path, body) =>
  fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

let CONFIG = { enabled: false, model: "demo", watermark: true, plans: [] };
let USER = null; // logged-in user (or null)
let storyboard = null; // current storyboard
let chatLog = [];

// Brand kit (client-side, premium feature). Persisted in localStorage and
// baked into every render when enabled.
let BRAND = loadBrand();
function loadBrand() {
  try {
    return Object.assign(
      { on: false, handle: "@yourbrand", color: "#5b8cff", bg: "#0E1116" },
      JSON.parse(localStorage.getItem("reelmint_brand") || "{}")
    );
  } catch {
    return { on: false, handle: "@yourbrand", color: "#5b8cff", bg: "#0E1116" };
  }
}
function saveBrand() {
  localStorage.setItem("reelmint_brand", JSON.stringify(BRAND));
}
// Creator+ gate for premium client features.
function isPro() {
  return USER && (USER.plan === "creator" || USER.plan === "studio");
}
function requirePro(msg) {
  if (isPro()) return true;
  toast(msg || "That's a Creator feature — upgrade to unlock.");
  location.hash = "#pricing";
  return false;
}

const REDUCED_MOTION =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const EXAMPLES = [
  "3 morning habits that doubled my focus",
  "The $5 rule that saved me $4,000",
  "A 10-minute dinner with 3 ingredients",
  "How I got my first 1,000 customers with no ads",
  "The travel hack airlines hate",
  "A 20-minute workout that beats an hour",
];

const PALETTES = [
  { bg: "#0E1116", accent: "#5B8CFF", text: "#F4F6FB" },
  { bg: "#13070A", accent: "#FF5C7A", text: "#FFF1F3" },
  { bg: "#06120E", accent: "#36E0A0", text: "#EAFBF4" },
  { bg: "#120E06", accent: "#FFB23E", text: "#FFF6E8" },
  { bg: "#0B0716", accent: "#A66BFF", text: "#F3EDFF" },
];

// ---------- boot ----------
init();
async function init() {
  try {
    CONFIG = await fetch("/api/config", {
      headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
    }).then((r) => r.json());
    USER = CONFIG.user || null;
  } catch {}
  const pill = $("#statusPill");
  pill.textContent = CONFIG.enabled ? `● AI live · ${CONFIG.model}` : "● demo mode";
  pill.style.color = CONFIG.enabled ? "var(--good)" : "var(--muted)";
  if (!CONFIG.enabled)
    $("#createHint").textContent =
      "Demo mode — add ANTHROPIC_API_KEY on the server for real AI output.";
  renderAccount();
  renderFeatures();
  renderPlans();
  renderExamples();
  animateHero();
  wireTabs();
  wireCreate();
  wireEditor();
  wireHooks();
  wireSeries();
  wireImage();
  wireScan();
  wireRepurpose();
  wireBrand();
  wireAuth();
  handleReturnFromCheckout();
  drawScene(0, 0.5); // show the empty-state frame on load
}

// ---------- example idea chips ----------
function renderExamples() {
  const el = $("#exampleChips");
  if (!el) return;
  el.innerHTML = EXAMPLES.map((e) => `<button class="chip" type="button">${esc(e)}</button>`).join("");
  el.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      $("#topic").value = c.textContent;
      $("#topic").focus();
    })
  );
}

// ---------- tabs ----------
function selectTab(name) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((x) => x.classList.toggle("active", x.dataset.panel === name));
}
function wireTabs() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => selectTab(t.dataset.tab));
  });
}

// ---------- create ----------
function wireCreate() {
  const dur = $("#duration");
  dur.addEventListener("input", () => ($("#durLabel").textContent = dur.value + "s"));

  $("#genBtn").addEventListener("click", async () => {
    const topic = $("#topic").value.trim();
    if (!topic) return toast("Type your idea first ✍️");
    busy($("#genBtn"), true, "Generating…");
    try {
      const res = await api("/api/script", {
        topic,
        platform: $("#platform").value,
        tone: $("#tone").value,
        durationSec: Number(dur.value),
        format: Number(dur.value) > 90 ? "long" : "short",
      });
      if (res.error === "out_of_credits") {
        USER = res.user || USER;
        renderAccount();
        toast("You're out of credits this month — upgrade to keep minting.");
        location.hash = "#pricing";
        return;
      }
      if (res.user) {
        USER = res.user;
        renderAccount();
      }
      storyboard = res;
      renderStoryboard();
      drawScene(0, 0.5);
      toast("Storyboard minted ✨ — preview or export it.");
      chatLog = [{ role: "bot", text: "Storyboard ready. Tell me what to tweak!" }];
      renderChat();
    } catch (e) {
      toast("Generation failed — try again.");
    } finally {
      busy($("#genBtn"), false, "✨ Generate storyboard");
    }
  });

  $("#playBtn").addEventListener("click", () => (previewing ? stopPreview() : previewPlay()));
  $("#exportBtn").addEventListener("click", exportVideo);
  $("#pngBtn").addEventListener("click", () => downloadCanvas($("#stage"), "reelmint-frame.png"));
  $("#srtBtn").addEventListener("click", exportSRT);
}

// ---------- subtitles (.srt) — Creator+ premium export ----------
const SCENE_SECONDS = 2.6; // must match the preview/export cadence
function exportSRT() {
  if (!storyboard) return toast("Generate a storyboard first.");
  if (!requirePro("Subtitle export is a Creator feature — upgrade to unlock .srt.")) return;
  const srt = buildSRT(storyboard.scenes, SCENE_SECONDS);
  downloadBlob(new Blob([srt], { type: "application/x-subrip" }), "reelmint-subtitles.srt");
  toast("Subtitles exported 📝 (.srt)");
}
// Build a valid SRT from the storyboard's voiceover lines (mirrors the server's
// buildSRT so timings match the exported video).
function buildSRT(scenes, perScene) {
  const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");
  const stamp = (sec) => {
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${pad(sec / 3600)}:${pad((sec / 60) % 60)}:${pad(sec % 60)},${pad(ms, 3)}`;
  };
  return (
    (scenes || [])
      .map((sc, i) => {
        const text = (sc.voiceover || sc.caption || "").trim();
        return `${i + 1}\n${stamp(i * perScene)} --> ${stamp((i + 1) * perScene)}\n${text}`;
      })
      .join("\n\n") + "\n"
  );
}

function renderStoryboard() {
  const el = $("#storyboard");
  if (!storyboard) return (el.innerHTML = "");
  el.innerHTML = `
    <div><b>${esc(storyboard.title || "")}</b></div>
    <div class="muted">Hook: ${esc(storyboard.hook || "")}</div>
    ${storyboard.scenes
      .map(
        (s, i) => `<div class="scene-card">
          <span class="idx">SCENE ${i + 1}</span>
          <span class="cap">${esc(s.caption)}</span>
          <span class="vo">🎙 ${esc(s.voiceover)}</span>
        </div>`
      )
      .join("")}
    <div class="tagline">${(storyboard.hashtags || [])
      .map((h) => `<span class="tag">${esc(h)}</span>`)
      .join("")}</div>
    <div class="muted" style="font-size:13px">${esc(storyboard.description || "")}</div>`;
}

// ---------- canvas rendering ----------
// The active palette respects the brand kit when it's on (Creator+): the brand
// accent + background override the storyboard's per-scene palette so exports
// look on-brand.
function paletteFor(i) {
  const p = storyboard?.scenes?.[i]?.palette;
  const base = p && p.bg ? p : PALETTES[i % PALETTES.length];
  if (BRAND.on) return { bg: BRAND.bg, accent: BRAND.color, text: "#FFFFFF" };
  return base;
}

// Cheap, deterministic film grain that keeps exports from looking flat. Drawn
// as faint dotted noise seeded by scene index so it doesn't shimmer per frame.
function drawGrain(ctx, W, H, i) {
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = "#ffffff";
  let seed = (i + 1) * 9301;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let n = 0; n < 240; n++) ctx.fillRect(rand() * W, rand() * H, 1.4, 1.4);
  ctx.restore();
}

function drawScene(i, progress = 0.5, canvas = $("#stage")) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const scene = storyboard?.scenes?.[i];
  const pal = paletteFor(i);

  // gradient background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal.bg);
  g.addColorStop(1, shade(pal.bg, 24));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Ken Burns glow that drifts with progress
  const cx = W * (0.3 + 0.4 * progress);
  const cy = H * (0.35 + 0.2 * progress);
  const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, W * 0.9);
  glow.addColorStop(0, hexA(pal.accent, 0.35));
  glow.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  drawGrain(ctx, W, H, i);

  // cinematic vignette for depth
  const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (!scene) {
    // accent bar
    ctx.fillStyle = pal.accent;
    ctx.fillRect(W * 0.12, H * 0.2, W * 0.16, 8);
    ctx.fillStyle = hexA(pal.text, 0.55);
    ctx.font = `600 ${Math.round(W * 0.05)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Generate a storyboard →", W / 2, H / 2);
    drawBrandMark(ctx, W, H, pal);
    return;
  }

  // accent bar
  ctx.fillStyle = pal.accent;
  ctx.fillRect(W * 0.12, H * 0.2, W * 0.16, 8);

  // index label
  ctx.fillStyle = pal.accent;
  ctx.font = `700 ${Math.round(W * 0.045)}px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`SCENE ${i + 1}`, W * 0.12, H * 0.18);

  // caption (wrapped, big, with a soft shadow so it reads on any background)
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = W * 0.02;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = pal.text;
  ctx.textAlign = "left";
  const size = Math.round(W * 0.085);
  ctx.font = `800 ${size}px sans-serif`;
  wrapText(ctx, scene.caption || "", W * 0.12, H * 0.34, W * 0.76, size * 1.15);
  ctx.restore();

  // voiceover subtitle near bottom
  ctx.fillStyle = hexA(pal.text, 0.82);
  ctx.font = `500 ${Math.round(W * 0.04)}px sans-serif`;
  wrapText(ctx, scene.voiceover || "", W * 0.12, H * 0.78, W * 0.76, W * 0.05);

  // scene progress bar
  const total = storyboard?.scenes?.length || 1;
  const barY = H * 0.965, barX = W * 0.12, barW = W * 0.76;
  ctx.fillStyle = hexA(pal.text, 0.18);
  ctx.fillRect(barX, barY, barW, 4);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(barX, barY, barW * ((i + progress) / total), 4);

  drawBrandMark(ctx, W, H, pal);
}

// Brand handle (Creator+) or the free-tier watermark, bottom-right.
function drawBrandMark(ctx, W, H, pal) {
  if (BRAND.on && BRAND.handle) {
    ctx.fillStyle = hexA(pal.text, 0.85);
    ctx.font = `800 ${Math.round(W * 0.036)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(BRAND.handle, W * 0.9, H * 0.93);
  } else if (CONFIG.watermark) {
    ctx.fillStyle = hexA(pal.text, 0.55);
    ctx.font = `700 ${Math.round(W * 0.035)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("◉ Reelmint", W * 0.9, H * 0.94);
  }
}

// ---------- preview (with voiceover) ----------
let previewing = false;
function previewPlay() {
  if (!storyboard) return toast("Generate a storyboard first.");
  if (previewing) return;
  previewing = true;
  $("#playBtn").textContent = "■ Stop";
  const scenes = storyboard.scenes;
  let i = 0;
  const synth = window.speechSynthesis;
  if (synth) synth.cancel();

  const playOne = () => {
    if (!previewing || i >= scenes.length) return stopPreview();
    const start = performance.now();
    const dur = 2600;
    const anim = (now) => {
      if (!previewing) return;
      const p = Math.min(1, (now - start) / dur);
      drawScene(i, p);
      if (p < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
    if (synth && scenes[i].voiceover) {
      const u = new SpeechSynthesisUtterance(scenes[i].voiceover);
      u.rate = 1.05;
      u.onend = () => { i++; playOne(); };
      synth.speak(u);
    } else {
      setTimeout(() => { i++; playOne(); }, dur);
    }
  };
  playOne();
}
function stopPreview() {
  previewing = false;
  $("#playBtn").textContent = "▶ Preview";
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ---------- export video (canvas + ambient audio → webm) ----------
async function exportVideo() {
  if (!storyboard) return toast("Generate a storyboard first.");
  const btn = $("#exportBtn");
  busy(btn, true, "Rendering…");
  stopPreview();
  try {
    const canvas = $("#stage");
    const fps = 30;
    const stream = canvas.captureStream(fps);

    // gentle ambient pad so the file has an audio track
    const AC = window.AudioContext || window.webkitAudioContext;
    let audioCtx, dest;
    if (AC) {
      audioCtx = new AC();
      dest = audioCtx.createMediaStreamDestination();
      const pal = paletteFor(0);
      [196, 261.6, 329.6].forEach((f, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.value = 0.04;
        o.connect(g).connect(dest);
        o.start();
      });
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    rec.start();

    const scenes = storyboard.scenes;
    const perScene = SCENE_SECONDS * 1000; // ms — matches the .srt subtitle timing
    for (let i = 0; i < scenes.length; i++) {
      const start = performance.now();
      await new Promise((resolve) => {
        const anim = (now) => {
          const p = Math.min(1, (now - start) / perScene);
          drawScene(i, p);
          if (p < 1) requestAnimationFrame(anim);
          else resolve();
        };
        requestAnimationFrame(anim);
      });
    }
    rec.stop();
    await done;
    if (audioCtx) audioCtx.close();

    const blob = new Blob(chunks, { type: "video/webm" });
    downloadBlob(blob, "reelmint-video.webm");
    toast("Video exported 🎬 (.webm)");
  } catch (e) {
    toast("Export not supported in this browser.");
  } finally {
    busy(btn, false, "⬇ Export video");
  }
}

// ---------- AI editor ----------
function wireEditor() {
  $("#sendBtn").addEventListener("click", sendInstruction);
  $("#instruction").addEventListener("keydown", (e) => e.key === "Enter" && sendInstruction());

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#micBtn");
  if (!SR) {
    mic.title = "Voice not supported in this browser";
    mic.addEventListener("click", () => toast("Voice input needs Chrome/Edge."));
    return;
  }
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  let live = false;
  mic.addEventListener("click", () => {
    if (live) return rec.stop();
    rec.start();
  });
  rec.onstart = () => { live = true; mic.classList.add("live"); };
  rec.onend = () => { live = false; mic.classList.remove("live"); };
  rec.onresult = (e) => {
    $("#instruction").value = e.results[0][0].transcript;
    sendInstruction();
  };
}

async function sendInstruction() {
  const input = $("#instruction");
  const text = input.value.trim();
  if (!text) return;
  if (!storyboard) return toast("Generate a storyboard in Create first.");
  input.value = "";
  chatLog.push({ role: "user", text });
  renderChat();
  busy($("#sendBtn"), true, "…");
  try {
    const res = await api("/api/assistant", { instruction: text, storyboard });
    if (res.storyboard) {
      storyboard = res.storyboard;
      renderStoryboard();
      drawScene(0, 0.5);
    }
    chatLog.push({ role: "bot", text: res.reply || "Done." });
    renderChat();
  } catch {
    chatLog.push({ role: "bot", text: "Something went wrong — try again." });
    renderChat();
  } finally {
    busy($("#sendBtn"), false, "Send");
  }
}

function renderChat() {
  const el = $("#chat");
  el.innerHTML = chatLog
    .map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`)
    .join("");
  el.scrollTop = el.scrollHeight;
}

// ---------- Hook Lab ----------
function wireHooks() {
  $("#hookBtn").addEventListener("click", async () => {
    const topic = $("#hookTopic").value.trim();
    if (!topic) return toast("Type a topic first.");
    const out = $("#hooksOut");
    busy($("#hookBtn"), true, "Cooking…");
    skeleton(out, 4, "hook-card");
    try {
      const res = await api("/api/hooks", { topic, count: 6 });
      if (res.error === "out_of_credits") return outOfCredits(res);
      if (res.user) { USER = res.user; renderAccount(); }
      out.innerHTML = (res.variants || [])
        .map(
          (v) => `<div class="hook-card reveal">
            <span class="angle">${esc(v.angle || "")}</span>
            <p class="hook-line">${esc(v.hook || "")}</p>
            <p class="thumb muted">🖼 ${esc(v.thumbnail || "")}</p>
            <button class="btn btn-ghost sm" onclick="reelmintUseHook(this)">Use as video →</button>
          </div>`
        )
        .join("");
    } catch {
      out.innerHTML = "";
      toast("Hook Lab failed — try again.");
    } finally {
      busy($("#hookBtn"), false, "🧪 Generate variants");
    }
  });
}
// Send a chosen hook straight into the Create tab as a ready topic.
window.reelmintUseHook = (btn) => {
  const line = btn.parentElement.querySelector(".hook-line")?.textContent || "";
  $("#topic").value = line;
  selectTab("create");
  $("#topic").focus();
  toast("Loaded into Create — hit generate ✨");
};

// ---------- Series Planner ----------
function wireSeries() {
  $("#seriesBtn").addEventListener("click", async () => {
    const topic = $("#seriesTopic").value.trim();
    if (!topic) return toast("Type a niche first.");
    const out = $("#seriesOut");
    busy($("#seriesBtn"), true, "Planning…");
    skeleton(out, 5, "series-row");
    try {
      const res = await api("/api/series", { topic, days: Number($("#seriesDays").value) });
      if (res.error === "out_of_credits") return outOfCredits(res);
      if (res.user) { USER = res.user; renderAccount(); }
      out.innerHTML = (res.plan || [])
        .map(
          (d) => `<div class="series-row reveal">
            <div class="day">Day ${d.day}</div>
            <div class="series-body">
              <div class="series-theme">${esc(d.theme || "")}</div>
              <div>${esc(d.idea || "")}</div>
              <div class="muted sm">📐 ${esc(d.format || "")} · 🎯 ${esc(d.cta || "")}</div>
            </div>
          </div>`
        )
        .join("");
    } catch {
      out.innerHTML = "";
      toast("Series planner failed — try again.");
    } finally {
      busy($("#seriesBtn"), false, "🗓 Plan my series");
    }
  });
}

// ---------- Brand Kit ----------
function wireBrand() {
  $("#brandHandle").value = BRAND.handle;
  $("#brandColor").value = BRAND.color;
  $("#brandBg").value = BRAND.bg;
  $("#brandOn").checked = BRAND.on;
  const preview = () => drawScene(0, 0.5, $("#brandStage"));
  ["input", "change"].forEach((ev) => {
    $("#brandHandle").addEventListener(ev, () => { BRAND.handle = $("#brandHandle").value; preview(); });
    $("#brandColor").addEventListener(ev, () => { BRAND.color = $("#brandColor").value; preview(); });
    $("#brandBg").addEventListener(ev, () => { BRAND.bg = $("#brandBg").value; preview(); });
    $("#brandOn").addEventListener(ev, () => {
      if ($("#brandOn").checked && !requirePro("Brand Kit is a Creator feature — upgrade to apply it.")) {
        $("#brandOn").checked = false;
        return;
      }
      BRAND.on = $("#brandOn").checked;
      preview();
    });
  });
  $("#brandSave").addEventListener("click", () => {
    if (BRAND.on && !isPro()) return requirePro("Brand Kit is a Creator feature — upgrade to apply it.");
    saveBrand();
    drawScene(0, 0.5); // refresh the main stage too
    toast("Brand kit saved 🎨");
  });
  preview();
}

function outOfCredits(res) {
  USER = res.user || USER;
  renderAccount();
  toast("You're out of credits this month — upgrade to keep minting.");
  location.hash = "#pricing";
}

// Small skeleton loader for a nicer perceived-performance while AI responds.
function skeleton(el, n, cls) {
  el.innerHTML = Array.from({ length: n }, () => `<div class="${cls} skel"></div>`).join("");
}

// ---------- image ----------
let lastDesign = null;
function wireImage() {
  $("#imgBtn").addEventListener("click", async () => {
    const prompt = $("#imgPrompt").value.trim();
    if (!prompt) return toast("Describe the image first.");
    busy($("#imgBtn"), true, "Designing…");
    try {
      const res = await api("/api/image", { prompt, style: $("#imgStyle").value });
      if (res.type === "image" && (res.url || res.b64)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const c = $("#imgStage"), ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, c.width, c.height);
        };
        img.src = res.url || `data:image/png;base64,${res.b64}`;
      } else {
        lastDesign = res.design;
        drawDesign(res.design);
      }
      toast("Image ready 🖼");
    } catch {
      toast("Image generation failed.");
    } finally {
      busy($("#imgBtn"), false, "🖼 Generate image");
    }
  });
  $("#imgDownload").addEventListener("click", () => downloadCanvas($("#imgStage"), "reelmint-image.png"));
}

function drawDesign(d) {
  const c = $("#imgStage"), ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  const pal = d.palette || PALETTES[0];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal.bg);
  g.addColorStop(1, shade(pal.bg, 30));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.3, 10, W * 0.7, H * 0.3, W);
  glow.addColorStop(0, hexA(pal.accent, 0.4));
  glow.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const y = d.layout === "lower" ? H * 0.62 : d.layout === "split" ? H * 0.3 : H * 0.4;
  ctx.fillStyle = pal.accent;
  ctx.fillRect(W * 0.1, y - H * 0.08, W * 0.14, 8);
  ctx.fillStyle = pal.text;
  ctx.textAlign = "left";
  const size = Math.round(W * 0.085);
  ctx.font = `800 ${size}px sans-serif`;
  wrapText(ctx, d.headline || "", W * 0.1, y, W * 0.8, size * 1.1);
  ctx.fillStyle = hexA(pal.text, 0.75);
  ctx.font = `500 ${Math.round(W * 0.04)}px sans-serif`;
  wrapText(ctx, d.subline || "", W * 0.1, y + size * 2.2, W * 0.8, W * 0.05);
  if (CONFIG.watermark) {
    ctx.fillStyle = hexA(pal.text, 0.5);
    ctx.font = `700 ${Math.round(W * 0.035)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("◉ Reelmint", W * 0.9, H * 0.93);
  }
}

// ---------- scan ----------
function wireScan() {
  $("#scanBtn").addEventListener("click", async () => {
    const file = $("#scanFile").files[0];
    if (!file) return toast("Choose an image to scan.");
    busy($("#scanBtn"), true, "Reading…");
    try {
      const base64 = await fileToBase64(file);
      const res = await api("/api/scan", {
        base64,
        mediaType: file.type || "image/png",
        instruction: $("#scanInstruction").value.trim() || undefined,
      });
      $("#scanOut").textContent = res.text || res.error || "No result.";
    } catch {
      $("#scanOut").textContent = "Scan failed.";
    } finally {
      busy($("#scanBtn"), false, "📷 Scan & repurpose");
    }
  });
}

// ---------- repurpose ----------
function wireRepurpose() {
  $("#repBtn").addEventListener("click", async () => {
    const transcript = $("#transcript").value.trim();
    if (!transcript) return toast("Paste a transcript first.");
    busy($("#repBtn"), true, "Finding clips…");
    try {
      const res = await api("/api/repurpose", { transcript, count: 4 });
      $("#clips").innerHTML = (res.clips || [])
        .map(
          (c) => `<div class="clip">
            <h4>${esc(c.title || "")}</h4>
            <div class="muted">Hook: ${esc(c.hook || "")}</div>
            <blockquote>${esc(c.quote || "")}</blockquote>
            <div class="tagline">${(c.hashtags || []).map((h) => `<span class="tag">${esc(h)}</span>`).join("")}</div>
          </div>`
        )
        .join("");
    } catch {
      toast("Repurpose failed.");
    } finally {
      busy($("#repBtn"), false, "✂️ Find viral clips");
    }
  });
}

// ---------- features + pricing ----------
function renderFeatures() {
  const feats = [
    ["🎬", "Prompt → video", "One idea becomes a fully storyboarded, voiced video — short or long-form."],
    ["🪄", "Voice & text editor", "Just say or type what to change. The AI rewrites your storyboard live."],
    ["🖼", "Instant images", "Mint posters, quote cards and thumbnails in your brand's look."],
    ["📷", "Scan anything", "Turn a screenshot, photo or doc into ready-to-post content."],
    ["✂️", "Repurpose long-form", "Drop a transcript, get the most clip-worthy viral moments."],
    ["⬇", "Export in-browser", "Render and download real video & image files — no installs."],
  ];
  $("#featureGrid").innerHTML = feats
    .map(
      ([ico, h, p]) => `<div class="feature"><div class="ico">${ico}</div><h3>${h}</h3><p>${p}</p></div>`
    )
    .join("");
}

function renderPlans() {
  const plans = CONFIG.plans?.length ? CONFIG.plans : [];
  $("#plans").innerHTML = plans
    .map(
      (p) => `<div class="plan ${p.popular ? "popular" : ""}">
        ${p.popular ? '<span class="badge">Most popular</span>' : ""}
        <h3>${esc(p.name)}</h3>
        <div class="price">${esc(p.price)} <small>${esc(p.period)}</small></div>
        <div class="credits">${esc(p.credits)}</div>
        <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <button class="btn ${p.popular ? "btn-primary" : "btn-ghost"}" onclick="reelmintCheckout('${p.id}')">${esc(p.cta)}</button>
      </div>`
    )
    .join("");
}
window.reelmintCheckout = async (id) => {
  if (id === "free") return USER ? toast("You're set — start minting 🎉") : openAuth("signup");
  if (!USER) return openAuth("signup");
  if (!CONFIG.stripe)
    return toast("Billing isn't configured on this server yet (set STRIPE keys).");
  try {
    const res = await api("/api/billing/checkout", { plan: id });
    if (res.url) window.location.href = res.url;
    else toast(res.error || "Couldn't start checkout.");
  } catch {
    toast("Checkout failed.");
  }
};

// ---------- accounts ----------
function renderAccount() {
  const btn = $("#accountBtn");
  const meter = $("#creditMeter");
  if (USER) {
    const c = USER.creditsLeft === "unlimited" ? "∞" : USER.creditsLeft;
    btn.textContent = `${USER.plan.toUpperCase()} · ${c} left`;
    btn.title = `${USER.email} — click to sign out`;
    if (meter) {
      meter.hidden = false;
      const low = USER.creditsLeft !== "unlimited" && Number(USER.creditsLeft) <= 1;
      meter.classList.toggle("low", low);
      $("#creditText").textContent = `${c} credit${c === 1 ? "" : "s"} left`;
    }
  } else {
    btn.textContent = "Sign in";
    btn.title = "Sign in or create an account";
    if (meter) meter.hidden = true;
  }
}

let authMode = "login";
function wireAuth() {
  $("#accountBtn").addEventListener("click", () => (USER ? logout() : openAuth("login")));
  $("#authClose").addEventListener("click", closeAuth);
  $("#authModal").addEventListener("click", (e) => e.target.id === "authModal" && closeAuth());
  $("#authSwitch").addEventListener("click", (e) => {
    e.preventDefault();
    openAuth(authMode === "login" ? "signup" : "login");
  });
  $("#authSubmit").addEventListener("click", doAuth);
  $("#authPass").addEventListener("keydown", (e) => e.key === "Enter" && doAuth());
}

function openAuth(mode) {
  authMode = mode;
  $("#authTitle").textContent = mode === "login" ? "Sign in to Reelmint" : "Create your account";
  $("#authSubmit").textContent = mode === "login" ? "Sign in" : "Create account";
  $("#authSwitchText").textContent = mode === "login" ? "New here?" : "Already have an account?";
  $("#authSwitch").textContent = mode === "login" ? "Create an account" : "Sign in";
  $("#authError").textContent = "";
  $("#authModal").hidden = false;
  $("#authEmail").focus();
}
function closeAuth() {
  $("#authModal").hidden = true;
}

async function doAuth() {
  const email = $("#authEmail").value.trim();
  const password = $("#authPass").value;
  if (!email || !password) return ($("#authError").textContent = "Enter email and password.");
  busy($("#authSubmit"), true, "…");
  try {
    const res = await api(`/api/auth/${authMode}`, { email, password });
    if (res.error) {
      $("#authError").textContent = res.error;
      return;
    }
    TOKEN = res.token;
    localStorage.setItem("reelmint_token", TOKEN);
    USER = res.user;
    renderAccount();
    closeAuth();
    toast(`Welcome${authMode === "signup" ? "" : " back"}, ${USER.email.split("@")[0]} 👋`);
  } catch {
    $("#authError").textContent = "Something went wrong.";
  } finally {
    busy($("#authSubmit"), false, authMode === "login" ? "Sign in" : "Create account");
  }
}

function logout() {
  TOKEN = "";
  USER = null;
  localStorage.removeItem("reelmint_token");
  renderAccount();
  toast("Signed out.");
}

async function refreshMe() {
  if (!TOKEN) return;
  try {
    const res = await fetch("/api/me", { headers: { authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
    USER = res.user;
    renderAccount();
  } catch {}
}

function handleReturnFromCheckout() {
  const q = new URLSearchParams(location.search);
  if (q.get("upgraded")) {
    refreshMe();
    toast(`Upgraded to ${q.get("upgraded").toUpperCase()} 🎉`);
    history.replaceState({}, "", location.pathname + "#pricing");
  } else if (q.get("canceled")) {
    toast("Checkout canceled.");
    history.replaceState({}, "", location.pathname);
  }
}

// ---------- hero animation ----------
function animateHero() {
  const screen = $("#heroScreen");
  if (!screen) return;
  const set = (i) => {
    const p = PALETTES[i % PALETTES.length];
    screen.style.background = `linear-gradient(160deg, ${p.bg}, ${p.accent})`;
  };
  set(0);
  if (REDUCED_MOTION) return; // honor the user's motion preference
  let i = 1;
  setInterval(() => set(i++), 1600);
}

// ---------- utils ----------
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(" ");
  let line = "", yy = y;
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, yy);
      line = w + " ";
      yy += lh;
    } else line = test;
  }
  ctx.fillText(line.trim(), x, yy);
}
function shade(hex, amt) {
  const { r, g, b } = hexRGB(hex);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function hexA(hex, a) {
  const { r, g, b } = hexRGB(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hexRGB(hex) {
  let h = (hex || "#000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 };
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function downloadCanvas(canvas, name) {
  canvas.toBlob((b) => downloadBlob(b, name));
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function busy(btn, on, label) {
  btn.disabled = on;
  if (label) btn.textContent = label;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// Reelmint content engine — pure, dependency-free helpers shared by the API.
//
// Two jobs:
//   1) A hand-authored library of *believable* sample content so DEMO mode (and
//      any AI fallback) looks like a real product, never "lorem ipsum" or
//      "add your API key" filler.
//   2) Deterministic post-processing the routes reuse: storyboard decoration,
//      palette assignment, and SRT subtitle building.
//
// Everything here is synchronous and side-effect free so it can be unit-tested
// without a server or an API key.

export const PALETTES = [
  { bg: "#0E1116", accent: "#5B8CFF", text: "#F4F6FB", muted: "#9AA4B2" },
  { bg: "#13070A", accent: "#FF5C7A", text: "#FFF1F3", muted: "#D9A6B0" },
  { bg: "#06120E", accent: "#36E0A0", text: "#EAFBF4", muted: "#9CC8B8" },
  { bg: "#120E06", accent: "#FFB23E", text: "#FFF6E8", muted: "#D8BD98" },
  { bg: "#0B0716", accent: "#A66BFF", text: "#F3EDFF", muted: "#B5A6D4" },
];

// A tiny deterministic hash so the same topic always yields the same sample —
// the demo feels intentional and reproducible instead of random.
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const slug = (s) => String(s || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();

// ---------------------------------------------------------------------------
// Curated sample storyboards. These are written the way a good creator would —
// real hooks, real voiceover cadence, real captions — so the demo is
// convincing. `match` keywords route a topic to the closest sample; anything
// unmatched falls through to an adaptive template that still reads like copy,
// not filler.
// ---------------------------------------------------------------------------
const SAMPLES = [
  {
    match: ["focus", "habit", "morning", "productiv", "discipline", "routine"],
    build: (topic) => ({
      title: "3 Habits That Doubled My Focus",
      hook: "I wasted 2 years being busy instead of focused. These three habits fixed it.",
      scenes: [
        { caption: "Stop scrolling. This one's for you.", voiceover: "If your day feels busy but nothing important gets done, watch the next fifteen seconds.", imagePrompt: "cinematic close-up of a phone face-down on a wooden desk, warm morning light" },
        { caption: "Habit 1 — Win the first hour", voiceover: "Give the first hour of your day to one hard thing. No email, no feed — just the work that actually moves the needle.", imagePrompt: "sunrise through a window, steam rising from coffee, notebook open" },
        { caption: "Habit 2 — One tab, one task", voiceover: "Close every tab but the one you're working in. Focus isn't willpower, it's removing the exits.", imagePrompt: "clean minimalist desktop with a single app open, soft blue glow" },
        { caption: "Habit 3 — Shut it down on time", voiceover: "End work at a fixed time. A hard stop makes the hours before it sharper.", imagePrompt: "laptop closing at dusk, city lights blurred in the background" },
        { caption: "Try it for 5 days. Report back. 👇", voiceover: "Do these for five days and tell me your focus didn't double. Follow for the next one.", imagePrompt: "confident creator smiling at camera, bold gradient background" },
      ],
      hashtags: ["#productivity", "#focus", "#habits", "#deepwork", "#morningroutine"],
      description: "The three habits that took me from busy to actually focused. Save this and try it for a week.",
    }),
  },
  {
    match: ["money", "save", "invest", "budget", "finance", "wealth", "rich"],
    build: () => ({
      title: "The $5 Rule That Saved Me $4,000",
      hook: "Nobody's broke because of one big purchase. It's the small ones nobody tracks.",
      scenes: [
        { caption: "You're not bad with money.", voiceover: "You're not bad with money — you just never see the small leaks. Here's the rule that plugs them.", imagePrompt: "hands counting coins over a kitchen table, warm light" },
        { caption: "The $5 Rule", voiceover: "Every time you're about to spend under five dollars on autopilot, wait ten seconds and ask if you'll remember it tomorrow.", imagePrompt: "phone showing a payment screen, finger hovering over confirm" },
        { caption: "Small leaks sink big ships", voiceover: "Those tiny taps added up to four thousand dollars a year for me. Same for most people I've coached.", imagePrompt: "receipts scattered on a desk forming a rising line graph" },
        { caption: "Automate the win", voiceover: "Move what you don't spend into savings the same day. Make the good choice the default.", imagePrompt: "clean banking app UI with a savings balance ticking up" },
        { caption: "Save this before payday 💸", voiceover: "Save this, try it for one pay cycle, and watch what happens. Follow for the next money rule.", imagePrompt: "confident person smiling, green gradient background, upward arrow" },
      ],
      hashtags: ["#moneytips", "#personalfinance", "#savingmoney", "#budgeting", "#moneyhacks"],
      description: "The tiny rule that quietly saved me $4,000 a year. Try it for one pay cycle.",
    }),
  },
  {
    match: ["cook", "recipe", "food", "meal", "kitchen", "eat", "dinner"],
    build: () => ({
      title: "The 10-Minute Dinner That Broke the Internet",
      hook: "Three ingredients, one pan, ten minutes. And it tastes like you tried.",
      scenes: [
        { caption: "Dinner in 10. No skills needed.", voiceover: "If you can boil water, you can make this. Three ingredients, one pan, ten minutes.", imagePrompt: "overhead shot of a sizzling pan on a stove, steam rising" },
        { caption: "Step 1 — Get the pan screaming hot", voiceover: "Hot pan, little oil. This is the whole secret to food that tastes restaurant-good.", imagePrompt: "olive oil shimmering in a hot skillet, close-up" },
        { caption: "Step 2 — Garlic, then greens", voiceover: "Garlic first for thirty seconds, then your greens. Don't walk away — this part's fast.", imagePrompt: "garlic sizzling, fresh spinach being added to a pan" },
        { caption: "Step 3 — Finish with lemon", voiceover: "A squeeze of lemon at the end wakes the whole thing up. Trust me on this.", imagePrompt: "lemon squeezed over a finished plate, bright natural light" },
        { caption: "Save this for a lazy night 🍋", voiceover: "Save this for the night you can't be bothered. Follow for more ten-minute dinners.", imagePrompt: "beautifully plated dish on a rustic table, cozy lighting" },
      ],
      hashtags: ["#easyrecipes", "#dinnerideas", "#cookinghacks", "#10minutemeals", "#foodtok"],
      description: "The three-ingredient dinner everyone's making. Save it for a lazy night.",
    }),
  },
  {
    match: ["fitness", "gym", "workout", "muscle", "weight", "train", "run"],
    build: () => ({
      title: "The 20-Minute Workout That Beats an Hour",
      hook: "You don't need more time in the gym. You need to stop wasting the time you have.",
      scenes: [
        { caption: "An hour at the gym is a scam.", voiceover: "Most people waste half their session. Here's the twenty-minute plan that beats it.", imagePrompt: "athlete tying shoes in an empty gym, dramatic side light" },
        { caption: "Rule 1 — Pick 3 big lifts", voiceover: "Squat, push, pull. Three movements that hit everything — skip the machines nobody needs.", imagePrompt: "barbell loaded on a rack, chalk dust in the air" },
        { caption: "Rule 2 — Superset to save time", voiceover: "Pair a push with a pull and rest less. Same volume, half the clock.", imagePrompt: "person doing pull-ups, motion blur, high energy" },
        { caption: "Rule 3 — Leave one rep in the tank", voiceover: "Stop one rep before failure every set. You'll recover faster and show up tomorrow.", imagePrompt: "close-up of hands gripping a dumbbell, determined focus" },
        { caption: "Screenshot this workout 💪", voiceover: "Screenshot this, run it three times a week, and thank me in a month. Follow for more.", imagePrompt: "confident athlete flexing, bold orange gradient background" },
      ],
      hashtags: ["#fitness", "#workout", "#gymtok", "#fitnesstips", "#strengthtraining"],
      description: "The 20-minute plan that beats an hour of junk volume. Run it 3x a week.",
    }),
  },
  {
    match: ["business", "startup", "market", "brand", "sell", "founder", "entrepreneur", "growth"],
    build: (topic) => ({
      title: "How I Got My First 1,000 Customers",
      hook: "I didn't run a single ad. I did the one thing every founder avoids.",
      scenes: [
        { caption: "Zero ad budget. 1,000 customers.", voiceover: "No ads, no agency, no funding. Just one uncomfortable habit that actually works.", imagePrompt: "founder working late in a small office, laptop glow" },
        { caption: "Talk to 10 people a day", voiceover: "Every day I messaged ten real humans who had the problem I solved. Not a funnel — a conversation.", imagePrompt: "phone screen with a friendly outreach message, warm tone" },
        { caption: "Sell the outcome, not the app", voiceover: "Nobody buys features. They buy the version of themselves on the other side of the problem.", imagePrompt: "before-and-after split image, clean product shot" },
        { caption: "Turn buyers into promoters", voiceover: "Make your first customers look like heroes and they'll bring the next hundred for free.", imagePrompt: "network of glowing nodes spreading outward, dark background" },
        { caption: "Steal this playbook 👇", voiceover: "Save this playbook and start today. Follow for the exact scripts I used.", imagePrompt: "confident founder presenting, purple gradient, upward chart" },
      ],
      hashtags: ["#startup", "#founder", "#marketing", "#growth", "#smallbusiness"],
      description: `How I got my first 1,000 customers for ${topic || "my product"} with zero ad spend.`,
    }),
  },
  {
    match: ["travel", "trip", "flight", "vacation", "city", "country", "hotel"],
    build: (topic) => ({
      title: "The Travel Hack Airlines Hate",
      hook: "I've flown 40 countries on a budget. This is the trick I never skip.",
      scenes: [
        { caption: "40 countries. Barely any money.", voiceover: "People think travel is expensive. The real cost is not knowing this one booking trick.", imagePrompt: "traveler with a backpack watching a plane take off at golden hour" },
        { caption: "Book the mistake fare window", voiceover: "Fares glitch cheap on Tuesday nights. Set alerts and pounce before the airline fixes them.", imagePrompt: "phone showing a flight deal alert, map in the background" },
        { caption: "Fly in, bus out", voiceover: "Land in the cheap hub, then take ground transport to where you actually want to be.", imagePrompt: "scenic train winding through mountains, window view" },
        { caption: "Pack for a carry-on only", voiceover: "One bag means no fees, no waiting, and you move like a local from minute one.", imagePrompt: "neatly packed carry-on backpack laid out flat, top-down" },
        { caption: "Save this before you book ✈️", voiceover: "Save this for your next trip and follow for the alerts I actually use.", imagePrompt: `stunning ${topic || "coastal"} skyline at sunset, cinematic` },
      ],
      hashtags: ["#travelhacks", "#budgettravel", "#traveltok", "#cheapflights", "#wanderlust"],
      description: `The booking trick that got me through 40 countries. Save it before your next trip.`,
    }),
  },
];

// Adaptive fallback — still reads like real short-form copy, never lorem.
function adaptiveStoryboard(topic, sceneCount) {
  const t = (topic || "your big idea").trim();
  const T = cap(t);
  const beats = [
    { caption: `The truth about ${t}`, voiceover: `Everyone gets ${t} wrong in the same way. Here's what actually works.`, imagePrompt: `bold cinematic title card about ${t}, dramatic lighting` },
    { caption: `Most people quit here`, voiceover: `The hard part of ${t} isn't starting — it's the boring middle. This is how you push through.`, imagePrompt: `moody scene representing struggle and persistence, ${t}` },
    { caption: `The shortcut nobody mentions`, voiceover: `There's one move that makes ${t} click faster than anything else. Almost nobody talks about it.`, imagePrompt: `lightbulb moment, glowing accent, ${t} theme` },
    { caption: `Do this today`, voiceover: `You don't need a plan for next year. You need one small step on ${t} in the next ten minutes.`, imagePrompt: `clean motivational shot, forward motion, ${t}` },
    { caption: `Follow for part 2 👇`, voiceover: `Save this, try it, and follow — part two on ${t} drops next.`, imagePrompt: `confident creator to camera, vibrant gradient background` },
    { caption: `Why ${t} changes everything`, voiceover: `Once ${t} clicks, you can't unsee it. Here's the shift.`, imagePrompt: `transformation before/after, ${t}` },
    { caption: `The mistake costing you`, voiceover: `This one habit is quietly wrecking your ${t}. Fix it first.`, imagePrompt: `warning-toned cinematic frame, ${t}` },
    { caption: `Steal my exact steps`, voiceover: `Here's the exact order I'd do ${t} if I started over today.`, imagePrompt: `numbered checklist overlay, ${t}` },
  ];
  const scenes = Array.from({ length: sceneCount }, (_, i) => beats[i % beats.length]);
  return {
    title: `${T} — the 3-step version`,
    hook: `What nobody tells you about ${t}.`,
    scenes,
    hashtags: ["#" + slug(t), "#howto", "#tips", "#creator", "#reelmint"],
    description: `A punchy short about ${t}. Save it and try step one today.`,
  };
}

// Pick the most fitting sample for a topic, sized to sceneCount.
export function demoStoryboard(topic, sceneCount = 5) {
  const n = Math.max(3, Math.min(8, sceneCount || 5));
  const lc = String(topic || "").toLowerCase();
  const hit = SAMPLES.find((s) => s.match.some((m) => lc.includes(m)));
  const sb = hit ? hit.build(topic) : adaptiveStoryboard(topic, n);
  // Resize scenes to the requested count without breaking the narrative arc:
  // keep the hook (0) and CTA (last), fill/trim the middle.
  if (sb.scenes.length !== n) {
    const first = sb.scenes[0];
    const last = sb.scenes[sb.scenes.length - 1];
    const mid = sb.scenes.slice(1, -1);
    const wantMid = Math.max(1, n - 2);
    const middle = Array.from({ length: wantMid }, (_, i) => mid[i % mid.length]);
    sb.scenes = [first, ...middle, last];
  }
  return sb;
}

// ---- other tools' demo output (believable, topic-aware) ----
export function demoHooks(topic, count = 6) {
  const t = (topic || "your idea").trim();
  const T = cap(t);
  const hooks = [
    { angle: "Contrarian", hook: `Everything you've been told about ${t} is backwards.`, thumbnail: `Bold red X over a common ${t} myth` },
    { angle: "Curiosity gap", hook: `I tried ${t} for 30 days. Day 7 changed everything.`, thumbnail: `Calendar with day 7 circled, shocked face` },
    { angle: "Mistake", hook: `The ${t} mistake that's costing you every single day.`, thumbnail: `Big warning sign, money flying away` },
    { angle: "Result", hook: `How ${t} took me from zero to results in one week.`, thumbnail: `Before/after split, upward arrow` },
    { angle: "Authority", hook: `A pro breaks down ${t} in 30 seconds.`, thumbnail: `Expert pointing at a clean diagram` },
    { angle: "Story", hook: `Nobody believed my ${t} plan. Then this happened.`, thumbnail: `Dramatic close-up, bold caption` },
    { angle: "List", hook: `3 ${t} rules I wish I knew at 20.`, thumbnail: `Number 3 huge, minimalist background` },
    { angle: "Question", hook: `Why is nobody talking about this ${t} trick?`, thumbnail: `Confused emoji, spotlight on subject` },
  ];
  return { topic: T, variants: hooks.slice(0, Math.max(3, Math.min(hooks.length, count))) };
}

export function demoSeries(topic, days = 7) {
  const t = (topic || "your niche").trim();
  const T = cap(t);
  const templates = [
    { theme: "Myth-buster", idea: `Debunk the biggest myth about ${t}`, format: "Talking head + text overlay", cta: "Follow for the truth" },
    { theme: "Quick win", idea: `One ${t} tip they can use in 60 seconds`, format: "Screen-record or demo", cta: "Save this" },
    { theme: "Story", idea: `Your personal turning point with ${t}`, format: "Voiceover + b-roll", cta: "Part 2 tomorrow" },
    { theme: "List", idea: `3 tools/resources for ${t}`, format: "Fast cuts, on-screen list", cta: "Comment your favorite" },
    { theme: "Mistake", idea: `The ${t} mistake beginners always make`, format: "Reaction + fix", cta: "Send to a friend" },
    { theme: "Behind the scenes", idea: `Show your real ${t} process, unpolished`, format: "Day-in-the-life", cta: "Follow the journey" },
    { theme: "Challenge", idea: `Kick off a 7-day ${t} challenge`, format: "Piece to camera", cta: "Join in the comments" },
    { theme: "Q&A", idea: `Answer the top question about ${t}`, format: "Green-screen a comment", cta: "Ask yours below" },
    { theme: "Transformation", idea: `A before/after with ${t}`, format: "Split screen reveal", cta: "Save for motivation" },
    { theme: "Hot take", idea: `Your spiciest opinion on ${t}`, format: "Direct to camera", cta: "Agree or disagree?" },
  ];
  const n = Math.max(3, Math.min(14, days || 7));
  const plan = Array.from({ length: n }, (_, i) => ({ day: i + 1, ...templates[i % templates.length] }));
  return { topic: T, days: n, plan };
}

export function demoClips(transcript, count = 4) {
  const t = String(transcript || "").trim();
  const snippet = t ? t.slice(0, 90).replace(/\s+\S*$/, "") : "the key moment from your talk";
  const base = [
    { title: "The one-liner that stops the scroll", hook: "Lead with your sharpest sentence.", quote: snippet || "This changed how I think about the whole thing.", hashtags: ["#clip", "#viral", "#shorts"] },
    { title: "The surprising stat", hook: "Open on the number, explain after.", quote: "Most people get this wrong nine times out of ten.", hashtags: ["#facts", "#didyouknow", "#learnontiktok"] },
    { title: "The mini-story", hook: "A 15-second story beats a lecture.", quote: "I'll never forget the moment it finally clicked.", hashtags: ["#story", "#storytime", "#reels"] },
    { title: "The actionable takeaway", hook: "End with one thing they can do today.", quote: "Do this one thing before you go to bed tonight.", hashtags: ["#tips", "#howto", "#growth"] },
    { title: "The bold claim", hook: "Say the thing everyone's thinking.", quote: "Nobody wants to admit this, but it's true.", hashtags: ["#hottake", "#opinion", "#fyp"] },
  ];
  return { clips: base.slice(0, Math.max(1, Math.min(base.length, count))) };
}

export function demoCaptions(topic, platform = "instagram", count = 6) {
  const t = (topic || "your idea").trim();
  const lines = [
    `Save this if ${t} has been on your mind lately. 👀`,
    `Nobody talks about this side of ${t} — but they should. Drop a 🙌 if you agree.`,
    `The ${t} tip I wish someone gave me sooner. Tag a friend who needs it.`,
    `POV: you finally figured out ${t}. Here's the shortcut. ⬇️`,
    `Stop overthinking ${t}. Start with this one step today.`,
    `${cap(t)} in one sentence: keep it simple, stay consistent, ship it. 🚀`,
    `Hot take on ${t}: the basics beat the hacks every time.`,
    `This is your sign to finally start with ${t}. Comment "GO" and I'll cheer you on.`,
  ];
  const n = Math.max(1, Math.min(lines.length, count));
  const picked = lines.slice(0, n).map((l, i) => `${i + 1}. ${l} #${slug(t)} #${platform}`);
  return picked.join("\n\n");
}

export function demoDesign(prompt) {
  const p = String(prompt || "").trim();
  return {
    headline: cap(p.split(/[.,\n]/)[0] || "Make it unmissable").slice(0, 46),
    subline: "Minted with Reelmint",
    palette: PALETTES[seedFrom(p) % PALETTES.length],
    layout: ["center", "lower", "split"][seedFrom(p) % 3],
  };
}

// ---------------------------------------------------------------------------
// Deterministic post-processing reused by the routes.
// ---------------------------------------------------------------------------
export function decorateStoryboard(sb, palettes = PALETTES) {
  if (!sb || !Array.isArray(sb.scenes) || sb.scenes.length === 0) {
    return decorateStoryboard(demoStoryboard("your idea", 5), palettes);
  }
  sb.scenes = sb.scenes.map((s, i) => ({
    caption: String(s.caption || "").trim(),
    voiceover: String(s.voiceover || s.caption || "").trim(),
    imagePrompt: String(s.imagePrompt || s.caption || sb.title || "").trim(),
    palette: palettes[i % palettes.length],
  }));
  sb.title = String(sb.title || "Untitled");
  sb.hook = String(sb.hook || "");
  sb.hashtags = Array.isArray(sb.hashtags) ? sb.hashtags.slice(0, 8) : [];
  sb.description = String(sb.description || "");
  return sb;
}

// Build a valid SRT subtitle file from a storyboard's voiceover lines.
// `perSceneSec` is how long each scene is on screen (matches the exporter).
export function buildSRT(scenes, perSceneSec = 2.6) {
  const list = Array.isArray(scenes) ? scenes : [];
  const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");
  const stamp = (sec) => {
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  };
  return list
    .map((sc, i) => {
      const start = i * perSceneSec;
      const end = (i + 1) * perSceneSec;
      const text = String(sc.voiceover || sc.caption || "").trim();
      return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${text}`;
    })
    .join("\n\n") + "\n";
}

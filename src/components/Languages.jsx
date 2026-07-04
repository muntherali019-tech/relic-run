import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Volume2, Loader2, Sparkles, Check, X, GraduationCap, RefreshCw, Headphones, Mic } from "lucide-react";
import Mochi from "./Mochi.jsx";
import { LANGUAGES, LANG_TOPICS, FALLBACK } from "../data/languages.js";
import { languageLesson } from "../lib/api.js";
import * as speech from "../lib/speech.js";
import * as recog from "../lib/recognition.js";
import { useT, tf } from "../lib/i18n.js";

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

// Build "what does this mean?" questions (English options) from the lesson phrases.
function buildMeaningQuiz(phrases) {
  return phrases.slice(0, Math.min(5, phrases.length)).map((p) => {
    const others = phrases.filter((x) => x.english !== p.english).map((x) => x.english);
    const options = shuffle([p.english, ...shuffle(others).slice(0, 3)]);
    return { target: p.target, roman: p.roman, options, answerIndex: options.indexOf(p.english) };
  });
}

export default function Languages({ onClose }) {
  const t = useT();
  const [view, setView] = useState("pick");   // pick | lesson | practice | quiz | listen | speak
  const [lang, setLang] = useState(null);
  const [topic, setTopic] = useState(LANG_TOPICS[0]);
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => speech.onSpeakingChange(setSpeaking), []);
  useEffect(() => () => speech.stop(), []);

  function chooseLang(l) { setLang(l); setView("lesson"); setLesson(null); loadLesson(l, topic); }

  async function loadLesson(l = lang, tp = topic) {
    setLoading(true); setOffline(false); setLesson(null);
    try {
      const data = await languageLesson({ language: l.name, topic: tp, level: "beginner" });
      const phrases = Array.isArray(data?.phrases) ? data.phrases : [];
      if (!phrases.length) throw new Error("thin");
      const quiz = Array.isArray(data?.quiz) && data.quiz.length ? data.quiz : buildMeaningQuiz(phrases);
      setLesson({ intro: data.intro || `Let's learn some ${l.name}!`, phrases, quiz });
      speech.speak(data.intro || `Let's learn some ${l.name}! Tap any phrase to hear me say it.`);
    } catch {
      const phrases = FALLBACK[l.id] || FALLBACK.es;
      setOffline(true);
      setLesson({ intro: `Let's learn some ${l.name}!`, phrases, quiz: buildMeaningQuiz(phrases) });
      speech.speak(`Let's learn some ${l.name}! Tap any phrase to hear me say it.`);
    } finally { setLoading(false); }
  }

  const hear = (text) => speech.speak(text, { lang: lang?.code || "en-US", respectSetting: false });

  /* ---------- PICK A LANGUAGE ---------- */
  if (view === "pick") {
    return (
      <main>
        <button className="iconbtn" onClick={onClose} aria-label="Back to home" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
        <div className="greet" style={{ marginTop: 4 }}>
          <Mochi size={110} expression="happy" speaking={speaking} />
          <h2 className="fred" style={{ marginTop: 6 }}>{t("Languages 🌍")}</h2>
          <p>{t("Learn to speak with your AI teacher, Mochi")}</p>
        </div>
        <div className="langgrid">
          {LANGUAGES.map((l) => (
            <button key={l.id} className="langtile" onClick={() => chooseLang(l)} aria-label={`Learn ${l.name}`}>
              <span className="flag" aria-hidden="true">{l.emoji}</span>
              <span className="tgt" dir={l.rtl ? "rtl" : "ltr"} lang={l.id}>{l.endonym}</span>
              <span className="muted">{l.name}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  /* ---------- LESSON ---------- */
  if (view === "lesson") {
    return (
      <main>
        <button className="iconbtn" onClick={() => { speech.stop(); setView("pick"); }} aria-label="Back to languages" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
        <div className="greet" style={{ marginTop: 4 }}>
          <Mochi size={92} expression="read" speaking={speaking} />
          <h2 className="fred" style={{ marginTop: 6 }}>{lang.emoji} {lang.name}</h2>
          <p><GraduationCap size={15} style={{ verticalAlign: "-2px" }} /> {t("Lesson with your AI teacher")}</p>
        </div>

        <div className="chiprow" role="group" aria-label="Choose a topic">
          {LANG_TOPICS.map((tp) => (
            <button key={tp} className={`chip ${tp === topic ? "on" : ""}`} aria-pressed={tp === topic}
              onClick={() => { setTopic(tp); loadLesson(lang, tp); }}>{tp}</button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", marginTop: 26 }}><Loader2 className="wiggle" size={26} color="#6b4fb0" /><p className="muted">Mochi is preparing your lesson…</p></div>}

        {lesson && !loading && (
          <>
            {offline && <p className="muted" style={{ textAlign: "center" }}>Offline starter lesson — connect for more from your AI teacher.</p>}
            <div className="card">
              {lesson.phrases.map((p, i) => (
                <div className="phrase" key={i}>
                  <button className="spk" onClick={() => hear(p.target)} aria-label={`Hear "${p.english}" in ${lang.name}`}><Volume2 size={20} /></button>
                  <div style={{ flex: 1 }}>
                    <div className="tgt" dir={lang.rtl ? "rtl" : "ltr"} lang={lang.id}>{p.target}</div>
                    {p.roman && <div className="muted">{p.roman}</div>}
                    <div style={{ fontWeight: 800 }}>{p.english}</div>
                    {p.tip && <div className="muted" style={{ fontStyle: "italic", marginTop: 2 }}>💡 {p.tip}</div>}
                  </div>
                </div>
              ))}
            </div>
            <button className="bigbtn purple" onClick={() => setView("practice")}><Sparkles size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Practise what you learned")}</button>
          </>
        )}
      </main>
    );
  }

  /* ---------- PRACTICE MENU ---------- */
  if (view === "practice" && lesson) {
    return (
      <main>
        <button className="iconbtn" onClick={() => setView("lesson")} aria-label="Back to lesson" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
        <div className="greet" style={{ marginTop: 4 }}><Mochi size={92} expression="happy" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>{t("How would you like to practise?")}</h2></div>
        <button className="card toolcard" onClick={() => setView("quiz")} aria-label="Quiz practice">
          <div className="toolicon" style={{ background: "var(--purple-soft)" }}><Sparkles size={26} color="#6b4fb0" /></div>
          <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Quiz")}</div><div className="muted">{t("Match phrases to their meaning")}</div></div>
        </button>
        <button className="card toolcard" onClick={() => setView("listen")} aria-label="Listening practice">
          <div className="toolicon" style={{ background: "var(--sky-soft)" }}><Headphones size={26} color="#2b80d6" /></div>
          <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Listening")}</div><div className="muted">{t("Hear it, then pick what it means")}</div></div>
        </button>
        <button className="card toolcard" onClick={() => setView("speak")} aria-label="Speaking practice">
          <div className="toolicon" style={{ background: "var(--mint-soft, #dcf7f1)" }}><Mic size={26} color="#129a83" /></div>
          <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Speaking")}</div><div className="muted">{t("Say it out loud and get feedback")}</div></div>
        </button>
      </main>
    );
  }

  if (view === "quiz" && lesson) return <Quiz lesson={lesson} lang={lang} speaking={speaking} onBack={() => setView("practice")} />;
  if (view === "listen" && lesson) return <Listening lesson={lesson} lang={lang} speaking={speaking} hear={hear} onBack={() => setView("practice")} />;
  if (view === "speak" && lesson) return <Speaking lesson={lesson} lang={lang} speaking={speaking} hear={hear} onBack={() => setView("practice")} />;

  return <main><button className="iconbtn" onClick={onClose} aria-label="Back"><ArrowLeft size={20} /></button></main>;
}

/* ===================== QUIZ ===================== */
function Quiz({ lesson, lang, speaking, onBack }) {
  const t = useT();
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [announce, setAnnounce] = useState("");
  const done = qi >= lesson.quiz.length;
  const q = !done ? lesson.quiz[qi] : null;

  function answer(i) {
    if (picked !== null) return;
    setPicked(i);
    const right = i === Number(q.answerIndex);
    if (right) setCorrect((c) => c + 1);
    setAnnounce(right ? t("Correct!") : tf("Not quite. The answer is {a}.", { a: q.options[Number(q.answerIndex)] }));
    speech.speak(right ? t("Correct! Well done!") : t("Not quite — let's keep going."));
  }
  function next() {
    if (qi + 1 < lesson.quiz.length) { setQi(qi + 1); setPicked(null); setAnnounce(""); }
    else { setQi(lesson.quiz.length); const m = `Great work! You got ${correct} out of ${lesson.quiz.length}.`; setAnnounce(m); speech.speak(m); }
  }

  return (
    <main>
      <button className="iconbtn" onClick={onBack} aria-label="Back to practice" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <p aria-live="assertive" className="visually-hidden">{announce}</p>
      {!done ? (
        <>
          <div className="greet" style={{ marginTop: 4 }}><Mochi size={84} expression={picked === null ? "think" : picked === Number(q.answerIndex) ? "happy" : "oops"} speaking={speaking} /><p className="pill" style={{ marginTop: 8 }}>Question {qi + 1} of {lesson.quiz.length}</p></div>
          <div className="card"><div style={{ fontWeight: 800, fontSize: 18 }}>{q.prompt || `What does “${q.target}” mean?`}</div></div>
          <div className="langopts">
            {q.options.map((opt, i) => {
              const state = picked === null ? "" : i === Number(q.answerIndex) ? " right" : i === picked ? " wrong" : "";
              return (
                <button key={i} className={`langopt${state}`} onClick={() => answer(i)} disabled={picked !== null} aria-label={`Option ${i + 1}: ${opt}`}>
                  <span style={{ flex: 1 }}>{opt}</span>
                  {picked !== null && i === Number(q.answerIndex) && <Check size={18} />}
                  {picked !== null && i === picked && i !== Number(q.answerIndex) && <X size={18} />}
                </button>
              );
            })}
          </div>
          {picked !== null && <button className="bigbtn mint" onClick={next}>{qi + 1 < lesson.quiz.length ? t("Next") : t("See results")}</button>}
        </>
      ) : (
        <div className="greet" style={{ marginTop: 20 }}>
          <Mochi size={120} expression="happy" speaking={speaking} />
          <h2 className="fred" style={{ marginTop: 8 }}>{tf("You scored {c}/{n}! 🎉", { c: correct, n: lesson.quiz.length })}</h2>
          <button className="bigbtn purple" onClick={() => { setQi(0); setPicked(null); setCorrect(0); setAnnounce(""); }}><RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Try again")}</button>
          <button className="bigbtn ghost" onClick={onBack}>{t("Back to practice")}</button>
        </div>
      )}
    </main>
  );
}

/* ===================== LISTENING ===================== */
function Listening({ lesson, lang, speaking, hear, onBack }) {
  const t = useT();
  const items = buildMeaningQuiz(lesson.phrases);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [announce, setAnnounce] = useState("");
  const done = qi >= items.length;
  const it = !done ? items[qi] : null;

  // Play the phrase automatically when a new question appears.
  useEffect(() => { if (it) hear(it.target); /* eslint-disable-next-line */ }, [qi]);

  function answer(i) {
    if (picked !== null) return;
    setPicked(i);
    const right = i === it.answerIndex;
    if (right) setCorrect((c) => c + 1);
    setAnnounce(right ? t("Correct!") : tf("Not quite. That was {a}.", { a: it.options[it.answerIndex] }));
    speech.speak(right ? t("Correct! Great listening!") : t("Good try!"));
  }
  function next() {
    if (qi + 1 < items.length) { setQi(qi + 1); setPicked(null); setAnnounce(""); }
    else { setQi(items.length); const m = `Wonderful listening! ${correct} out of ${items.length}.`; setAnnounce(m); speech.speak(m); }
  }

  return (
    <main>
      <button className="iconbtn" onClick={onBack} aria-label="Back to practice" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <p aria-live="assertive" className="visually-hidden">{announce}</p>
      {!done ? (
        <>
          <div className="greet" style={{ marginTop: 4 }}><Mochi size={84} expression="read" speaking={speaking} /><p className="pill" style={{ marginTop: 8 }}>Listen {qi + 1} of {items.length}</p></div>
          <div className="card" style={{ textAlign: "center" }}>
            <p className="muted" style={{ marginTop: 0 }}>What did Mochi say?</p>
            <button className="bigbtn sky" onClick={() => hear(it.target)} aria-label="Play the phrase again"><Volume2 size={20} style={{ verticalAlign: "-4px", marginRight: 8 }} />{t("Play again")}</button>
          </div>
          <div className="langopts">
            {it.options.map((opt, i) => {
              const state = picked === null ? "" : i === it.answerIndex ? " right" : i === picked ? " wrong" : "";
              return (
                <button key={i} className={`langopt${state}`} onClick={() => answer(i)} disabled={picked !== null} aria-label={`Option ${i + 1}: ${opt}`}>
                  <span style={{ flex: 1 }}>{opt}</span>
                  {picked !== null && i === it.answerIndex && <Check size={18} />}
                  {picked !== null && i === picked && i !== it.answerIndex && <X size={18} />}
                </button>
              );
            })}
          </div>
          {picked !== null && <button className="bigbtn mint" onClick={next}>{qi + 1 < items.length ? t("Next") : t("See results")}</button>}
        </>
      ) : (
        <div className="greet" style={{ marginTop: 20 }}>
          <Mochi size={120} expression="happy" speaking={speaking} />
          <h2 className="fred" style={{ marginTop: 8 }}>{tf("{c}/{n} — lovely listening! 🎧", { c: correct, n: items.length })}</h2>
          <button className="bigbtn purple" onClick={() => { setQi(0); setPicked(null); setCorrect(0); setAnnounce(""); }}><RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Again")}</button>
          <button className="bigbtn ghost" onClick={onBack}>{t("Back to practice")}</button>
        </div>
      )}
    </main>
  );
}

/* ===================== SPEAKING ===================== */
function Speaking({ lesson, lang, speaking, hear, onBack }) {
  const t = useT();
  const phrases = lesson.phrases;
  const [i, setI] = useState(0);
  const [state, setState] = useState("");   // "", listening, good, again
  const [heard, setHeard] = useState("");
  const stopRef = useRef(null);
  const canRecord = recog.supported();
  const p = phrases[i];
  const [micOk, setMicOk] = useState(() => { try { return localStorage.getItem("whisker.micOk") === "1"; } catch { return false; } });
  const [gate, setGate] = useState(null); // grown-up check before first mic use

  useEffect(() => () => { if (stopRef.current) stopRef.current(); }, []);

  function startListen() {
    setHeard(""); setState("listening");
    stopRef.current = recog.listen({
      lang: lang.code,
      onResult: (alts) => {
        const got = alts[0] || "";
        setHeard(got);
        const ok = alts.some((a) => recog.roughMatch(a, p.target));
        setState(ok ? "good" : "again");
        speech.speak(ok ? t("Great pronunciation!") : t("Good effort! Have another go."), { respectSetting: false });
      },
      onError: () => setState("again"),
      onEnd: () => setState((s) => (s === "listening" ? "" : s)),
    });
  }
  function requestSpeak() {
    if (micOk) { startListen(); return; }
    setGate({ a: 6 + Math.floor(Math.random() * 4), b: 6 + Math.floor(Math.random() * 4), val: "", err: false });
  }
  function passGate() {
    if (Number(gate.val) !== gate.a * gate.b) { setGate((g) => ({ ...g, val: "", err: true })); return; }
    try { localStorage.setItem("whisker.micOk", "1"); } catch {}
    setMicOk(true); setGate(null); startListen();
  }
  function advance() {
    if (i + 1 < phrases.length) { setI(i + 1); setState(""); setHeard(""); }
    else { setI(phrases.length); speech.speak(t("Brilliant speaking practice! You're doing wonderfully.")); }
  }

  if (i >= phrases.length) {
    return (
      <main>
        <button className="iconbtn" onClick={onBack} aria-label="Back to practice" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
        <div className="greet" style={{ marginTop: 20 }}>
          <Mochi size={120} expression="happy" speaking={speaking} />
          <h2 className="fred" style={{ marginTop: 8 }}>{t("Amazing speaking! 🌟")}</h2>
          <p>{tf("You practised {n} phrases in {lang}.", { n: phrases.length, lang: lang.name })}</p>
          <button className="bigbtn purple" onClick={() => { setI(0); setState(""); setHeard(""); }}><RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Again")}</button>
          <button className="bigbtn ghost" onClick={onBack}>{t("Back to practice")}</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <button className="iconbtn" onClick={onBack} aria-label="Back to practice" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Mochi size={84} expression={state === "good" ? "happy" : state === "again" ? "oops" : "idle"} speaking={speaking} /><p className="pill" style={{ marginTop: 8 }}>Say it {i + 1} of {phrases.length}</p></div>
      <div className="card" style={{ textAlign: "center" }}>
        <div className="tgt" dir={lang.rtl ? "rtl" : "ltr"} lang={lang.id} style={{ fontSize: 30 }}>{p.target}</div>
        {p.roman && <div className="muted">{p.roman}</div>}
        <div style={{ fontWeight: 800, marginTop: 4 }}>{p.english}</div>
        <button className="spk" onClick={() => hear(p.target)} aria-label="Hear it" style={{ margin: "12px auto 0" }}><Volume2 size={20} /></button>
      </div>

      {state === "listening" && <p className="muted" style={{ textAlign: "center" }} aria-live="polite">Listening… say it now! 🎤</p>}
      {state === "good" && <div className="feedback ok" role="status" aria-live="assertive"><Check size={20} /><div>Great pronunciation!{heard ? ` I heard: “${heard}”` : ""}</div></div>}
      {state === "again" && <div className="feedback no" role="status" aria-live="assertive"><X size={20} /><div>Good effort!{heard ? ` I heard: “${heard}”` : ""} Tap the speaker and try again.</div></div>}

      {gate && (
        <div className="card">
          <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>🎤 {t("For grown-ups")}</div>
          <p className="muted" style={{ marginTop: 6 }}>Speaking practice turns on the microphone to check pronunciation. A grown-up, please confirm to continue:</p>
          <p className="fred" style={{ fontSize: 26, margin: "4px 0 0" }}>{gate.a} × {gate.b} = ?</p>
          <input className="tin" inputMode="numeric" value={gate.val} autoFocus aria-label={`What is ${gate.a} times ${gate.b}?`}
            onChange={(e) => setGate((g) => ({ ...g, val: e.target.value.replace(/[^0-9]/g, ""), err: false }))}
            onKeyDown={(e) => e.key === "Enter" && passGate()} style={{ marginTop: 8 }} />
          {gate.err && <p className="err">Not quite — try again.</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="bigbtn ghost" style={{ marginTop: 0, flex: 1 }} onClick={() => setGate(null)}>{t("Cancel")}</button>
            <button className="bigbtn purple" style={{ marginTop: 0, flex: 1 }} onClick={passGate}>{t("Confirm")}</button>
          </div>
        </div>
      )}

      {canRecord
        ? <button className="bigbtn mint" disabled={state === "listening" || !!gate} onClick={requestSpeak}><Mic size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{state === "listening" ? t("Listening…") : t("Speak it")}</button>
        : <p className="note">Speaking detection isn't available on this device — tap the speaker to hear it, repeat after Mochi, then mark it below.</p>}
      <button className="bigbtn ghost" onClick={advance}>{i + 1 < phrases.length ? t("I can say it — next") : t("I can say it — finish")}</button>
      {canRecord && <p className="note">Speaking practice uses your device's microphone &amp; speech recognition to check pronunciation. Audio isn't stored by us.</p>}
    </main>
  );
}

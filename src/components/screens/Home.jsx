import { ArrowRight, Sparkles, Check, Lock, Languages as LangIcon, GraduationCap } from "lucide-react";
import Mochi from "../Mochi.jsx";
import { useT, tf } from "../../lib/i18n.js";
import { KS_LABEL, KS_META } from "../../data/curriculum.js";
import { earnedCount, BADGES } from "../../lib/achievements.js";
import { starsToday, dailyDone, DAILY_GOAL } from "../../lib/progress.js";
import * as trial from "../../lib/trial.js";

/* Home screen, extracted from App.jsx — markup unchanged. */
export default function Home({
  state, motiv, speaking, smartMsg, startDaily, openAsk, startSmart, chooseKs, priceFor,
  openBadges, openShop, openBoard, openLanguages, openCourses, openGate, openPrivacy, openTerms,
}) {
  const t = useT();
  return (
    <main>
      <div className="greet">
        <div className="bob" style={{ display: "inline-block" }}><Mochi size={140} expression="happy" speaking={speaking} /></div>
        <h2 className="fred">{t("Hello! I'm Mochi 🐾")}</h2>
        <p>{t("Who's learning today?")}</p>
      </div>
      <div className="motiv"><Sparkles size={18} className="spark" color="#F2A33A" />{motiv}</div>
      <div className="todayStrip">
        <button className="chip tap" onClick={openBadges} aria-label="Badges">🏅 {tf("{e} of {t} earned", { e: earnedCount(state), t: BADGES.length })}</button>
        <button className="chip tap" onClick={openShop} aria-label="Shop">🎩 {t("Shop")}</button>
        <button className="chip tap" onClick={openBoard} aria-label="Leaderboard">🏆 {t("Leaderboard")}</button>
        {state.streakDays > 0 && <span className="chip flame">🔥 {tf("{d} day streak", { d: state.streakDays })}</span>}
        <span className="goalring" style={{ "--p": Math.min(100, Math.round((starsToday(state) / DAILY_GOAL) * 100)) }} title={t("Daily goal")} aria-label={t("Daily goal")}>
          <i>{starsToday(state)}/{DAILY_GOAL}</i>
        </span>
      </div>
      <button className={`daily ${dailyDone(state) ? "done" : ""}`} onClick={() => !dailyDone(state) && startDaily()} disabled={dailyDone(state)}>
        <span className="dico">⚡</span>
        <span style={{ flex: 1, textAlign: "left" }}>
          <span className="fred" style={{ fontWeight: 700, fontSize: 17 }}>{t("Daily Challenge")}</span>
          <span className="muted" style={{ display: "block", fontSize: 13 }}>{dailyDone(state) ? t("Daily challenge done ✓") : "+5 ⭐"}</span>
        </span>
        {!dailyDone(state) && <ArrowRight size={20} />}
      </button>
      <div className="homeq">
        <button className="qbtn" onClick={openAsk}>💬 {t("Ask Mochi")}</button>
        <button className="qbtn" onClick={startSmart}>🎯 {t("Smart Practice")}</button>
      </div>
      {smartMsg && <p className="note" style={{ textAlign: "center", marginTop: 4 }}>{smartMsg}</p>}
      <div className="pickgrid">
        {KS_META.map((m) => {
          const subbed = state.subs[m.plan];
          const unlocked = subbed || trial.trialActive();
          return (
            <button key={m.id} className="pick" style={{ background: m.grad }} onClick={() => chooseKs(m.id)}>
              <div className="em">{m.emoji}</div>
              <div style={{ flex: 1 }}><div className="tt">{KS_LABEL[m.id]}</div><div className="ds">{m.age}</div></div>
              <span className="lockbadge">{subbed ? <><Check size={14} /> {t("Unlocked")}</> : unlocked ? <><Check size={14} /> {t("Free trial")}</> : <><Lock size={13} /> {priceFor(m.plan)}/mo</>}</span>
            </button>
          );
        })}
      </div>
      <button className="card toolcard" onClick={openLanguages} aria-label="Open Languages">
        <div className="toolicon" style={{ background: "var(--mint-soft, #dcf7f1)", fontSize: 24 }} aria-hidden="true">🌍</div>
        <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Languages")}</div>
          <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Speak with your AI teacher — 8 languages")}</div></div>
        <LangIcon size={22} color="#129a83" />
      </button>
      <button className="card toolcard" onClick={openCourses} aria-label="Open Advanced courses">
        <div className="toolicon" style={{ background: "var(--purple-soft)", fontSize: 24 }} aria-hidden="true">🎓</div>
        <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Advanced courses")}</div>
          <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Gas · Electrical · Renewables · Business — exam‑prep")}</div></div>
        <GraduationCap size={22} color="#6b4fb0" />
      </button>
      <p className="note">
        {t("Start a 72-hour free trial, then Junior £3/mo (KS1 & KS2) or Adult £5/mo (KS3, Higher Education & courses).")}<br />
        <button className="linkbtn" onClick={openGate}>{t("Grown-ups: progress & reports")}</button> · <button className="linkbtn" onClick={openPrivacy}>{t("Privacy")}</button> · <button className="linkbtn" onClick={openTerms}>{t("Terms")}</button>
      </p>
    </main>
  );
}

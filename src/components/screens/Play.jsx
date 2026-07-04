import { ArrowLeft, Loader2, Volume2, Check, X, Star } from "lucide-react";
import Mochi from "../Mochi.jsx";
import { useT, tf } from "../../lib/i18n.js";
import { SUBJ } from "../../data/curriculum.js";

/* Quiz round screen (loading, question, and round-summary states), extracted
 * from App.jsx — markup unchanged. The quiz *state machine* (startRound,
 * answer, nextQ) stays in App, which owns the progress/stars state. */
export default function Play({
  ks, subject, topic, questions, qi, picked, streak, bestStreak, correctCount,
  loadingQ, usedFallback, speaking, shareMsg,
  answer, nextQ, sayQuestion, startRound, shareScore, onBack,
}) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={onBack} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      {loadingQ && (
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <div className="bob" style={{ display: "inline-block" }}><Mochi size={130} expression="think" /></div>
          <p className="fred" style={{ fontSize: 20, marginTop: 10 }}>{t("Mochi is thinking up your puzzles…")}</p>
          <Loader2 className="wiggle" size={26} color="#FF8A47" />
        </div>
      )}
      {!loadingQ && qi < questions.length && (() => {
        const q = questions[qi]; const answered = picked !== null; const ok = answered && picked === q.answerIndex;
        return (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span className="qtag">{SUBJ[subject].name} · {topic} · Q{qi + 1}/{questions.length}</span>
            {streak >= 2 && <span className="streak">🔥 {streak} streak</span>}
          </div>
          <div className="progress"><i style={{ width: `${(qi / questions.length) * 100}%` }} /></div>
          <div className="qcard card" style={{ marginTop: 16 }}>
            <Mochi size={92} expression={answered ? (ok ? "happy" : "oops") : "idle"} speaking={speaking} />
            <div className="qtext fred">{q.question}</div>
            <button className="spk" onClick={() => sayQuestion(q)} aria-label="Hear the question and options" style={{ margin: "4px auto 0" }}><Volume2 size={20} /></button>
          </div>
          <div className="choices">
            {q.choices.map((c, i) => {
              let cls = "choice";
              if (answered && i === q.answerIndex) cls += " correct";
              else if (answered && i === picked) cls += " wrong";
              return <button key={i} className={cls} disabled={answered} onClick={() => answer(i)}>{c}</button>;
            })}
          </div>
          {answered && <div className={`feedback ${ok ? "ok" : "no"} pop`} role="status" aria-live="assertive">{ok ? <Check size={20} /> : <X size={20} />}<div>{t(ok ? "Purr-fect!" : "Good try!")} {q.explanation}</div></div>}
          {answered && <button className="bigbtn" onClick={nextQ}>{qi + 1 < questions.length ? t("Next puzzle →") : t("See my stars ⭐")}</button>}
          {usedFallback && <p className="note">{t("Playing offline puzzles — connect to the internet for fresh ones.")}</p>}
        </>);
      })()}
      {!loadingQ && questions.length > 0 && qi >= questions.length && (() => {
        const total = questions.length; const earned = Math.max(1, Math.round((correctCount / total) * 5));
        return (
          <div className="summary card" style={{ marginTop: 18 }}>
            <div className="bob" style={{ display: "inline-block" }}><Mochi size={130} expression="happy" speaking={speaking} /></div>
            <h2 className="fred" style={{ margin: "8px 0 0" }}>{t("Round complete!")}</h2>
            <div className="starsRow">{[0, 1, 2, 3, 4].map((n) => <Star key={n} size={34} fill={n < earned ? "#FFC83D" : "#eee"} color={n < earned ? "#FFC83D" : "#eee"} className={n < earned ? "pop" : ""} />)}</div>
            <p style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>{tf("You got {c} out of {n} right", { c: correctCount, n: total })}</p>
            {bestStreak >= 3 && <p style={{ fontWeight: 700, color: "var(--ginger-deep)", margin: "6px 0 0" }}>🔥 Best streak: {bestStreak}</p>}
            <button className="bigbtn mint" onClick={() => startRound(ks, subject, topic)}>{t("Play again 🔁")}</button>
            <button className="bigbtn ghost" onClick={() => shareScore(correctCount, total)}>📣 {t("Share my score")}</button>
            <button className="bigbtn ghost" onClick={onBack}>{t("Pick another topic")}</button>
            {shareMsg && <p className="note" style={{ textAlign: "center" }}>{shareMsg}</p>}
          </div>
        );
      })()}
    </main>
  );
}

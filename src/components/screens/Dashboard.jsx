import { ArrowLeft, BarChart3, RefreshCw } from "lucide-react";
import { KS_LABEL, KS_META, SUBJ, SUBJECTS_BY_KS } from "../../data/curriculum.js";

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const accColor = (p) => (p >= 70 ? "var(--good)" : p >= 40 ? "var(--sunny)" : "var(--coral)");

/* On-device progress dashboard, extracted from App.jsx — markup unchanged. */
export default function Dashboard({ state, ov, weak, bound, setBound, openPortal, resetProgress, openPrivacy, goHome }) {
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><BarChart3 size={40} color="#6b4fb0" /><h2 className="fred" style={{ marginTop: 6 }}>Progress</h2><p>Parent &amp; teacher view</p></div>

      <div className="statgrid">
        <div className="stat"><b>{state.stars}</b><span>Stars earned</span></div>
        <div className="stat"><b>{ov.answered}</b><span>Questions answered</span></div>
        <div className="stat"><b>{ov.accuracy}%</b><span>Overall accuracy</span></div>
        <div className="stat"><b>{ov.rounds}</b><span>Rounds played</span></div>
      </div>

      {ov.answered === 0 && <p className="empty">No activity yet. Play a round to see progress here.</p>}

      {/* per-stage / per-subject accuracy */}
      {KS_META.map((m) => {
        const lines = SUBJECTS_BY_KS[m.id].map((s) => [s, state.stats[`${m.id}:${s}`]]).filter(([, v]) => v && v.answered);
        if (lines.length === 0) return null;
        return (
          <div className="card stagecard" key={m.id}>
            <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>{m.emoji} {KS_LABEL[m.id]}</div>
            {lines.map(([s, v]) => {
              const acc = Math.round((v.correct / v.answered) * 100);
              return (
                <div className="subjline" key={s}>
                  <div className="subjhead"><span>{SUBJ[s].name}</span><span>{acc}% · {v.correct}/{v.answered}</span></div>
                  <div className="bar"><i style={{ width: `${acc}%`, background: accColor(acc) }} /></div>
                </div>
              );
            })}
          </div>
        );
      })}

      {weak.length > 0 && (
        <>
          <div className="sectitle">Needs practice</div>
          <div className="card">
            {weak.map((w, i) => (
              <div className="tinytopic" key={i} style={{ fontSize: 14, color: "var(--ink)" }}>
                <span>{KS_LABEL[w.ks]} · {SUBJ[w.subject].name} · {w.topic}</span>
                <span style={{ color: accColor(w.accuracy), fontWeight: 800 }}>{w.accuracy}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {state.history.length > 0 && (
        <>
          <div className="sectitle">Recent activity</div>
          <div className="card">
            {state.history.slice(0, 8).map((h, i) => (
              <div className="actrow" key={i}>
                <span>{fmtDate(h.ts)} · {SUBJ[h.subject].name} · {h.topic}</span>
                <span className="actscore" style={{ color: accColor(Math.round((h.correct / h.total) * 100)) }}>{h.correct}/{h.total}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {bound ? (
        <div className="chip" style={{ margin: "0 0 12px" }}><RefreshCw size={14} /> Syncing this device to a child profile
          <button className="linkbtn" style={{ marginLeft: 8 }} onClick={() => setBound(null)}>Stop</button></div>
      ) : null}
      <button className="bigbtn purple" onClick={openPortal}>Parent &amp; Teacher portal →</button>
      <button className="bigbtn ghost" onClick={resetProgress} style={{ marginTop: 18 }}>Reset progress</button>
      <p className="note">No ads, ever. Progress saves on this device and syncs across devices when you use an account. <button className="linkbtn" onClick={openPrivacy}>Privacy policy</button></p>
    </main>
  );
}

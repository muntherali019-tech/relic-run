import { ArrowLeft, Sparkles, ScanLine, Camera, Calculator as CalcIcon } from "lucide-react";
import { useT } from "../../lib/i18n.js";
import { KS_LABEL, SUBJ, SUBJECTS_BY_KS, TOPICS } from "../../data/curriculum.js";

/* Stage menu (subject + topic picker and helper tools), extracted from App.jsx — markup unchanged. */
export default function SubjectMenu({ ks, subject, setSubject, motiv, startRound, openCalc, openSolve, openMark, goHome }) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back to home" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><h2 className="fred">{KS_LABEL[ks]}</h2><p>{t("Pick a subject to play")}</p></div>
      <div className="motiv"><Sparkles size={18} className="spark" color="#F2A33A" />{motiv}</div>
      <div className="subjgrid">
        {SUBJECTS_BY_KS[ks].map((s) => {
          const { name, color, Icon } = SUBJ[s];
          return (
            <button key={s} className={`subj${subject === s ? " on" : ""}`} style={{ background: color }} onClick={() => setSubject(s)}>
              <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}><Icon size={32} color="#fff" /></div>{name}
            </button>
          );
        })}
      </div>

      {subject && (<>
        <div className="sectitle">{SUBJ[subject].name} topics</div>
        <div className="toplist">
          {TOPICS[ks][subject].map(([name, em]) => (
            <button key={name} className="topic" onClick={() => startRound(ks, subject, name)}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 22 }}>{em}</span>{name}</span>
              <span className="dot" style={{ background: SUBJ[subject].color }} />
            </button>
          ))}
        </div>
        {subject === "maths" && (
          <button className="card toolcard" onClick={openCalc} aria-label="Open calculator">
            <div className="toolicon" style={{ background: "var(--purple-soft)" }}><CalcIcon size={26} color="#6b4fb0" /></div>
            <div><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Calculator")}</div>
              <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("A quick maths helper")}</div></div>
          </button>
        )}
      </>)}

      <div className="sectitle">{t("Helpers")}</div>
      <button className="card toolcard" onClick={openSolve}>
        <div className="toolicon" style={{ background: "var(--sky-soft)" }}><ScanLine size={28} color="#2b80d6" /></div>
        <div><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Scan & solve a question")}</div>
          <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Get the answer and working in real time")}</div></div>
      </button>
      <button className="card toolcard" onClick={openMark}>
        <div className="toolicon" style={{ background: "var(--purple-soft)" }}><Camera size={28} color="#6b4fb0" /></div>
        <div><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Mark my homework")}</div>
          <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Snap a photo and Mochi checks it")}</div></div>
      </button>
    </main>
  );
}

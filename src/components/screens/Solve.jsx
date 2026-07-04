import { ArrowLeft, ScanLine, Sparkles, Loader2, X, Lightbulb, RefreshCw } from "lucide-react";
import Mochi from "../Mochi.jsx";
import ConsentCard from "./ConsentCard.jsx";
import { useT } from "../../lib/i18n.js";
import { KS_LABEL } from "../../data/curriculum.js";

/* Scan & solve screen, extracted from App.jsx — markup unchanged. */
export default function Solve({
  ks, speaking, photoConsent, acceptPhotoConsent, svRef, sv, setSv, onSvFile,
  solveText, setSolveText, solving, doSolve, solveError, solveResult, setSolveResult, onBack,
}) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={onBack} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Mochi size={96} expression="think" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>{t("Scan & solve")}</h2><p>{KS_LABEL[ks]} · answer in real time</p></div>
      {!photoConsent && <ConsentCard onAccept={acceptPhotoConsent} />}
      {photoConsent && (<>
      <input ref={svRef} type="file" accept="image/*" capture="environment" onChange={onSvFile} style={{ display: "none" }} />
      {!sv.preview && (
        <div className="dropzone" onClick={() => svRef.current?.click()}>
          <ScanLine size={40} color="#2b80d6" />
          <p className="fred" style={{ fontSize: 19, margin: "10px 0 2px" }}>{t("Scan a question")}</p>
          <p style={{ color: "var(--muted)", fontWeight: 700, margin: 0, fontSize: 13 }}>{t("Point your camera at one question")}</p>
        </div>
      )}
      {sv.preview && <img src={sv.preview} alt="Question to solve" className="photo" />}
      {sv.preview && <button className="bigbtn ghost" onClick={() => svRef.current?.click()} style={{ marginTop: 12 }}>{t("Scan a different question")}</button>}
      <textarea className="txtin" placeholder="…or type the question here" value={solveText} onChange={(e) => setSolveText(e.target.value)} />
      {!solveResult && <button className="bigbtn sky" disabled={solving || (!sv.data && !solveText.trim())} onClick={doSolve}>
        {solving ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Loader2 className="wiggle" size={20} /> {t("Solving…")}</span>
                 : <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Sparkles size={20} /> {t("Get the answer")}</span>}
      </button>}
      {solveError && <div className="feedback no" style={{ marginTop: 16 }}><X size={20} /><div>{solveError}</div></div>}
      {solveResult && (
        <div className="card" style={{ marginTop: 16 }}>
          {solveResult.subject && <span className="pill">{solveResult.subject}</span>}
          {solveResult.questionRead && <div className="qquote">“{solveResult.questionRead}”</div>}
          {solveResult.answer && <div className="ans">{solveResult.answer}</div>}
          {Array.isArray(solveResult.steps) && solveResult.steps.length > 0 && (
            <><div className="sectitle" style={{ marginTop: 18 }}>How to get there</div><ol className="steps">{solveResult.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>
          )}
          {solveResult.concept && <div className="feedback ok" style={{ marginTop: 14 }}><Lightbulb size={20} /><div>{solveResult.concept}</div></div>}
          <button className="bigbtn ghost" onClick={() => { setSolveResult(null); setSv({ preview: null, data: null, mime: null }); setSolveText(""); }} style={{ marginTop: 14 }}>
            <RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Solve another")}
          </button>
        </div>
      )}
      </>)}
      <p className="note">Try the question yourself first — then use Mochi to check the method. A grown-up should confirm important answers.</p>
    </main>
  );
}

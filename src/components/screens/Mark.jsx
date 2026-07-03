import { ArrowLeft, Camera, Sparkles, Loader2, Check, X, RefreshCw } from "lucide-react";
import Mochi from "../Mochi.jsx";
import ConsentCard from "./ConsentCard.jsx";
import { useT } from "../../lib/i18n.js";
import { KS_LABEL, SUBJ } from "../../data/curriculum.js";

/* Mark-my-homework screen, extracted from App.jsx — markup unchanged. */
export default function Mark({
  ks, subject, speaking, photoConsent, acceptPhotoConsent, hwRef, hw, setHw, onHwFile,
  marking, doMark, markError, markResult, setMarkResult, onBack,
}) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={onBack} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Mochi size={96} expression="read" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>{t("Mark my homework")}</h2><p>{KS_LABEL[ks]}{subject ? ` · ${SUBJ[subject].name}` : ""}</p></div>
      {!photoConsent && <ConsentCard onAccept={acceptPhotoConsent} />}
      {photoConsent && (<>
      <input ref={hwRef} type="file" accept="image/*" capture="environment" onChange={onHwFile} style={{ display: "none" }} />
      {!hw.preview && (
        <div className="dropzone" onClick={() => hwRef.current?.click()}>
          <Camera size={40} color="#F26B2A" />
          <p className="fred" style={{ fontSize: 19, margin: "10px 0 2px" }}>Take or upload a photo</p>
          <p style={{ color: "var(--muted)", fontWeight: 700, margin: 0, fontSize: 13 }}>Lay the page flat in good light</p>
        </div>
      )}
      {hw.preview && (<>
        <img src={hw.preview} alt="Homework to mark" className="photo" />
        <button className="bigbtn ghost" onClick={() => hwRef.current?.click()} style={{ marginTop: 12 }}>Choose a different photo</button>
        {!markResult && <button className="bigbtn purple" disabled={marking} onClick={doMark}>
          {marking ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Loader2 className="wiggle" size={20} /> Mochi is marking…</span>
                   : <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Sparkles size={20} /> Mark it!</span>}
        </button>}
      </>)}
      {markError && <div className="feedback no" style={{ marginTop: 16 }}><X size={20} /><div>{markError}</div></div>}
      {markResult && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="pill">{markResult.subjectDetected || "Homework"}</span>
            {markResult.score && <span className="fred" style={{ fontWeight: 700, fontSize: 22 }}>{markResult.score}</span>}
          </div>
          {markResult.summary && <p style={{ fontWeight: 700, marginTop: 12 }}>{markResult.summary}</p>}
          {Array.isArray(markResult.items) && markResult.items.length > 0 && (
            <div style={{ marginTop: 8 }}>{markResult.items.map((it, i) => (
              <div className="markitem" key={i}>
                <div className="markmark" style={{ background: it.correct ? "var(--good)" : "var(--bad)" }}>{it.correct ? <Check size={18} /> : <X size={18} />}</div>
                <div><div style={{ fontWeight: 800 }}>{it.label}</div>{it.comment && <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 14 }}>{it.comment}</div>}</div>
              </div>
            ))}</div>
          )}
          {markResult.praise && <div className="feedback ok" style={{ marginTop: 14 }}><Sparkles size={20} /><div>{markResult.praise}</div></div>}
          {markResult.nextStep && <p style={{ fontWeight: 700, marginTop: 12 }}>👉 <b>Try next:</b> {markResult.nextStep}</p>}
          <button className="bigbtn ghost" onClick={() => { setMarkResult(null); setHw({ preview: null, data: null, mime: null }); }} style={{ marginTop: 14 }}>
            <RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Mark another")}
          </button>
        </div>
      )}
      </>)}
      <p className="note">Mochi gives friendly guidance. A grown-up should always check important marks.</p>
    </main>
  );
}

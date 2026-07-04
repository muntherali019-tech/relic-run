import { ArrowLeft, Loader2 } from "lucide-react";
import Mochi from "../Mochi.jsx";

/* Grown-ups multiplication gate screen, extracted from App.jsx — markup unchanged. */
export default function Gate({ gate, setGate, checkGate, buying, buyError, goHome }) {
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="gatebox">
        <Mochi size={110} expression="think" />
        <h2 className="fred" style={{ marginTop: 6 }}>For grown-ups</h2>
        <p style={{ color: "var(--muted)", fontWeight: 700 }}>
          {gate.intent === "purchase" ? "To confirm a purchase, please answer this:" : "To see progress, answer this:"}
        </p>
        <p className="fred" style={{ fontSize: 30, margin: "8px 0 0" }}>{gate.a} × {gate.b} = ?</p>
        <div><input className="gatein" inputMode="numeric" value={gate.val} autoFocus
          onChange={(e) => setGate((g) => ({ ...g, val: e.target.value.replace(/[^0-9]/g, ""), err: false }))}
          onKeyDown={(e) => e.key === "Enter" && checkGate()} /></div>
        {gate.err && <p style={{ color: "var(--bad)", fontWeight: 800, marginTop: 8 }}>Not quite — try again.</p>}
        {buyError && <p className="err">{buyError}</p>}
        <button className="bigbtn purple" disabled={buying} onClick={checkGate}>
          {buying ? <Loader2 className="wiggle" size={18} /> : gate.intent === "purchase" ? "Confirm" : "Enter dashboard"}
        </button>
      </div>
    </main>
  );
}

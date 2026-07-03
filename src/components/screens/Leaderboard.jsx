import { ArrowLeft, Star, Loader2 } from "lucide-react";
import Mochi from "../Mochi.jsx";
import { useT } from "../../lib/i18n.js";

/* Weekly leaderboard screen, extracted from App.jsx — markup unchanged. */
export default function Leaderboard({ bound, board, boardBusy, boardScope, openGate, goHome, onInvite, shareMsg }) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><h2 className="fred">🏆 {t("Leaderboard")}</h2><p>{t("This week")}{boardScope ? ` · ${boardScope === "class" ? t("Class") : t("Family")}` : ""}</p></div>
      {!bound?.token ? (
        <div className="card" style={{ textAlign: "center" }}>
          <Mochi size={84} expression="idle" />
          <p style={{ fontWeight: 700 }}>{t("Ask a grown-up to connect this device to your family or class to join the leaderboard.")}</p>
          <button className="bigbtn purple" onClick={openGate}>{t("Open the grown-ups area")}</button>
        </div>
      ) : boardBusy ? (
        <div style={{ textAlign: "center", marginTop: 30 }}><Loader2 className="wiggle" size={26} color="#FF8A47" /></div>
      ) : (board && board.length) ? (
        <div className="lboard">
          {board.map((r, i) => (
            <div key={i} className={`lrow ${r.you ? "you" : ""}`}>
              <span className="lrank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
              <span className="lname">{r.name}{r.you ? ` (${t("You")})` : ""}</span>
              <span className="lstars"><Star size={15} fill="#FFC83D" color="#FFC83D" /> {r.stars}</span>
            </div>
          ))}
        </div>
      ) : <p className="note" style={{ textAlign: "center" }}>{t("No scores yet this week — be the first!")}</p>}
      <button className="bigbtn ghost" style={{ marginTop: 14 }} onClick={onInvite}>{t("Invite a friend")}</button>
      {shareMsg && <p className="note" style={{ textAlign: "center" }}>{shareMsg}</p>}
    </main>
  );
}

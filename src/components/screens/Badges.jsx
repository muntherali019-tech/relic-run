import { ArrowLeft } from "lucide-react";
import Mochi from "../Mochi.jsx";
import { useT, tf } from "../../lib/i18n.js";
import { badgeStatus, earnedCount, BADGES } from "../../lib/achievements.js";

/* Badges screen, extracted from App.jsx — markup unchanged. */
export default function Badges({ state, speaking, goHome, onInvite, shareMsg }) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Mochi size={92} expression="happy" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>🏅 {t("Your badges")}</h2><p>{tf("{e} of {t} earned", { e: earnedCount(state), t: BADGES.length })}</p></div>
      <div className="badgegrid">
        {badgeStatus(state).map((b) => (
          <div key={b.id} className={`badge ${b.earned ? "earned" : ""}`}>
            <div className="bi">{b.icon}</div>
            <div className="bn">{b.name}</div>
            <div className="bd">{b.desc}</div>
          </div>
        ))}
      </div>
      <button className="bigbtn ghost" style={{ marginTop: 16 }} onClick={onInvite}>{t("Invite a friend")}</button>
      {shareMsg && <p className="note" style={{ textAlign: "center" }}>{shareMsg}</p>}
    </main>
  );
}

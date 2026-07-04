import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import Mochi from "../Mochi.jsx";
import { useT } from "../../lib/i18n.js";

/* Ask Mochi tutor-chat screen, extracted from App.jsx — markup unchanged. */
export default function AskMochi({ chatMsgs, chatBusy, chatInput, setChatInput, chatEndRef, sendChat, speaking, goHome }) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Mochi size={84} expression={chatBusy ? "think" : "happy"} speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>💬 {t("Ask Mochi")}</h2></div>
      <div className="chatwrap">
        {chatMsgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
        {chatBusy && <div className="bubble mochi typing">{t("Mochi is thinking…")}</div>}
        <div ref={chatEndRef} />
      </div>
      <div className="chips">
        {[t("Explain this"), t("Give me a hint"), t("Another example")].map((c) => <button key={c} className="qchip" onClick={() => sendChat(c)} disabled={chatBusy}>{c}</button>)}
      </div>
      <div className="chatbar">
        <input className="chatinput" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder={t("Type your question…")} aria-label={t("Type your question…")} />
        <button className="sendbtn" onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()} aria-label={t("Send")}>{chatBusy ? <Loader2 className="wiggle" size={18} /> : <ArrowRight size={20} />}</button>
      </div>
    </main>
  );
}

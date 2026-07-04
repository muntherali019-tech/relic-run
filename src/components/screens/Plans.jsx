import { ArrowLeft, Crown, Check } from "lucide-react";
import { useT, tf } from "../../lib/i18n.js";
import { PLANS } from "../../data/curriculum.js";
import * as trial from "../../lib/trial.js";
import * as billing from "../../lib/billing.js";

/* Subscription plans screen, extracted from App.jsx — markup unchanged. */
export default function Plans({ state, startTrialFor, priceFor, requestPurchase, restorePurchases, buyError, billingNote, goHome }) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Crown size={42} color="#F2A33A" /><h2 className="fred" style={{ marginTop: 6 }}>{t("Choose a plan")}</h2><p>{t("Cancel any time")}</p></div>
      {trial.trialActive()
        ? <div className="trialbar">{tf("✨ Free trial active — {h}h left", { h: trial.hoursLeft() })}</div>
        : !trial.trialUsed()
          ? <button className="bigbtn mint" onClick={() => startTrialFor(null)}>{t("Start your 72-hour free trial")}</button>
          : <p className="note" style={{ textAlign: "center" }}>{t("Your free trial has ended — subscribe to keep learning.")}</p>}
      {Object.entries(PLANS).map(([key, p]) => (
        <div key={key} className="plan" style={{ background: p.color }}>
          <h3 className="fred">{p.name}</h3>
          <div style={{ marginTop: 6 }}><span className="price">{priceFor(key)}</span><span style={{ fontWeight: 800 }}> {t("/month")}</span></div>
          <div style={{ fontWeight: 800, opacity: .95, marginTop: 2 }}>{p.covers}</div>
          <ul>{p.features.map((f) => <li key={f}><Check size={18} /> {f}</li>)}</ul>
          {state.subs[key]
            ? <button className="planbtn active" disabled><Check size={16} style={{ verticalAlign: "-3px" }} /> Active</button>
            : <button className="planbtn" onClick={() => requestPurchase(key)}>{tf("Subscribe — {price}/mo", { price: priceFor(key) })}</button>}
        </div>
      ))}
      {buyError && <p className="err">{buyError}</p>}
      {billing.mode() !== "stripe" && <button className="bigbtn ghost" onClick={restorePurchases}>{t("Restore purchases")}</button>}
      <p className="note">{billingNote}</p>
    </main>
  );
}

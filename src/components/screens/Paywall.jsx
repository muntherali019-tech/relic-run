import { ArrowLeft, Lock, Check } from "lucide-react";
import { useT, tf } from "../../lib/i18n.js";
import { PLANS, KS_LABEL, planForKs } from "../../data/curriculum.js";
import * as trial from "../../lib/trial.js";

/* Per-stage paywall screen, extracted from App.jsx — markup unchanged. */
export default function Paywall({ pendingKs, startTrialFor, priceFor, requestPurchase, buyError, billingNote, goHome }) {
  const t = useT();
  const plan = planForKs(pendingKs); const p = PLANS[plan];
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}>
        <Lock size={38} color={plan === "junior" ? "#F26B2A" : "#6b4fb0"} />
        <h2 className="fred" style={{ marginTop: 8 }}>{tf("{ks} is locked", { ks: KS_LABEL[pendingKs] })}</h2>
        <p>{tf("Unlock it with the {plan} plan", { plan: p.name })}</p>
      </div>
      {!trial.trialUsed() && <button className="bigbtn mint" onClick={() => startTrialFor(pendingKs)}>{t("Start 72-hour free trial")}</button>}
      {trial.trialUsed() && !trial.trialActive() && <p className="note" style={{ textAlign: "center" }}>{t("Your free trial has ended.")}</p>}
      <div className="plan" style={{ background: p.color }}>
        <h3 className="fred">{p.name}</h3>
        <div style={{ marginTop: 6 }}><span className="price">{priceFor(plan)}</span><span style={{ fontWeight: 800 }}> {t("/month")}</span></div>
        <div style={{ fontWeight: 800, opacity: .95, marginTop: 2 }}>{p.covers}</div>
        <ul>{p.features.map((f) => <li key={f}><Check size={18} /> {f}</li>)}</ul>
        <button className="planbtn" onClick={() => requestPurchase(plan)}>{tf("Subscribe & start — {price}/mo", { price: priceFor(plan) })}</button>
      </div>
      <p className="trustline">{t("Cancel anytime · No ads · Made for families")}</p>
      {buyError && <p className="err">{buyError}</p>}
      <p className="note">{billingNote}</p>
    </main>
  );
}

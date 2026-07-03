import { ArrowLeft, Settings, Bell, Globe, Volume2, Star } from "lucide-react";
import { useT, resetTranslations } from "../../lib/i18n.js";
import { LANGUAGES } from "../../data/languages.js";
import * as speech from "../../lib/speech.js";
import * as review from "../../lib/review.js";

/* Settings screen, extracted from App.jsx — markup unchanged. */
export default function SettingsScreen({
  voiceOn, toggleVoice, narrateOn, toggleNarrate, guideOn, toggleGuide,
  reminder, toggleReminder, changeReminderTime, reminderMsg,
  voiceLang, setVoiceLang, localizedSpeak, manageSub, manageMsg, openPrivacy, goHome,
}) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}><Settings size={36} color="#6b4fb0" /><h2 className="fred" style={{ marginTop: 6 }}>{t("Settings")}</h2><p>{t("Voice & accessibility")}</p></div>
      <div className="card">
        <div className="setrow">
          <div><div style={{ fontWeight: 800 }}>{t("Mochi's voice")}</div><div className="muted">{t("Mochi speaks and cheers you on.")}</div></div>
          <button className={`switch ${voiceOn ? "on" : ""}`} role="switch" aria-checked={voiceOn} aria-label="Mochi's voice" onClick={toggleVoice}><span /></button>
        </div>
        <div className="setrow">
          <div><div style={{ fontWeight: 800 }}>{t("Read questions aloud")}</div><div className="muted">{t("Reads each question and its options — great for early or blind readers. Needs Mochi's voice on.")}</div></div>
          <button className={`switch ${narrateOn ? "on" : ""}`} role="switch" aria-checked={narrateOn} aria-label="Read questions aloud" onClick={toggleNarrate}><span /></button>
        </div>
        <div className="setrow">
          <div><div style={{ fontWeight: 800 }}>{t("Mochi guides me")}</div><div className="muted">{t("Mochi welcomes you and gives spoken tips around the app. On by default.")}</div></div>
          <button className={`switch ${guideOn ? "on" : ""}`} role="switch" aria-checked={guideOn} aria-label="Mochi guides me" onClick={toggleGuide}><span /></button>
        </div>
        <div className="setrow">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}><Bell size={15} style={{ verticalAlign: "-2px" }} /> {t("Daily reminder")}</div>
            <div className="muted">{t("A gentle nudge to keep your streak going")}</div>
            {reminder.on && (
              <label style={{ display: "block", marginTop: 6, fontWeight: 700, fontSize: 13 }}>{t("Remind me at")}{" "}
                <select value={`${reminder.hour}:${reminder.minute}`} onChange={changeReminderTime} style={{ fontFamily: "inherit", fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "2px solid #eadfce" }}>
                  <option value="15:0">3:00 pm</option><option value="15:30">3:30 pm</option><option value="16:0">4:00 pm</option>
                  <option value="17:0">5:00 pm</option><option value="18:0">6:00 pm</option><option value="19:0">7:00 pm</option><option value="19:30">7:30 pm</option>
                </select>
              </label>
            )}
            {reminderMsg && <div className="muted" style={{ marginTop: 6, color: "var(--ginger-deep)" }}>{reminderMsg}</div>}
          </div>
          <button className={`switch ${reminder.on ? "on" : ""}`} role="switch" aria-checked={reminder.on} aria-label="Daily reminder" onClick={toggleReminder}><span /></button>
        </div>
        <div className="setrow">
          <div><div style={{ fontWeight: 800 }}><Globe size={15} style={{ verticalAlign: "-2px", marginRight: 4 }} />{t("Mochi's language")}</div><div className="muted">{t("The language Mochi speaks. Starts in English; you can also say “speak in French”.")}</div></div>
          <select className="langsel" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} aria-label="Mochi's language">
            {LANGUAGES.map((l) => <option key={l.id} value={l.code}>{l.emoji} {l.name}</option>)}
          </select>
        </div>
      </div>
      {!speech.supported() && <p className="note">Your device doesn't expose a speech voice here — try the latest Chrome, or the Android app with a text-to-speech engine installed.</p>}
      {speech.mode() === "cloud" && <p className="note">✨ Premium voice is enabled.</p>}
      <button className="bigbtn ghost" onClick={() => localizedSpeak("Hi! This is how I sound. You can do it!", { respectSetting: false })}><Volume2 size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Hear a sample")}</button>
      <button className="bigbtn ghost" onClick={() => review.requestReview()}><Star size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Rate Education Academy")}</button>
      <button className="bigbtn ghost" onClick={manageSub}>{t("Manage subscription")}</button>
      {manageMsg && <p className="note" style={{ textAlign: "center" }}>{manageMsg}</p>}
      {!String(voiceLang).startsWith("en") && <p className="note"><button className="linkbtn" onClick={resetTranslations}>{t("Reset translations")}</button></p>}
      <p className="note"><button className="linkbtn" onClick={openPrivacy}>{t("Privacy policy")}</button></p>
    </main>
  );
}

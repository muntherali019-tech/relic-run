import { ArrowLeft, Star } from "lucide-react";
import Mochi from "../Mochi.jsx";
import { useT, tf } from "../../lib/i18n.js";
import { SHOP, COLOR_THEMES } from "../../lib/mochiShop.js";

/* Mochi's shop screen, extracted from App.jsx — markup unchanged. */
export default function Shop({ state, owns, buyItem, equipItem, buyFreeze, toggleGlasses, goHome }) {
  const t = useT();
  return (
    <main>
      <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
      <div className="greet" style={{ marginTop: 4 }}>
        <Mochi size={120} expression="happy" />
        <h2 className="fred" style={{ marginTop: 6 }}>🎩 {t("Mochi's shop")}</h2>
        <p>{t("Dress up Mochi with stars you've earned")}</p>
        <div className="starcount" style={{ margin: "6px auto 0" }}><Star size={18} fill="#FFC83D" color="#FFC83D" />{state.stars}</div>
      </div>

      <h3 className="fred shoph">{t("Colours")}</h3>
      <div className="shopgrid">
        {SHOP.colors.map((it) => {
          const owned = owns(it.id); const on = (state.mochi?.color || "ginger") === it.id;
          return (
            <div key={it.id} className={`shopitem ${on ? "on" : ""}`}>
              <div className="swatch" style={{ background: COLOR_THEMES[it.id].base }} />
              <div className="sn">{it.name}</div>
              {!owned ? <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyItem(it.id)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                : <button className="shopbtn alt" onClick={() => equipItem("color", it.id)} disabled={on}>{on ? t("Wearing ✓") : t("Wear")}</button>}
            </div>
          );
        })}
      </div>

      <h3 className="fred shoph">{t("Hats")}</h3>
      <div className="shopgrid">
        {SHOP.hats.map((it) => {
          const owned = owns(it.id); const on = (state.mochi?.hat || "none") === it.id;
          return (
            <div key={it.id} className={`shopitem ${on ? "on" : ""}`}>
              <div className="hatprev"><Mochi size={64} expression="idle" hat={it.id} glasses={false} color={state.mochi?.color} /></div>
              <div className="sn">{it.name}</div>
              {!owned ? <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyItem(it.id)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                : <button className="shopbtn alt" onClick={() => equipItem("hat", it.id)} disabled={on}>{on ? t("Wearing ✓") : t("Wear")}</button>}
            </div>
          );
        })}
      </div>

      <h3 className="fred shoph">{t("Extras")}</h3>
      <div className="shopgrid">
        {SHOP.extras.map((it) => {
          if (it.id === "streakfreeze") {
            return (
              <div key={it.id} className="shopitem">
                <div className="hatprev" style={{ fontSize: 34 }}>🧊</div>
                <div className="sn">{it.name}</div>
                <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.25 }}>{t("Saves your streak if you miss a day")}</div>
                <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>{tf("You have {n}", { n: state.freezes || 0 })}</div>
                <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyFreeze(it.cost)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
              </div>
            );
          }
          const owned = owns(it.id); const on = !!state.mochi?.glasses;
          return (
            <div key={it.id} className="shopitem">
              <div className="hatprev"><Mochi size={64} expression="idle" glasses hat="none" color={state.mochi?.color} /></div>
              <div className="sn">{it.name}</div>
              {!owned ? <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyItem(it.id)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                : <button className="shopbtn alt" onClick={toggleGlasses}>{on ? t("Glasses off") : t("Glasses on")}</button>}
            </div>
          );
        })}
      </div>
    </main>
  );
}

/* One-time camera-consent card shown before photo features (moved from App.jsx). */
export default function ConsentCard({ onAccept }) {
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>📸 Before you take a photo</div>
      <p className="muted" style={{ marginTop: 6 }}>
        To give feedback, your photo is sent securely to an AI service and is <b>not stored</b> afterwards.
        Please check with a parent or teacher before using the camera.
      </p>
      <button className="bigbtn purple" onClick={onAccept}>A grown-up is here — continue</button>
      <p className="note" style={{ marginTop: 8 }}>You'll only see this once on this device.</p>
    </div>
  );
}

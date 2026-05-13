import { useState, useEffect } from "react";
import logo from "../assets/logo.png";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setFading(true), 2000);
    const t2 = window.setTimeout(() => onDone(), 2650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className={`splash-screen ${fading ? "splash-fading" : ""}`}>
      <div className="splash-content">
        <img src={logo} className="splash-logo" alt="Meflix" />
        <div className="splash-bar">
          <div className="splash-bar-fill" />
        </div>
      </div>
    </div>
  );
}

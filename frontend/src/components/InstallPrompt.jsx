import { useState, useEffect, useRef } from "react";

// Detect iOS Safari (no beforeinstallprompt support)
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Detect if already running as installed PWA
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}

function InstallPrompt({ lang }) {
  const [showButton, setShowButton] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const deferredPromptRef = useRef(null);

  useEffect(() => {
    // Already installed as PWA — don't show anything
    if (isStandalone()) return;

    // Check if user dismissed it before
    const dismissed = localStorage.getItem("install_dismissed");
    if (dismissed) return;

    if (isIOS()) {
      // iOS: show button that opens instruction overlay
      setShowButton(true);
    } else {
      // Android/Desktop Chrome: listen for the install prompt event
      const handler = (e) => {
        e.preventDefault();
        deferredPromptRef.current = e;
        setShowButton(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  const handleInstallClick = async () => {
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }

    // Android/Chrome: trigger the native install prompt
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") {
      setShowButton(false);
    }
    deferredPromptRef.current = null;
  };

  const dismiss = () => {
    setShowButton(false);
    setShowIOSGuide(false);
    localStorage.setItem("install_dismissed", "1");
  };

  if (!showButton) return null;

  return (
    <>
      <button
        onClick={handleInstallClick}
        style={{
          marginTop: 15,
          background: "linear-gradient(135deg, #333, #222)",
          border: "1px solid #444",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          padding: "12px 24px",
          borderRadius: 30,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          maxWidth: 300,
        }}
      >
        📲 {lang === "de" ? "Als App installieren" : "Install as App"}
      </button>

      {/* iOS instruction overlay */}
      {showIOSGuide && (
        <div
          onClick={dismiss}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a1a",
              borderRadius: 20,
              padding: "28px 24px",
              maxWidth: 340,
              width: "100%",
              textAlign: "center",
              border: "1px solid #333",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📲</div>
            <h2 style={{
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 20,
              color: "#fff",
            }}>
              {lang === "de" ? "Zum Home-Bildschirm" : "Add to Home Screen"}
            </h2>

            <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#1DB954", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 16, flexShrink: 0,
                }}>1</div>
                <span style={{ color: "#ddd", fontSize: 15 }}>
                  {lang === "de"
                    ? <>Tippe auf <span style={{ fontSize: 20 }}>⎋</span> (Teilen-Button) unten in Safari</>
                    : <>Tap <span style={{ fontSize: 20 }}>⎋</span> (Share button) at the bottom of Safari</>
                  }
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#1DB954", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 16, flexShrink: 0,
                }}>2</div>
                <span style={{ color: "#ddd", fontSize: 15 }}>
                  {lang === "de"
                    ? <>Scrolle und tippe <strong style={{ color: "#fff" }}>"Zum Home-Bildschirm"</strong></>
                    : <>Scroll down and tap <strong style={{ color: "#fff" }}>"Add to Home Screen"</strong></>
                  }
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#1DB954", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 16, flexShrink: 0,
                }}>3</div>
                <span style={{ color: "#ddd", fontSize: 15 }}>
                  {lang === "de"
                    ? <>Tippe <strong style={{ color: "#fff" }}>"Hinzufügen"</strong> — fertig!</>
                    : <>Tap <strong style={{ color: "#fff" }}>"Add"</strong> — done!</>
                  }
                </span>
              </div>
            </div>

            <button
              onClick={dismiss}
              style={{
                marginTop: 24,
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: 30,
                padding: "10px 28px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                minWidth: "unset",
                boxShadow: "none",
              }}
            >
              {lang === "de" ? "Verstanden" : "Got it"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default InstallPrompt;
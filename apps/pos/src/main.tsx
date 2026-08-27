import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// El service worker solo guarda la interfaz. Las rutas API no se cachean para
// que la información financiera, inventario y cobros nunca queden obsoletos.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // El POS funciona sin PWA si el navegador o la red bloquean el registro.
  });
}

import { createRoot } from "react-dom/client";
import { supabase } from "./integrations/supabase/client";
import App from "./App.tsx";
import "./index.css";

// Process OAuth hash token before React renders
const hash = window.location.hash;
if (hash && hash.includes("access_token")) {
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (accessToken && refreshToken) {
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error setting session:", error);
        } else {
          console.log("Session set manually:", data.session?.user?.email);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      });
  }
}

createRoot(document.getElementById("root")!).render(<App />);

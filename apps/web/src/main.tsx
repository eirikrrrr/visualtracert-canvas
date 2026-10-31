// first: what an older version saved in this browser moves to the current keys
import "./app/migrate";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
// the typefaces, with the app (no font service: it works offline): a browser
// downloads each one only when the page uses it
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "./styles.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

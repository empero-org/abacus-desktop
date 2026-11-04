import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AbacusApp } from "@/abacus/AbacusApp.js";
import { BrowserApp } from "@/abacus/views/BrowserPane.js";
import "@/abacus/abacus.css";

const root = document.getElementById("root");
if (!root) throw new Error("the window has no #root element");
createRoot(root).render(
  <StrictMode>
    {/* A popped-out browser window loads this renderer with #browser. */}
    {window.location.hash === "#browser" ? <BrowserApp /> : <AbacusApp />}
  </StrictMode>,
);

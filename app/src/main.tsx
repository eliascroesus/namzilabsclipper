import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";

// On a desktop the columns scroll, never the page itself: undo any page scroll a focus
// jump causes, and don't bring one back on reload.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const desktop = window.matchMedia("(min-width: 921px)");
const unscroll = () => {
  if (desktop.matches && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
};
window.addEventListener("scroll", unscroll, { passive: true });
unscroll();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

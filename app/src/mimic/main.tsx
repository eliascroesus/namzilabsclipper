import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MimicApp } from "./ui/MimicApp";
import { mimic } from "./ui/store";
import "../ui/styles.css";
import "./ui/mimic.css";

// On a desktop the columns scroll, never the page itself.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const desktop = window.matchMedia("(min-width: 921px)");
const unscroll = () => {
  if (desktop.matches && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
};
window.addEventListener("scroll", unscroll, { passive: true });
unscroll();

// The browser tests drive the page through its store (e2e/mimic.mjs).
if (new URLSearchParams(location.search).has("test")) (window as unknown as { __mimic: typeof mimic }).__mimic = mimic;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MimicApp />
  </StrictMode>,
);

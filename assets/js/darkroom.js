/* Darkroom suite shell
   ---------------------
   Switches between the tool panels from the left sidebar and keeps the choice
   in the URL hash (#discord / #carousel) so tools are deep-linkable. The tools
   themselves (image-to-discord.js, carousel.js) initialise independently; this
   only shows/hides their panels. When a panel becomes visible it fires a resize
   so any canvas-based tool re-measures its now-visible width. */

(() => {
  "use strict";

  const TOOLS = {
    discord: "panel-discord", resize: "panel-resize", convert: "panel-convert",
    carousel: "panel-carousel", collage: "panel-collage",
  };
  const ALIASES = {
    compress: "discord", "image-to-discord": "discord",
    slides: "carousel", panorama: "carousel",
    scale: "resize", layout: "collage", grid: "collage",
  };
  const LABELS = {
    discord: "IMAGE TO DISCORD", resize: "RESIZE", convert: "CONVERT",
    carousel: "SEAMLESS CAROUSEL", collage: "COLLAGE MAKER",
  };
  const TITLES = {
    discord: "Image to Discord Image, Darkroom | Ghillie",
    resize: "Resize Image, Darkroom | Ghillie",
    convert: "Convert Image Format, Darkroom | Ghillie",
    carousel: "Seamless Carousel Maker, Darkroom | Ghillie",
    collage: "Collage Maker, Darkroom | Ghillie",
  };

  const navBtns = [...document.querySelectorAll(".dr-tool[data-tool]")];
  const panels = [...document.querySelectorAll(".dr-panel[data-panel]")];
  const metaBr = document.querySelector(".meta-br");

  function resolve(hash) {
    let h = (hash || "").replace(/^#/, "").toLowerCase();
    if (ALIASES[h]) h = ALIASES[h];
    return TOOLS[h] ? h : "discord";
  }

  function show(tool) {
    navBtns.forEach((b) => {
      const on = b.dataset.tool === tool;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== tool; });
    if (metaBr) metaBr.textContent = LABELS[tool] || "DARKROOM";
    if (TITLES[tool]) document.title = TITLES[tool];
    // let a freshly-visible canvas tool re-measure its width
    window.dispatchEvent(new Event("resize"));
  }

  navBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.tool;
      if (resolve(location.hash) === t) { show(t); return; } // already active: just refresh
      location.hash = t; // triggers hashchange -> show()
    })
  );

  window.addEventListener("hashchange", () => show(resolve(location.hash)));
  show(resolve(location.hash));
})();

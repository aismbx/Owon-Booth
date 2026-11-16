/* ==========================================================================
   OWON BOOTH — SETTINGS
   This is the only file you need to edit to add your own artwork, colours,
   filters and pens. Paths are relative to the site root.
   ========================================================================== */
window.OWON_CONFIG = {

  /* Seconds counted down before each photo */
  countdown: 3,

  /* Pause between photos in one round (milliseconds) */
  pauseBetweenShots: 900,

  /* ---- FORMATS -----------------------------------------------------------
     Sizes match the design templates. Don't change these unless you also
     remake your frame PNGs at the new size.                                */
  formats: [
    { id: "strip4",  name: "Strip",  shots: 4, width: 1200, height: 3600, photo: [1000, 750],
      slots: [[100, 100], [100, 900], [100, 1700], [100, 2500]] },
    { id: "grid4",   name: "Grid",   shots: 4, width: 2250, height: 2000, photo: [1000, 750],
      slots: [[100, 100], [1150, 100], [100, 900], [1150, 900]] },
    { id: "single1", name: "Single", shots: 1, width: 2200, height: 1950, photo: [2000, 1500],
      slots: [[100, 100]] },
    { id: "duo2",    name: "Duo",    shots: 2, width: 1800, height: 2900, photo: [1600, 1200],
      slots: [[100, 100], [100, 1350]] }
  ],
  footerHeight: 350,   // bottom area where the message + date are printed

  /* ---- FRAME COLOURS (hex) ---------------------------------------------- */
  frameColours: [
    "#f7c6d0", "#f4a6b8", "#d6336c", "#b9e0e6", "#e9b6e3", "#f5d76e",
    "#c8a2c8", "#fffaf0", "#cfd8dc", "#a3c9a8", "#1b2a49", "#8b5e3c",
    "#555555", "#111111"
  ],
  defaultFrameColour: "#111111",

  /* ---- THEME FRAMES ------------------------------------------------------
     Each pack becomes a tab next to "Colours". Each theme lists one PNG per
     format. Leave a format out and the theme won't show for that format.   */
  themePacks: [
    {
      name: "Valentines",
      themes: [
        { id: "valentines", name: "Love Hearts", frames: {
            strip4: "frame-valentines-strip4.png",
            grid4: "frame-valentines-grid4.png",
            single1: "frame-valentines-single1.png",
            duo2: "frame-valentines-duo2.png" } }
      ]
    },
    {
      name: "Party",
      themes: [
        { id: "confetti", name: "Confetti", frames: {
            strip4: "frame-confetti-strip4.png",
            grid4: "frame-confetti-grid4.png",
            single1: "frame-confetti-single1.png",
            duo2: "frame-confetti-duo2.png" } }
      ]
    }
  ],

  /* ---- STICKERS ----------------------------------------------------------
     600x600 transparent PNGs. Each pack becomes a tab.                    */
  stickerPacks: [
    {
      name: "Main",
      stickers: [
        "sticker-heart.png",
        "sticker-star.png",
        "sticker-sparkle.png",
        "sticker-flower.png",
        "sticker-hi.png",
        "sticker-smiley.png"
      ]
    }
  ],
  stickerSize: 0.22,   // default sticker width as a fraction of the image's shorter side

  /* ---- DOODLE PENS -------------------------------------------------------
     sizes are in pixels on a 1200px-wide strip (scaled for other formats).

     brushes = your own PNG pens. The PNG is stamped repeatedly as you drag.
       src      128x128 transparent PNG
       tint     true  = draw the PNG in SOLID WHITE and it takes the chosen pen colour
                false = keeps your PNG's own colours (rainbow pens, glitter, etc.)
       spacing  gap between stamps (1 = touching, 0.5 = overlapping into a smooth line)
       scale    how big the stamp is compared with the normal pen (1 = default)
       jitter   0–1 random rotation per stamp (nice for glitter/flowers)        */
  pens: {
    colours: ["#111111", "#ffffff", "#e8365d", "#ff8fab", "#ffc93c", "#3ec1d3", "#6a4c93", "#5aa469"],
    sizes: [6, 14, 28],
    brushes: [
      { name: "Hearts", src: "brush-heart.png", tint: true, spacing: 1.4, scale: 1, jitter: 0 },
      { name: "Stars",  src: "brush-star.png",  tint: true, spacing: 1.4, scale: 1, jitter: 0.4 }
    ]
  },

  /* ---- SHADOW -------------------------------------------------------------
     Soft shadow the frame casts onto the photos, so they look set in.     */
  frameShadow: { opacity: 0.35, blur: 22, offsetY: 6 },

  /* ---- FILTERS -----------------------------------------------------------
     brightness / contrast / saturation: 1 = unchanged
     warmth: -60 (cool/blue) to 60 (warm/yellow)
     fade: 0–1 lifts the blacks for a washed, film look
     grayscale: 0–1     grain: 0–1     vignette: 0–1
     tint: [r, g, b, strength 0–1]  (optional colour wash)                 */
  filters: [
    { name: "Natural", brightness: 1,    contrast: 1,    saturation: 1,    warmth: 0 },
    { name: "Honey",   brightness: 1.05, contrast: 0.92, saturation: 1.05, warmth: 28, fade: 0.25, grain: 0.06 },
    { name: "Butter",  brightness: 1.1,  contrast: 0.85, saturation: 0.9,  warmth: 18, fade: 0.35, tint: [255, 236, 170, 0.12] },
    { name: "Mono",    brightness: 1.05, contrast: 1.25, saturation: 1,    grayscale: 1, grain: 0.08 },
    { name: "Blush",   brightness: 1.05, contrast: 0.95, saturation: 1.1,  warmth: 8, tint: [255, 170, 190, 0.12], fade: 0.15 },
    { name: "Film",    brightness: 1,    contrast: 1.1,  saturation: 0.8,  warmth: 12, fade: 0.3, grain: 0.12, vignette: 0.35 }
  ],

  /* ---- BRAND MARK ---------------------------------------------------------
     Small wordmark printed bottom-right of every frame (like a real booth).
     size = letter height in px on a 1200px-wide strip (scaled for others).
     colour "auto" = black on light frames, white on dark frames.          */
  brandMark: { show: true, text: "OWON", font: "Archivo Black", size: 32, colour: "auto" },

  /* ---- MESSAGE ------------------------------------------------------------ */
  message: {
    font: "Archivo",          // any Google Font loaded in index.html
    weight: 700,
    maxLength: 60,
    dateFormat: "dd.mm.yy  hh:mm",
    showDateByDefault: false  // true = date stamp ticked automatically
  }
};

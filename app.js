/* OWON BOOTH — app logic. Settings live in config.js. */
(() => {
  "use strict";
  const C = window.OWON_CONFIG;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function el(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.append(c));
    return n;
  }

  /* ---------------- state ---------------- */
  const S = {
    screen: "intro", lastBooth: "intro",
    format: null, filterIdx: 0,
    pool: [], round: [], picked: [],
    frameColour: C.defaultFrameColour, theme: null, textColour: "#fff",
    stickers: [], selected: null, strokes: [],
    pen: { colour: C.pens.colours[0], size: C.pens.sizes[1], brush: "pen" },
    decoTab: "stickers", step: "frame",
    message: "", showDate: !!C.message.showDateByDefault, date: new Date(),
    stream: null, camera: null, uploads: [], previewSrc: null, shooting: false,
  };
  const fmt = () => S.format;
  const filt = () => C.filters[S.filterIdx];
  const video = $("#video");
  video.removeAttribute("hidden");
  video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";

  /* ---------------- helpers ---------------- */
  const imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => {
      const i = new Image(); i.decoding = "async";
      i.onload = () => res(i); i.onerror = () => rej(new Error("Could not load " + src)); i.src = src;
    });
    return imgCache[src];
  }
  function toast(msg, ms = 2400) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  function srcSize(src) {
    if (src.videoWidth) return [src.videoWidth, src.videoHeight];
    return [src.naturalWidth || src.width, src.naturalHeight || src.height];
  }
  function drawCover(ctx, src, x, y, w, h, mirror) {
    const [sw, sh] = srcSize(src);
    const ta = w / h; let cw = sw, ch = sw / ta;
    if (ch > sh) { ch = sh; cw = sh * ta; }
    ctx.save(); ctx.translate(x, y);
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
    ctx.restore();
  }
  function luminance(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
  }
  function fmtDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return (C.message.dateFormat || "dd.mm.yy  hh:mm")
      .replace("dd", p(d.getDate())).replace("mm", p(d.getMonth() + 1))
      .replace("yyyy", d.getFullYear()).replace("yy", String(d.getFullYear()).slice(2))
      .replace("hh", p(d.getHours())).replace("mm", p(d.getMinutes()));
  }

  /* ---------------- filters (pixel based, same result in preview + capture) ---------------- */
  function filterPixels(d, w, h, f) {
    const br = f.brightness ?? 1, ct = f.contrast ?? 1, sat = f.saturation ?? 1;
    const wm = f.warmth || 0, fade = f.fade || 0, gray = f.grayscale || 0;
    const grain = f.grain || 0, vig = f.vignette || 0, tint = f.tint;
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = (i * br - 128) * ct + 128;
    const cx = w / 2, cy = h / 2, maxd = cx * cx + cy * cy;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
        if (sat !== 1) { const l = 0.299 * r + 0.587 * g + 0.114 * b; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
        if (gray) { const l = 0.299 * r + 0.587 * g + 0.114 * b; r += (l - r) * gray; g += (l - g) * gray; b += (l - b) * gray; }
        if (wm) { r += wm; g += wm * 0.35; b -= wm; }
        if (tint) { const a = tint[3] ?? 0.15; r += (tint[0] - r) * a; g += (tint[1] - g) * a; b += (tint[2] - b) * a; }
        if (fade) { const k = 1 - fade * 0.3, lift = fade * 45; r = r * k + lift; g = g * k + lift; b = b * k + lift; }
        if (vig) { const dx = x - cx, dy = y - cy; const k = 1 - vig * ((dx * dx + dy * dy) / maxd); r *= k; g *= k; b *= k; }
        if (grain) { const n = (Math.random() - 0.5) * grain * 110; r += n; g += n; b += n; }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
  }
  function renderFiltered(canvas, src, f, mirror) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    drawCover(ctx, src, 0, 0, w, h, mirror);
    const id = ctx.getImageData(0, 0, w, h);
    filterPixels(id.data, w, h, f);
    ctx.putImageData(id, 0, 0);
  }
  function makePhoto(src, mirror) {
    const [sw, sh] = srcSize(src);
    const w = Math.round(Math.min(1600, sw, sh * 4 / 3)), h = Math.round(w * 3 / 4);
    const c = el("canvas", { width: w, height: h });
    renderFiltered(c, src, filt(), mirror);
    const t = el("canvas", { width: 320, height: 240 });
    t.getContext("2d").drawImage(c, 0, 0, 320, 240);
    return { id: Math.random().toString(36).slice(2), canvas: c, thumb: t.toDataURL("image/jpeg", 0.8) };
  }

  /* ---------------- camera ---------------- */
  async function startCamera() {
    if (S.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) { camFail("Your browser doesn't support the camera here."); return false; }
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
      });
      S.stream = st; video.srcObject = st;
      await video.play().catch(() => {});
      if (!video.videoWidth) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
      S.camera = "ok"; S.previewSrc = video; $("#camMsg").hidden = true;
      return true;
    } catch (e) {
      camFail(e && e.name === "NotAllowedError"
        ? "Camera access was blocked. Allow it in your browser settings, or upload photos instead."
        : "We couldn't open your camera.");
      return false;
    }
  }
  function camFail(msg) {
    S.camera = "fail";
    $("#camMsgText").textContent = S.uploads.length ? `Using ${S.uploads.length} uploaded photo${S.uploads.length > 1 ? "s" : ""}.` : msg;
    $("#camMsg").hidden = false;
  }
  function stopCamera() {
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null; video.srcObject = null;
    if (S.previewSrc === video) S.previewSrc = S.uploads[0] || null;
  }

  /* ---------------- live render loop ---------------- */
  let frameN = 0;
  function loop() {
    frameN++;
    const src = S.previewSrc;
    const ready = src && (src !== video || video.readyState >= 2);
    if (ready && S.screen === "filter" && (src === video || frameN % 30 === 1)) {
      $$("#filterList canvas").forEach((c, i) => renderFiltered(c, src, C.filters[i], src === video));
    }
    if (ready && S.screen === "capture" && src === video) renderFiltered($("#liveCanvas"), video, filt(), true);
    requestAnimationFrame(loop);
  }

  /* ---------------- layout rendering ---------------- */
  const slotRects = (f) => f.slots.map(([x, y]) => ({ x, y, w: f.photo[0], h: f.photo[1] }));
  const frameLayers = {};
  function frameLayer(f, colour) {
    const key = f.id + colour;
    if (!frameLayers[key]) {
      const c = el("canvas", { width: f.width, height: f.height }), x = c.getContext("2d");
      x.fillStyle = colour; x.fillRect(0, 0, f.width, f.height);
      x.globalCompositeOperation = "destination-out";
      slotRects(f).forEach((r) => x.fillRect(r.x, r.y, r.w, r.h));
      frameLayers[key] = c;
    }
    return frameLayers[key];
  }
  // px = screen pixels per layout unit (canvas shadows ignore transforms, so we scale them by hand)
  function drawLayout(ctx, f, photos, colour, themeImg, px = 1) {
    ctx.clearRect(0, 0, f.width, f.height);
    slotRects(f).forEach((r, i) => {
      const p = photos[i];
      if (p) drawCover(ctx, p.canvas, r.x, r.y, r.w, r.h, false);
      else { ctx.fillStyle = "#e9e2d2"; ctx.fillRect(r.x, r.y, r.w, r.h); }
    });
    const sh = C.frameShadow || { opacity: 0, blur: 0, offsetY: 0 }, u = Math.min(f.width, f.height) / 1200 * px;
    ctx.save();
    if (sh.opacity > 0) {
      ctx.shadowColor = `rgba(0,0,0,${sh.opacity})`; ctx.shadowBlur = sh.blur * u; ctx.shadowOffsetY = sh.offsetY * u;
    }
    ctx.drawImage(frameLayer(f, colour), 0, 0);
    if (themeImg) ctx.drawImage(themeImg, 0, 0, f.width, f.height);
    ctx.restore();
  }
  function renderSmall(canvas, photos, colour = "#ffffff", scale = 0.4) {
    const f = fmt();
    canvas.width = Math.round(f.width * scale); canvas.height = Math.round(f.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawLayout(ctx, f, photos, colour, null, scale);
  }

  /* ---------------- navigation ---------------- */
  const BACK = {
    format: () => go("intro"), filter: () => go("format"),
    capture: () => go("filter"),
    favs: () => go(S.camera === "ok" ? "capture" : "filter"),
    studio: () => {
      const order = ["frame", "decorate", "message", "finish"];
      const i = order.indexOf(S.step);
      if (i > 0) setStep(order[i - 1]); else go("favs");
    },
    roll: () => go(S.lastBooth),
  };
  function go(name) {
    if (S.shooting) return;
    if (name !== "roll") S.lastBooth = name;
    S.screen = name;
    $$(".screen").forEach((s) => (s.hidden = s.id !== "s-" + name));
    $("#backBtn").hidden = name === "intro";
    if (["intro", "studio", "roll"].includes(name)) stopCamera();
    ({
      format: buildFormats, filter: enterFilter, capture: enterCapture,
      favs: enterFavs, studio: enterStudio, roll: renderRoll,
    }[name] || (() => {}))();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function resetAll() {
    S.shooting = false; stopCamera();
    Object.assign(S, { format: null, pool: [], round: [], picked: [], uploads: [], previewSrc: null, camera: null,
      stickers: [], strokes: [], selected: null, message: "", theme: null, frameColour: C.defaultFrameColour, step: "frame" });
    $("#messageIn").value = ""; S.showDate = !!C.message.showDateByDefault; $("#dateToggle").checked = S.showDate;
    go("intro");
  }
  $("#backBtn").onclick = () => BACK[S.screen]?.();
  $("#closeBtn").onclick = resetAll;
  $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go === "intro" ? S.lastBooth : b.dataset.go)));

  /* ---------------- intro ---------------- */
  const shotCounts = [...new Set(C.formats.map((f) => f.shots))].sort((a, b) => a - b);
  $("#introLine").textContent =
    `${shotCounts.slice(0, -1).join(", ")}${shotCounts.length > 1 ? " or " : ""}${shotCounts.at(-1)} frames, ${C.countdown} seconds each.`;
  $("#startBtn").onclick = () => go("format");

  /* ---------------- format ---------------- */
  function buildFormats() {
    const list = $("#formatList"); list.innerHTML = "";
    C.formats.forEach((f) => {
      const sc = 720 / f.height; // drawn sharp, CSS sets the display size
      const c = el("canvas", { width: Math.round(f.width * sc), height: Math.round(f.height * sc) });
      const ctx = c.getContext("2d"); ctx.scale(sc, sc);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, f.width, f.height);
      ctx.fillStyle = "#cfcfcf"; slotRects(f).forEach((r) => ctx.fillRect(r.x, r.y, r.w, r.h));
      const b = el("button", { class: "format" + (S.format === f ? " selected" : ""), title: f.name,
        onclick: () => { S.format = f; $$(".format").forEach((x) => x.classList.toggle("selected", x === b)); $("#formatNext").disabled = false; },
        ondblclick: () => { S.format = f; go("filter"); } }, [c, el("span", { textContent: `${f.name} · ${f.shots}` })]);
      list.append(b);
    });
    $("#formatNext").disabled = !S.format;
  }
  $("#formatNext").onclick = () => S.format && go("filter");

  /* ---------------- filter ---------------- */
  function enterFilter() {
    const list = $("#filterList"); list.innerHTML = "";
    C.filters.forEach((f, i) => {
      const b = el("button", { class: "filter" + (i === S.filterIdx ? " selected" : ""),
        onclick: () => { S.filterIdx = i; $$(".filter").forEach((x, j) => x.classList.toggle("selected", j === i)); } },
        [el("canvas", { width: 240, height: 180 }), el("span", { textContent: f.name })]);
      list.append(b);
    });
    if (S.camera !== "fail" || !S.uploads.length) startCamera();
    else camFail("");
  }
  $("#retryCam").onclick = async () => { S.camera = null; if (await startCamera()) toast("Camera on"); };
  $("#uploadInput").onchange = async (e) => {
    const files = [...e.target.files]; e.target.value = "";
    const imgs = await Promise.all(files.map((f) => new Promise((res) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = URL.createObjectURL(f);
    })));
    S.uploads.push(...imgs.filter(Boolean));
    if (S.uploads.length) { S.previewSrc = S.uploads[0]; frameN = 0; camFail(""); }
  };
  $("#filterNext").onclick = () => {
    if (S.camera === "ok") return go("capture");
    if (S.uploads.length) {
      const before = S.pool.length;
      S.uploads.forEach((img) => S.pool.push(makePhoto(img, false)));
      S.round = S.pool.slice(before, before + fmt().shots); S.freshRound = true;
      S.uploads = []; S.previewSrc = null;
      return go("favs");
    }
    toast("Allow the camera or upload photos to continue");
  };

  /* ---------------- capture ---------------- */
  function enterCapture() {
    S.round = [];
    $("#shutterBtn").hidden = false; $("#countdown").hidden = true;
    updateCaptureUI();
    if (!S.stream) startCamera().then((ok) => !ok && go("filter"));
  }
  function updateCaptureUI() {
    const n = fmt().shots, left = n - S.round.length;
    $("#leftCount").textContent = `${left} picture${left === 1 ? "" : "s"} left`;
    const box = $("#roundThumbs"); box.innerHTML = "";
    box.style.gridTemplateColumns = n === 1 ? "1fr" : "1fr 1fr";
    for (let i = 0; i < n; i++) {
      const p = S.round[i];
      box.append(el("div", { class: "slot" }, p ? el("img", { src: p.thumb, alt: `Photo ${i + 1}` }) : null));
    }
  }
  async function countdown(sec) {
    const cd = $("#countdown"); cd.hidden = false;
    for (let s = sec; s > 0; s--) {
      if (S.screen !== "capture") break;
      cd.textContent = s; cd.classList.remove("tick"); void cd.offsetWidth; cd.classList.add("tick");
      await sleep(1000);
    }
    cd.hidden = true;
  }
  function flash() { const f = $("#flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
  $("#shutterBtn").onclick = async () => {
    if (S.shooting || !S.stream) return;
    S.shooting = true; $("#shutterBtn").hidden = true; $("#backBtn").disabled = true;
    S.round = []; updateCaptureUI();
    const n = fmt().shots;
    for (let i = 0; i < n; i++) {
      await countdown(C.countdown);
      if (S.screen !== "capture") break;
      flash();
      const p = makePhoto(video, true);
      S.round.push(p); S.pool.push(p); updateCaptureUI();
      if (i < n - 1) await sleep(C.pauseBetweenShots);
    }
    S.date = new Date(); S.freshRound = true;
    await sleep(700);
    S.shooting = false; $("#backBtn").disabled = false;
    if (S.screen === "capture") go("favs");
  };

  /* ---------------- favourites ---------------- */
  function enterFavs() {
    const n = fmt().shots;
    // newest round is pre-selected, but every photo from every round is on the side to choose from
    if (S.freshRound && S.round.length) S.picked = S.round.slice(0, n);
    S.freshRound = false;
    S.picked = S.picked.filter((p) => S.pool.includes(p)).slice(0, n);
    if (!S.picked.length) S.picked = S.pool.slice(-n);
    renderFavs();
  }
  function renderFavs() {
    const n = fmt().shots;
    renderSmall($("#favCanvas"), S.picked);
    $("#favCount").textContent = `${S.picked.length}/${n}`;
    $("#favNext").disabled = S.picked.length !== n;
    const pool = $("#pool"); pool.innerHTML = "";
    S.pool.forEach((p) => {
      const idx = S.picked.indexOf(p);
      pool.append(el("button", { class: idx >= 0 ? "on" : "", onclick: () => {
        if (idx >= 0) S.picked.splice(idx, 1);
        else if (S.picked.length < n) S.picked.push(p);
        else toast(`You can pick ${n}. Tap one to remove it first.`);
        renderFavs();
      } }, [el("img", { src: p.thumb, alt: "" }), idx >= 0 ? el("span", { class: "badge", textContent: idx + 1 }) : null]));
    });
    if (S.pool.length < n) toast(`You need ${n} photos. Take more to fill the frame.`);
  }
  $("#favMore").onclick = () => go(S.camera === "ok" ? "capture" : "filter");
  $("#favNext").onclick = () => { S.stickers = []; S.strokes = []; S.selected = null; S.step = "frame"; go("studio"); };

  /* ---------------- studio ---------------- */
  const studio = $("#studioCanvas");
  const sctx = studio.getContext("2d");
  let base = null, doodle = null, dctx = null;
  const unit = () => Math.min(fmt().width, fmt().height) / 1200;

  async function enterStudio() {
    const f = fmt();
    studio.width = f.width; studio.height = f.height;
    base = el("canvas", { width: f.width, height: f.height });
    if (!doodle || doodle.width !== f.width || doodle.height !== f.height || !S.strokes.length) {
      doodle = el("canvas", { width: f.width, height: f.height }); dctx = doodle.getContext("2d");
    }
    try { await document.fonts.load(`${C.message.weight} 64px "${C.message.font}"`); } catch (e) {}
    buildFramePanel(); buildDecoPanel();
    await rebuildBase();
    setStep(S.step);
  }
  async function rebuildBase() {
    const f = fmt();
    let themeImg = null;
    if (S.theme?.frames[f.id]) { try { themeImg = await loadImg(S.theme.frames[f.id]); } catch (e) { toast(e.message); } }
    const bctx = base.getContext("2d", { willReadFrequently: true });
    drawLayout(bctx, f, S.picked, S.frameColour, themeImg);
    const px = bctx.getImageData(Math.round(f.width / 2), Math.round(f.height - C.footerHeight / 2), 1, 1).data;
    S.textColour = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2] > 150 ? "#111111" : "#ffffff";
    draw();
  }
  function drawText(ctx) {
    const f = fmt(), FH = C.footerHeight, top = f.height - FH, cx = f.width / 2;
    const msg = S.message.trim(), date = S.showDate ? fmtDate(S.date) : "";
    if (!msg && !date) return;
    const k = Math.min(f.width / 1200, 1.6);
    ctx.save(); ctx.fillStyle = S.textColour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const fit = (txt, size, weight) => {
      let s = size; ctx.font = `${weight} ${s}px "${C.message.font}", sans-serif`;
      while (ctx.measureText(txt).width > f.width - 200 && s > 20) { s -= 2; ctx.font = `${weight} ${s}px "${C.message.font}", sans-serif`; }
    };
    if (msg) { fit(msg, 44 * k, C.message.weight); ctx.fillText(msg, cx, top + FH * (date ? 0.42 : 0.5)); }
    if (date) { fit(date, 24 * k, 500); ctx.globalAlpha = 0.85; ctx.fillText(date, cx, top + FH * (msg ? 0.66 : 0.5)); }
    ctx.restore();
  }
  function handleSize() { const r = studio.getBoundingClientRect(); return r.width ? 13 * studio.width / r.width : 30; }
  function drawSticker(ctx, s) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h); ctx.restore();
  }
  function stickerHandles(s) {
    const pad = handleSize() * 0.6, hw = s.w / 2 + pad, hh = s.h / 2 + pad;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const w = (lx, ly) => ({ x: s.x + lx * c - ly * sn, y: s.y + lx * sn + ly * c });
    return { corners: [w(-hw, -hh), w(hw, -hh), w(hw, hh), w(-hw, hh)], del: w(hw, -hh), rot: w(hw, hh) };
  }
  function draw(exporting = false) {
    const f = fmt();
    sctx.clearRect(0, 0, f.width, f.height);
    sctx.drawImage(base, 0, 0);
    drawText(sctx);
    sctx.drawImage(doodle, 0, 0);
    S.stickers.forEach((s) => drawSticker(sctx, s));
    const s = S.selected;
    if (!exporting && s && S.step === "decorate") {
      const h = stickerHandles(s), hs = handleSize();
      sctx.save(); sctx.lineWidth = hs / 5; sctx.strokeStyle = "#111"; sctx.setLineDash([hs * 0.6, hs * 0.4]);
      sctx.beginPath(); h.corners.forEach((p, i) => (i ? sctx.lineTo(p.x, p.y) : sctx.moveTo(p.x, p.y))); sctx.closePath(); sctx.stroke();
      sctx.setLineDash([]);
      const knob = (p, fill, glyph) => {
        sctx.fillStyle = fill; sctx.beginPath(); sctx.arc(p.x, p.y, hs, 0, Math.PI * 2); sctx.fill();
        sctx.strokeStyle = "#fff"; sctx.lineWidth = hs / 6; sctx.stroke();
        sctx.fillStyle = "#fff"; sctx.font = `700 ${hs * 1.3}px sans-serif`; sctx.textAlign = "center"; sctx.textBaseline = "middle";
        sctx.fillText(glyph, p.x, p.y + hs * 0.05);
      };
      knob(h.del, "#e8365d", "×"); knob(h.rot, "#111", "↻");
      sctx.restore();
    }
  }

  /* steps */
  const STEP_ORDER = ["frame", "decorate", "message", "finish"];
  function setStep(step) {
    S.step = step;
    $$(".panel").forEach((p) => (p.hidden = p.dataset.step !== step));
    $("#studioNext").parentElement.hidden = step === "finish";
    studio.style.cursor = step === "decorate" ? (S.decoTab === "doodle" ? "crosshair" : "grab") : "default";
    if (step !== "decorate") S.selected = null;
    if (step === "finish") prepareShare();
    draw();
  }
  $("#studioNext").onclick = () => setStep(STEP_ORDER[STEP_ORDER.indexOf(S.step) + 1]);

  /* frame panel */
  function buildFramePanel() {
    const f = fmt();
    const packs = C.themePacks.map((p) => ({ ...p, themes: p.themes.filter((t) => t.frames[f.id]) })).filter((p) => p.themes.length);
    const tabs = $("#frameTabs"), body = $("#frameBody"); tabs.innerHTML = "";
    const show = (i) => {
      $$("#frameTabs .tab").forEach((t, j) => t.classList.toggle("active", j === i));
      body.innerHTML = "";
      if (i === 0) {
        const sw = el("div", { class: "swatches" });
        C.frameColours.forEach((c) => sw.append(el("button", { class: "swatch" + (c === S.frameColour ? " selected" : ""), style: `background:${c}`, title: c,
          onclick: (e) => { S.frameColour = c; $$(".swatch").forEach((x) => x.classList.remove("selected")); e.currentTarget.classList.add("selected"); rebuildBase(); } })));
        const custom = el("input", { type: "color", value: S.frameColour, style: "width:100%;height:36px;border:1px solid #ddd;padding:2px;background:#fff",
          oninput: (e) => { S.frameColour = e.target.value; $$(".swatch").forEach((x) => x.classList.remove("selected")); rebuildBase(); } });
        body.append(sw, el("p", { class: "label", textContent: "Custom colour" }), custom);
      } else {
        const grid = el("div", { class: "themes" });
        grid.append(el("button", { class: "theme none" + (!S.theme ? " selected" : ""), textContent: "No theme",
          onclick: () => { S.theme = null; show(i); rebuildBase(); } }));
        packs[i - 1].themes.forEach((t) => grid.append(el("button", { class: "theme" + (S.theme === t ? " selected" : ""),
          onclick: () => { S.theme = t; show(i); rebuildBase(); } },
          [el("img", { src: t.frames[f.id], alt: "", loading: "lazy", style: `background:${S.frameColour}` }), el("span", { textContent: t.name })])));
        body.append(grid);
      }
    };
    ["Colours", ...packs.map((p) => p.name)].forEach((name, i) => tabs.append(el("button", { class: "tab", textContent: name, onclick: () => show(i) })));
    show(0);
  }

  /* decorate panel */
  function buildDecoPanel() {
    $$("#decoTabs .tab").forEach((t) => (t.onclick = () => {
      S.decoTab = t.dataset.tab;
      $$("#decoTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
      $("#stickerBody").hidden = S.decoTab !== "stickers"; $("#doodleBody").hidden = S.decoTab !== "doodle";
      S.selected = null; setStep("decorate");
    }));
    // stickers
    const ptabs = $("#stickerPackTabs"); ptabs.innerHTML = "";
    const showPack = (i) => {
      $$("#stickerPackTabs .tab").forEach((t, j) => t.classList.toggle("active", j === i));
      const g = $("#stickerGrid"); g.innerHTML = "";
      C.stickerPacks[i].stickers.forEach((src) => g.append(el("button", { onclick: () => addSticker(src) }, el("img", { src, alt: "", loading: "lazy" }))));
    };
    C.stickerPacks.forEach((p, i) => ptabs.append(el("button", { class: "tab", textContent: p.name, onclick: () => showPack(i) })));
    showPack(0);
    // pens
    const pc = $("#penColours"); pc.innerHTML = "";
    C.pens.colours.forEach((c) => pc.append(el("button", { class: "swatch" + (c === S.pen.colour ? " selected" : ""), style: `background:${c}`,
      onclick: (e) => { S.pen.colour = c; $$("#penColours .swatch").forEach((x) => x.classList.remove("selected")); e.currentTarget.classList.add("selected"); } })));
    const ps = $("#penSizes"); ps.innerHTML = "";
    C.pens.sizes.forEach((sz, i) => ps.append(el("button", { class: "size" + (sz === S.pen.size ? " selected" : ""), title: `Size ${i + 1}`,
      onclick: (e) => { S.pen.size = sz; $$("#penSizes .size").forEach((x) => x.classList.remove("selected")); e.currentTarget.classList.add("selected"); } },
      el("i", { style: `width:${6 + i * 6}px;height:${6 + i * 6}px` }))));
    const pb = $("#penBrushes"); pb.innerHTML = "";
    const brushes = [{ id: "pen", name: "Pen" }, ...C.pens.brushes.map((b) => ({ id: b.src, name: b.name, src: b.src, tint: b.tint })), { id: "eraser", name: "Eraser" }];
    brushes.forEach((b) => pb.append(el("button", { class: "brush" + (S.pen.brush === b.id ? " selected" : ""), title: b.name,
      onclick: (e) => { S.pen.brush = b.id; $$("#penBrushes .brush").forEach((x) => x.classList.remove("selected")); e.currentTarget.classList.add("selected"); } },
      b.src ? [el("img", { src: b.src, alt: "", class: b.tint === false ? "" : "tintable" }), b.name] : b.name)));
  }
  async function addSticker(src) {
    try {
      const img = await loadImg(src), f = fmt();
      const w = Math.min(f.width, f.height) * (C.stickerSize || 0.22);
      const s = { img, w, h: w * img.naturalHeight / img.naturalWidth, rot: (Math.random() - 0.5) * 0.3,
        x: f.width / 2 + (Math.random() - 0.5) * f.width * 0.3, y: f.height / 2 + (Math.random() - 0.5) * f.height * 0.2 };
      S.stickers.push(s); S.selected = s; draw();
    } catch (e) { toast(e.message); }
  }

  /* doodle drawing */
  const tintCache = {};
  async function tinted(src, colour) {
    const key = src + colour;
    if (!tintCache[key]) {
      const img = await loadImg(src);
      const c = el("canvas", { width: img.naturalWidth, height: img.naturalHeight }), x = c.getContext("2d");
      x.drawImage(img, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = colour; x.fillRect(0, 0, c.width, c.height);
      tintCache[key] = c;
    }
    return tintCache[key];
  }
  function strokeSegment(st, a, b) {
    const ctx = dctx;
    if (st.kind === "stamp") {
      if (!st.stampImg) return;
      const size = Math.max(40 * unit(), st.size * 4.5) * (st.scale || 1), gap = Math.max(2, size * (st.spacing || 1.4));
      st.seed = st.seed || 1;
      const stamp = (x, y) => {
        if (!st.jitter) return ctx.drawImage(st.stampImg, x - size / 2, y - size / 2, size, size);
        st.seed = (st.seed * 9301 + 49297) % 233280; // repeatable randomness so undo replays the same
        ctx.save(); ctx.translate(x, y); ctx.rotate((st.seed / 233280 - 0.5) * Math.PI * 2 * st.jitter);
        ctx.drawImage(st.stampImg, -size / 2, -size / 2, size, size); ctx.restore();
      };
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      let t = st.carry ?? gap;
      if (len === 0 && t >= gap) { stamp(b.x, b.y); st.carry = 0; return; }
      while (t <= len) {
        const px = a.x + dx * t / len, py = a.y + dy * t / len;
        stamp(px, py);
        t += gap;
      }
      st.carry = t - len;
      return;
    }
    ctx.save();
    if (st.kind === "eraser") ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = st.colour; ctx.fillStyle = st.colour;
    ctx.lineWidth = st.kind === "eraser" ? st.size * 2.5 : st.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (a === b) { ctx.beginPath(); ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
  }
  function replayStrokes() {
    dctx.clearRect(0, 0, doodle.width, doodle.height);
    S.strokes.forEach((st) => { st.carry = undefined; st.seed = 1; st.pts.forEach((p, i) => strokeSegment(st, i ? st.pts[i - 1] : p, p)); });
    draw();
  }
  $("#undoBtn").onclick = () => { S.strokes.pop(); replayStrokes(); };
  $("#clearBtn").onclick = () => { S.strokes = []; replayStrokes(); };

  /* pointer interaction */
  const toCanvas = (e) => {
    const r = studio.getBoundingClientRect();
    return { x: (e.clientX - r.left) * studio.width / r.width, y: (e.clientY - r.top) * studio.height / r.height };
  };
  function inSticker(p, s) {
    const dx = p.x - s.x, dy = p.y - s.y, c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
    return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
  }
  let drag = null;
  studio.addEventListener("pointerdown", async (e) => {
    if (S.step !== "decorate") return;
    const p = toCanvas(e); studio.setPointerCapture(e.pointerId);
    if (S.decoTab === "doodle") {
      const isStamp = S.pen.brush !== "pen" && S.pen.brush !== "eraser";
      const st = { kind: isStamp ? "stamp" : S.pen.brush, colour: S.pen.colour, size: S.pen.size * unit(), pts: [p] };
      if (isStamp) {
        const b = C.pens.brushes.find((x) => x.src === S.pen.brush) || {};
        Object.assign(st, { src: b.src, spacing: b.spacing ?? 1.4, scale: b.scale ?? 1, jitter: b.jitter || 0 });
        try { st.stampImg = b.tint === false ? await loadImg(b.src) : await tinted(b.src, st.colour); }
        catch (err) { toast("Couldn't load brush " + b.src); S.strokes.pop(); return; }
      }
      S.strokes.push(st); strokeSegment(st, p, p); draw();
      drag = { type: "draw", st };
      return;
    }
    const hs = handleSize() * 1.4, sel = S.selected;
    if (sel) {
      const h = stickerHandles(sel);
      if (Math.hypot(p.x - h.del.x, p.y - h.del.y) < hs) { S.stickers.splice(S.stickers.indexOf(sel), 1); S.selected = null; draw(); return; }
      if (Math.hypot(p.x - h.rot.x, p.y - h.rot.y) < hs) {
        drag = { type: "transform", s: sel, a0: Math.atan2(p.y - sel.y, p.x - sel.x), d0: Math.hypot(p.x - sel.x, p.y - sel.y), w0: sel.w, h0: sel.h, r0: sel.rot };
        return;
      }
    }
    for (let i = S.stickers.length - 1; i >= 0; i--) {
      const s = S.stickers[i];
      if (inSticker(p, s)) {
        S.stickers.splice(i, 1); S.stickers.push(s); S.selected = s;
        drag = { type: "move", s, ox: p.x - s.x, oy: p.y - s.y }; studio.style.cursor = "grabbing"; draw(); return;
      }
    }
    S.selected = null; draw();
  });
  studio.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = toCanvas(e);
    if (drag.type === "draw") { const st = drag.st, last = st.pts.at(-1); st.pts.push(p); strokeSegment(st, last, p); draw(); }
    else if (drag.type === "move") { drag.s.x = p.x - drag.ox; drag.s.y = p.y - drag.oy; draw(); }
    else if (drag.type === "transform") {
      const s = drag.s, k = Math.max(0.15, Math.hypot(p.x - s.x, p.y - s.y) / drag.d0);
      s.w = drag.w0 * k; s.h = drag.h0 * k; s.rot = drag.r0 + Math.atan2(p.y - s.y, p.x - s.x) - drag.a0; draw();
    }
  });
  const endDrag = () => { drag = null; if (S.step === "decorate" && S.decoTab === "stickers") studio.style.cursor = "grab"; };
  studio.addEventListener("pointerup", endDrag);
  studio.addEventListener("pointercancel", endDrag);

  /* message */
  $("#dateToggle").checked = S.showDate;
  $("#messageIn").maxLength = C.message.maxLength || 60;
  $("#messageIn").oninput = (e) => { S.message = e.target.value; draw(); };
  $("#dateToggle").onchange = (e) => { S.showDate = e.target.checked; draw(); };

  /* ---------------- export, download, share ---------------- */
  function exportBlob(type = "image/png", q) {
    draw(true);
    return new Promise((res) => studio.toBlob((b) => { draw(); res(b); }, type, q));
  }
  const fileName = (ext) => `owon-booth-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
  function downloadBlob(blob, name) {
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function shareBlob(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    try { await navigator.share({ files: [file], title: "OWON Booth" }); }
    catch (e) { if (e.name !== "AbortError") toast("Sharing isn't available, try Download"); }
  }
  function canShareFiles() {
    try { return !!navigator.canShare?.({ files: [new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" })] }); }
    catch (e) { return false; }
  }
  function prepareShare() { $("#shareBtn").hidden = !canShareFiles(); }
  $("#downloadBtn").onclick = async () => downloadBlob(await exportBlob(), fileName("png"));
  $("#shareBtn").onclick = async () => shareBlob(await exportBlob(), fileName("png"));
  $("#saveRollBtn").onclick = async () => {
    try {
      const blob = await exportBlob("image/jpeg", 0.92);
      navigator.storage?.persist?.().catch(() => {});
      await DB.put({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), created: Date.now(), format: fmt().id, blob });
      toast("Saved to your roll ✓"); updateRollCount();
    } catch (e) { toast("Couldn't save to the roll in this browser"); }
  };
  $("#againBtn").onclick = () => { S.pool = []; S.round = []; S.picked = []; S.stickers = []; S.strokes = []; S.message = ""; $("#messageIn").value = ""; S.step = "frame"; go("format"); };

  /* ---------------- roll (IndexedDB, this browser only) ---------------- */
  const DB = {
    db: null,
    open() {
      if (this.db) return this.db;
      this.db = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("no idb"));
        const r = indexedDB.open("owon-booth", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("roll", { keyPath: "id" });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      this.db.catch(() => (this.db = null));
      return this.db;
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction("roll", mode), req = fn(t.objectStore("roll"));
        t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    put(item) { return this.run("readwrite", (s) => s.put(item)); },
    all() { return this.run("readonly", (s) => s.getAll()); },
    del(id) { return this.run("readwrite", (s) => s.delete(id)); },
  };
  let rollUrls = [];
  async function updateRollCount() {
    try { const n = (await DB.all()).length; $("#rollCount").textContent = n || ""; } catch (e) {}
  }
  async function renderRoll() {
    rollUrls.forEach(URL.revokeObjectURL); rollUrls = [];
    const grid = $("#rollGrid"); grid.innerHTML = "";
    let items = [];
    try { items = (await DB.all()).sort((a, b) => b.created - a.created); }
    catch (e) { $("#rollEmpty").textContent = "Your browser isn't letting this site store photos (private mode?)."; }
    $("#rollEmpty").hidden = items.length > 0;
    items.forEach((it) => {
      const url = URL.createObjectURL(it.blob); rollUrls.push(url);
      grid.append(el("button", { onclick: () => openModal(it, url) },
        [el("img", { src: url, alt: "Saved strip", loading: "lazy" }), el("span", { textContent: fmtDate(new Date(it.created)) })]));
    });
    $("#rollCount").textContent = items.length || "";
  }
  let modalItem = null;
  function openModal(it, url) {
    modalItem = it; $("#modalImg").src = url; $("#modalDate").textContent = fmtDate(new Date(it.created));
    $("#modalShare").hidden = !canShareFiles(); $("#modal").hidden = false;
  }
  const closeModal = () => { $("#modal").hidden = true; modalItem = null; };
  $("#modalClose").onclick = closeModal;
  $("#modal").onclick = (e) => e.target.id === "modal" && closeModal();
  $("#modalDownload").onclick = () => modalItem && downloadBlob(modalItem.blob, `owon-booth-${modalItem.id}.jpg`);
  $("#modalShare").onclick = () => modalItem && shareBlob(modalItem.blob, `owon-booth-${modalItem.id}.jpg`);
  $("#modalDelete").onclick = async () => { if (!modalItem) return; await DB.del(modalItem.id); closeModal(); renderRoll(); toast("Deleted"); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal").hidden) closeModal();
    if ((e.key === "Delete" || e.key === "Backspace") && S.selected && S.step === "decorate" && document.activeElement.tagName !== "INPUT") {
      S.stickers.splice(S.stickers.indexOf(S.selected), 1); S.selected = null; draw();
    }
  });

  /* ---------------- boot ---------------- */
  window.addEventListener("resize", () => S.screen === "studio" && draw());
  updateRollCount();
  go("intro");
  requestAnimationFrame(loop);
})();

const STORAGE_KEYS = {
  teams: "kickoffhub_teams_v1",
  requests: "kickoffhub_match_requests_v1",
  tournaments: "kickoffhub_tournament_entries_v1",
  fixtures: "kickoffhub_fixtures_v1",
  tts: "kickoffhub_tts_v1",
  presence: "kickoffhub_presence_v1",
  deviceId: "kickoffhub_device_id_v1",
  videos: "kickoffhub_videos_v1",
  commentsLocal: "kickoffhub_comments_local_v1",
  lang: "kickoffhub_lang_v1",
  donate: "kickoffhub_donate_v1",
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now().toString(16)}_${rand}`;
}

function getDeviceId() {
  // Stable per browser profile, shared across tabs.
  let id = localStorage.getItem(STORAGE_KEYS.deviceId);
  if (!id) {
    id = uid("device");
    localStorage.setItem(STORAGE_KEYS.deviceId, id);
  }
  return id;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toast(title, copy) {
  let el = document.querySelector("[data-toast]");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("data-toast", "");
    el.innerHTML = `<p class="toast-title"></p><p class="toast-copy"></p>`;
    document.body.appendChild(el);
  }

  el.querySelector(".toast-title").textContent = title;
  el.querySelector(".toast-copy").textContent = copy || "";
  el.classList.add("show");
  window.clearTimeout(el.__t);
  el.__t = window.setTimeout(() => el.classList.remove("show"), 3200);
}

function setupTts() {
  // Bottom read-aloud bar removed. Use the Read Aloud tab (read-aloud.html) instead.
  return;
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  if (!supported) return;

  const saved = readJson(STORAGE_KEYS.tts, {
    voiceURI: "",
    preset: "happy",
    lang: "en-GB",
    rate: 1,
    pitch: 1,
  });

  const bar = document.createElement("div");
  bar.className = "tts-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Read aloud controls");
  bar.innerHTML = `
    <button class="btn btn-secondary tts-btn" type="button" data-tts-play>Read aloud</button>
    <button class="btn btn-ghost tts-btn" type="button" data-tts-stop>Stop</button>
    <label class="tts-label">
      Style
      <select class="tts-select" data-tts-preset aria-label="Select voice style">
        <option value="human">Human</option>
        <option value="happy">Happy</option>
        <option value="warm">Warm</option>
        <option value="deep">Deep</option>
        <option value="bright">Bright</option>
        <option value="robot">Robot</option>
      </select>
    </label>
    <label class="tts-label">
      Accent
      <select class="tts-select" data-tts-lang aria-label="Select accent">
        <option value="en-GB">English (UK)</option>
        <option value="en-US">English (US)</option>
      </select>
    </label>
    <label class="tts-label">
      Voice
      <select class="tts-select" data-tts-voice aria-label="Select voice"></select>
    </label>
    <label class="tts-label">
      Speed
      <input class="tts-range" data-tts-rate type="range" min="0.7" max="1.2" step="0.05" />
    </label>
  `;

  document.body.appendChild(bar);

  const playBtn = bar.querySelector("[data-tts-play]");
  const stopBtn = bar.querySelector("[data-tts-stop]");
  const presetSel = bar.querySelector("[data-tts-preset]");
  const langSel = bar.querySelector("[data-tts-lang]");
  const voiceSel = bar.querySelector("[data-tts-voice]");
  const rateRange = bar.querySelector("[data-tts-rate]");

  presetSel.value = saved.preset || "happy";
  langSel.value = saved.lang || "en-GB";
  rateRange.value = String(Math.min(1.2, Math.max(0.7, Number(saved.rate) || 1)));

  const PRESETS = {
    human: {
      label: "Human",
      pitch: 1.02,
      rate: 0.96,
      prefer: [
        "enhanced",
        "premium",
        "natural",
        "siri",
        "daniel",
        "oliver",
        "alex",
        "samantha",
        "victoria",
        "google",
        "microsoft",
      ],
      avoid: ["fred", "robot"],
    },
    happy: {
      label: "Happy",
      // Slightly brighter prosody to feel more cheerful, without sounding cartoonish.
      pitch: 1.26,
      rate: 1.12,
      prefer: [
        "siri",
        "enhanced",
        "premium",
        "natural",
        "samantha",
        "victoria",
        "karen",
        "oliver",
        "daniel",
        "google",
        "microsoft",
      ],
    },
    warm: {
      label: "Warm",
      pitch: 1.0,
      rate: 0.98,
      prefer: ["siri", "enhanced", "premium", "natural", "samantha", "victoria", "daniel", "oliver"],
    },
    deep: {
      label: "Deep",
      pitch: 0.82,
      rate: 0.92,
      prefer: ["daniel", "oliver", "alex", "microsoft", "google"],
    },
    bright: {
      label: "Bright",
      pitch: 1.12,
      rate: 1.06,
      prefer: ["samantha", "victoria", "karen", "zira", "google", "microsoft"],
    },
    robot: {
      label: "Robot",
      pitch: 0.68,
      rate: 1.1,
      prefer: ["fred", "robot", "microsoft", "google"],
    },
  };

  function humanizeText(text) {
    // Replace UI separators and excessive whitespace so it reads more naturally.
    return String(text || "")
      .split(" · ")
      .join(", ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getSpeakText() {
    const main = document.querySelector("main");
    const raw = (main?.innerText || document.body.innerText || "").trim();
    // Avoid reading nav/footer repeatedly; main usually contains the page content.
    const chosen = raw.length > 20 ? raw : (document.body.innerText || "").trim();
    return humanizeText(chosen);
  }

  function langMatches(voice, lang) {
    const vLang = String(voice.lang || "").toLowerCase();
    const want = String(lang || "").toLowerCase();
    if (!want) return true;
    if (want === "en-us") return vLang.startsWith("en-us") || vLang === "en-us";
    if (want === "en-gb") return vLang.startsWith("en-gb") || vLang === "en-gb" || vLang === "en";
    return vLang.startsWith(want);
  }

  function getVoices() {
    const voices = window.speechSynthesis.getVoices() || [];
    // Prefer English voices first, then keep the full list.
    const en = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("en"));
    const other = voices.filter((v) => !String(v.lang || "").toLowerCase().startsWith("en"));
    return [...en, ...other];
  }

  function pickVoiceByPreset(voices, presetKey, lang) {
    const preset = PRESETS[presetKey] || PRESETS.human;
    const en = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("en"));
    const pool = en.filter((v) => langMatches(v, lang));
    let candidates = pool.length ? pool : en;
    if (!candidates.length) return null;

    if (Array.isArray(preset.avoid) && preset.avoid.length) {
      const filtered = candidates.filter((v) => {
        const name = String(v.name || "").toLowerCase();
        return !preset.avoid.some((bad) => name.includes(String(bad).toLowerCase()));
      });
      if (filtered.length) candidates = filtered;
    }

    for (const snippet of preset.prefer) {
      const hit = candidates.find((v) => String(v.name || "").toLowerCase().includes(snippet));
      if (hit) return hit;
    }
    return candidates[0];
  }

  function fillVoices() {
    const voices = getVoices();
    voiceSel.innerHTML = "";
    const optAuto = document.createElement("option");
    optAuto.value = "";
    optAuto.textContent = "Auto (recommended)";
    voiceSel.appendChild(optAuto);

    for (const v of voices) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      const name = v.name || "Voice";
      const lang = v.lang ? ` · ${v.lang}` : "";
      opt.textContent = `${name}${lang}`;
      voiceSel.appendChild(opt);
    }

    // Restore selection if possible; otherwise keep Auto.
    if (saved.voiceURI) voiceSel.value = saved.voiceURI;
  }

  function savePrefs() {
    writeJson(STORAGE_KEYS.tts, {
      voiceURI: voiceSel.value || "",
      preset: presetSel.value || "happy",
      lang: langSel.value || "en-GB",
      rate: Number(rateRange.value) || 1,
      pitch: 1,
    });
  }

  presetSel.addEventListener("change", () => {
    const preset = PRESETS[presetSel.value] || PRESETS.human;
    // Nudge settings toward the preset (user can still override speed).
    rateRange.value = String(preset.rate);
    saved.rate = preset.rate;
    saved.preset = presetSel.value;
    savePrefs();
    toast("Style updated", `Style set to ${preset.label}.`);
  });

  langSel.addEventListener("change", () => {
    saved.lang = langSel.value || "en-GB";
    savePrefs();
    toast("Accent updated", "This changes which English voices are preferred.");
  });

  voiceSel.addEventListener("change", () => {
    saved.voiceURI = voiceSel.value || "";
    savePrefs();
    toast("Voice updated", "If you leave Voice on Auto, the site picks a different English voice based on Style.");
  });

  rateRange.addEventListener("input", () => {
    saved.rate = Number(rateRange.value) || 1;
    savePrefs();
  });

  function speak() {
    const text = getSpeakText();
    if (!text) {
      toast("Nothing to read", "This page has no readable text.");
      return;
    }

    // Cancel any current speech and start fresh.
    window.speechSynthesis.cancel();

    const preset = PRESETS[presetSel.value] || PRESETS.human;
    const lang = langSel.value || "en-GB";
    const voices = getVoices();
    const chosenVoice = voiceSel.value
      ? voices.find((v) => v.voiceURI === voiceSel.value) || null
      : pickVoiceByPreset(voices, presetSel.value, lang);

    // Chunking improves pauses and reduces the "robotic paragraph" feel.
    const chunks = text
      .split(/\n{2,}/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .flatMap((t) => {
        if (t.length <= 900) return [t];
        const parts = [];
        for (let i = 0; i < t.length; i += 900) parts.push(t.slice(i, i + 900));
        return parts;
      });

    let idx = 0;
    playBtn.textContent = "Reading...";
    playBtn.disabled = true;

    const speakNext = () => {
      if (idx >= chunks.length) {
        playBtn.textContent = "Read aloud";
        playBtn.disabled = false;
        return;
      }
      const utter = new SpeechSynthesisUtterance(chunks[idx]);
      utter.rate = Number(rateRange.value) || preset.rate;
      utter.pitch = preset.pitch;
      utter.lang = lang;
      if (chosenVoice) utter.voice = chosenVoice;
      utter.onend = () => {
        idx += 1;
        speakNext();
      };
      utter.onerror = () => {
        playBtn.textContent = "Read aloud";
        playBtn.disabled = false;
        toast("Read aloud failed", "Your browser blocked speech, or no voice is available.");
      };
      window.speechSynthesis.speak(utter);
    };

    speakNext();
  }

  function stop() {
    window.speechSynthesis.cancel();
    playBtn.textContent = "Read aloud";
    playBtn.disabled = false;
  }

  playBtn.addEventListener("click", speak);
  stopBtn.addEventListener("click", stop);

  // Voices can load asynchronously in some browsers.
  fillVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => {
      fillVoices();
    };
  }
}

function onReadAloudPage() {
  const form = document.querySelector("[data-read-aloud-form]");
  if (!form) return;

  document.body.classList.add("tts-page");

  const supported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  if (!supported) {
    toast("Not supported", "Your browser does not support read aloud.");
    return;
  }

  const presetSel = form.querySelector("[data-ra-preset]");
  const langSel = form.querySelector("[data-ra-lang]");
  const voiceSel = form.querySelector("[data-ra-voice]");
  const rateRange = form.querySelector("[data-ra-rate]");
  const textEl = form.querySelector("[data-ra-text]");
  const playBtn = form.querySelector("[data-ra-play]");
  const stopBtn = form.querySelector("[data-ra-stop]");

  const saved = readJson(STORAGE_KEYS.tts, { voiceURI: "", preset: "happy", lang: "en-GB", rate: 1, pitch: 1 });

  const PRESETS = {
    human: { label: "Human", pitch: 1.02, rate: 0.96, prefer: ["enhanced", "premium", "natural", "siri"] },
    happy: { label: "Happy", pitch: 1.26, rate: 1.12, prefer: ["siri", "enhanced", "premium", "natural"] },
    warm: { label: "Warm", pitch: 1.0, rate: 0.98, prefer: ["siri", "enhanced", "premium", "natural"] },
    deep: { label: "Deep", pitch: 0.82, rate: 0.92, prefer: ["daniel", "oliver", "alex"] },
    bright: { label: "Bright", pitch: 1.12, rate: 1.06, prefer: ["samantha", "victoria", "karen"] },
    robot: { label: "Robot", pitch: 0.68, rate: 1.1, prefer: ["fred", "robot"] },
  };

  function getVoices() {
    const voices = window.speechSynthesis.getVoices() || [];
    const en = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("en"));
    const other = voices.filter((v) => !String(v.lang || "").toLowerCase().startsWith("en"));
    return [...en, ...other];
  }

  function langMatches(voice, lang) {
    const vLang = String(voice.lang || "").toLowerCase();
    const want = String(lang || "").toLowerCase();
    if (!want) return true;
    if (want === "en-us") return vLang.startsWith("en-us") || vLang === "en-us";
    if (want === "en-gb") return vLang.startsWith("en-gb") || vLang === "en-gb" || vLang === "en";
    return vLang.startsWith(want);
  }

  function pickVoiceByPreset(voices, presetKey, lang) {
    const preset = PRESETS[presetKey] || PRESETS.happy;
    const en = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("en"));
    const pool = en.filter((v) => langMatches(v, lang));
    const candidates = pool.length ? pool : en;
    if (!candidates.length) return null;
    for (const snippet of preset.prefer) {
      const hit = candidates.find((v) => String(v.name || "").toLowerCase().includes(snippet));
      if (hit) return hit;
    }
    return candidates[0];
  }

  function fillVoices() {
    const voices = getVoices();
    voiceSel.innerHTML = "";
    const optAuto = document.createElement("option");
    optAuto.value = "";
    optAuto.textContent = "Auto (recommended)";
    voiceSel.appendChild(optAuto);
    for (const v of voices) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      const name = v.name || "Voice";
      const lang = v.lang ? ` · ${v.lang}` : "";
      opt.textContent = `${name}${lang}`;
      voiceSel.appendChild(opt);
    }
    if (saved.voiceURI) voiceSel.value = saved.voiceURI;
  }

  function savePrefs() {
    writeJson(STORAGE_KEYS.tts, {
      voiceURI: voiceSel.value || "",
      preset: presetSel.value || "happy",
      lang: langSel.value || "en-GB",
      rate: Number(rateRange.value) || 1,
      pitch: 1,
    });
  }

  function stop() {
    window.speechSynthesis.cancel();
    playBtn.disabled = false;
    playBtn.textContent = "Read aloud";
  }

  function speak() {
    const text = String(textEl?.value || "").trim();
    if (!text) {
      toast("Nothing to read", "Type some text first.");
      return;
    }

    stop();

    const preset = PRESETS[presetSel.value] || PRESETS.happy;
    const lang = langSel.value || "en-GB";
    const voices = getVoices();
    const chosenVoice = voiceSel.value
      ? voices.find((v) => v.voiceURI === voiceSel.value) || null
      : pickVoiceByPreset(voices, presetSel.value, lang);

    const chunks = text
      .split(/\n{2,}/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .flatMap((t) => {
        if (t.length <= 900) return [t];
        const parts = [];
        for (let i = 0; i < t.length; i += 900) parts.push(t.slice(i, i + 900));
        return parts;
      });

    let idx = 0;
    playBtn.textContent = "Reading...";
    playBtn.disabled = true;

    const speakNext = () => {
      if (idx >= chunks.length) {
        playBtn.textContent = "Read aloud";
        playBtn.disabled = false;
        return;
      }
      const utter = new SpeechSynthesisUtterance(chunks[idx]);
      utter.rate = Number(rateRange.value) || preset.rate;
      utter.pitch = preset.pitch;
      utter.lang = lang;
      if (chosenVoice) utter.voice = chosenVoice;
      utter.onend = () => {
        idx += 1;
        speakNext();
      };
      utter.onerror = () => {
        playBtn.textContent = "Read aloud";
        playBtn.disabled = false;
        toast("Read aloud failed", "Your browser blocked speech, or no voice is available.");
      };
      window.speechSynthesis.speak(utter);
    };

    speakNext();
  }

  presetSel.value = saved.preset || "happy";
  langSel.value = saved.lang || "en-GB";
  rateRange.value = String(Math.min(1.2, Math.max(0.7, Number(saved.rate) || 1)));

  fillVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => fillVoices();
  }

  presetSel.addEventListener("change", () => {
    const preset = PRESETS[presetSel.value] || PRESETS.happy;
    rateRange.value = String(preset.rate);
    savePrefs();
  });
  langSel.addEventListener("change", savePrefs);
  voiceSel.addEventListener("change", savePrefs);
  rateRange.addEventListener("input", savePrefs);

  playBtn.addEventListener("click", speak);
  stopBtn.addEventListener("click", stop);
}

function setupBackgroundLegend() {
  // Decorative background (kept subtle so text remains readable).
  if (document.querySelector("[data-bg-legend]")) return;

  const wrap = document.createElement("div");
  wrap.className = "bg-legend";
  wrap.setAttribute("aria-hidden", "true");
  wrap.setAttribute("data-bg-legend", "");
  wrap.innerHTML = `
    <svg viewBox="0 0 900 900" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="neo" x1="80" y1="140" x2="820" y2="780" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ff006b"/>
          <stop offset="0.22" stop-color="#ffb100"/>
          <stop offset="0.46" stop-color="#38ff91"/>
          <stop offset="0.7" stop-color="#00e2ff"/>
          <stop offset="0.92" stop-color="#8a2be2"/>
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 0.9 0" result="glow"/>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Stylized footballer silhouette + jersey number, as a neon line poster -->
      <g stroke="url(#neo)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.95">
        <!-- Head -->
        <path d="M520 240c0 78-63 141-141 141s-141-63-141-141 63-141 141-141 141 63 141 141Z"/>
        <!-- Hair + beard hints -->
        <path d="M262 240c32-56 92-92 158-92 51 0 98 22 130 58"/>
        <path d="M290 332c24 38 64 64 110 70 62 8 116-14 150-58"/>
        <!-- Neck/shoulders -->
        <path d="M322 420c-18 20-40 34-66 42"/>
        <path d="M438 420c18 20 40 34 66 42"/>
        <!-- Torso -->
        <path d="M215 720c22-160 120-250 245-250s223 90 245 250"/>
        <path d="M286 520c54 44 122 66 174 66 52 0 120-22 174-66"/>
        <!-- Arms -->
        <path d="M250 590c-58 30-104 82-132 150"/>
        <path d="M670 590c58 30 104 82 132 150"/>
        <!-- Ball -->
        <path d="M185 350c0 52-42 94-94 94S -3 402 -3 350s42-94 94-94 94 42 94 94Z" transform="translate(88 210)"/>
        <path d="M126 560l38 28-14 45h-48l-14-45 38-28Z"/>
        <path d="M112 633l-30 22M150 633l30 22M102 588l-38-28M160 588l38-28"/>
      </g>

      <!-- Text label -->
      <g opacity="0.65">
        <text x="520" y="650" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
          font-size="44" fill="none" stroke="url(#neo)" stroke-width="2" letter-spacing="8">MESSI</text>
        <text x="600" y="720" font-family="ui-serif, Georgia, serif"
          font-size="160" fill="none" stroke="url(#neo)" stroke-width="3" letter-spacing="6">10</text>
      </g>
    </svg>
  `;

  document.body.appendChild(wrap);
}

function setupPresenceCounter() {
  // With server.rb running, this shows how many devices are active on the LAN server.
  // Without it, we fall back to a device-local tab counter.
  const headerInner = document.querySelector(".site-header .header-inner");
  if (!headerInner) return;
  if (document.querySelector("[data-online-pill]")) return;

  const pill = document.createElement("div");
  pill.className = "online-pill";
  pill.setAttribute("data-online-pill", "");
  pill.setAttribute("title", "Online devices connected to this website server.");
  pill.innerHTML = `
    <span class="dot dot-green" aria-hidden="true"></span>
    <span class="online-label">Online:</span>
    <span class="online-count" data-online-count>1</span>
  `;

  headerInner.appendChild(pill);

  const countEl = pill.querySelector("[data-online-count]");

  const deviceId = getDeviceId();
  const STALE_MS = 12_000;
  const TICK_MS = 4_000;
  let mode = "unknown"; // "server" | "local"

  function readPresence() {
    const raw = readJson(STORAGE_KEYS.presence, {});
    return raw && typeof raw === "object" ? raw : {};
  }

  function writePresence(map) {
    writeJson(STORAGE_KEYS.presence, map);
  }

  function pruneAndCount(map, now) {
    const out = {};
    let count = 0;
    for (const [id, ts] of Object.entries(map)) {
      if (typeof ts !== "number") continue;
      if (now - ts <= STALE_MS) {
        out[id] = ts;
        count += 1;
      }
    }
    return { out, count };
  }

  function tick() {
    if (mode === "server") {
      pingServer();
      return;
    }
    const now = Date.now();
    const map = readPresence();
    // Fallback mode counts tabs (best effort). We still key by deviceId to reduce overcounting.
    map[deviceId] = now;
    const { out, count } = pruneAndCount(map, now);
    writePresence(out);
    countEl.textContent = String(Math.max(1, count));
  }

  function refreshFromStorage() {
    if (mode === "server") return;
    const now = Date.now();
    const map = readPresence();
    const { out, count } = pruneAndCount(map, now);
    // Avoid extra writes when just observing.
    countEl.textContent = String(Math.max(1, count));
    // Opportunistically prune sometimes.
    if (Object.keys(map).length !== Object.keys(out).length) writePresence(out);
  }

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEYS.presence) refreshFromStorage();
  });

  window.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });

  window.addEventListener("beforeunload", () => {
    // Best-effort cleanup (not guaranteed).
    if (mode === "server") return;
    const map = readPresence();
    delete map[deviceId];
    writePresence(map);
  });

  async function pingServer() {
    try {
      const res = await fetch(`/presence/ping?sid=${encodeURIComponent(deviceId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (!data || data.ok !== true || typeof data.online !== "number") throw new Error("bad payload");
      mode = "server";
      pill.setAttribute("title", "Online devices on your Wi-Fi (served by server.rb).");
      countEl.textContent = String(Math.max(1, data.online));
    } catch {
      // If the special endpoint isn't available, keep using local fallback.
      if (mode === "unknown") {
        mode = "local";
        pill.setAttribute(
          "title",
          "Device-local online count (no server endpoint found). Run ruby server.rb for LAN counting."
        );
      }
    }
  }

  // Start immediately and keep heartbeating.
  pingServer();
  tick();
  window.setInterval(tick, TICK_MS);
}

function setupLanguageSwitcher() {
  const headerInner = document.querySelector(".site-header .header-inner");
  if (!headerInner) return;
  if (document.querySelector("[data-lang-pill]")) return;

  const supported = {
    en: "English",
    ro: "Romana",
    es: "Espanol",
    fr: "Francais",
  };

  const pill = document.createElement("div");
  pill.className = "lang-pill";
  pill.setAttribute("data-lang-pill", "");
  pill.innerHTML = `
    <span class="lang-label" data-i18n="lang_label">Language</span>
    <select class="lang-select" data-lang-select aria-label="Language">
      ${Object.entries(supported)
        .map(([code, name]) => `<option value="${code}">${name}</option>`)
        .join("")}
    </select>
  `;
  headerInner.appendChild(pill);

  const select = pill.querySelector("[data-lang-select]");

  const I18N = {
    en: {
      lang_label: "Language",
      nav_team_signup: "Team Signup",
      nav_match_request: "Match Request",
      nav_browse: "Browse",
      nav_tournaments: "Tournaments",
      nav_live: "Live Games",
      nav_videos: "Videos",
      nav_comments: "Comments",
      nav_social: "Social",
      nav_search: "Search",
      nav_likes: "Likes",
      nav_donate: "Donate",
      nav_read_aloud: "Read Aloud",
      nav_about: "About Me",
      h_index: "Get your team playing more football.",
      h_team_signup: "Team signup",
      h_match_request: "Post a match request",
      h_browse: "Browse",
      h_tournaments: "Tournament entry",
      h_live: "Live games",
      h_videos: "Videos",
      h_comments: "Comments",
      h_social: "Social",
      h_search: "Football search",
      h_likes: "Likes",
      h_donate: "Donate",
      h_read_aloud: "Read aloud",
      h_about: "About me",
      btn_signup: "Sign up your team",
      btn_find_opponents: "Post a match request",
      btn_save_team: "Save team",
      btn_post_request: "Post request",
      btn_save_entry: "Save entry",
      btn_add_video: "Add video",
      btn_post_comment: "Post comment",
      btn_save_social: "Save socials",
      btn_search: "Search",
      ph_search: "Example: Lamine Yamal highlights",
      btn_save_donate: "Save donation links",
    },
    ro: {
      lang_label: "Limba",
      nav_team_signup: "Inscriere echipa",
      nav_match_request: "Cerere meci",
      nav_browse: "Cauta",
      nav_tournaments: "Turnee",
      nav_live: "Meciuri live",
      nav_videos: "Videoclipuri",
      nav_comments: "Comentarii",
      nav_social: "Social",
      nav_search: "Cauta",
      nav_likes: "Like-uri",
      nav_donate: "Doneaza",
      nav_read_aloud: "Citeste",
      nav_about: "Despre mine",
      h_index: "Fa ca echipa ta sa joace mai mult fotbal.",
      h_team_signup: "Inscriere echipa",
      h_match_request: "Publica o cerere de meci",
      h_browse: "Cauta",
      h_tournaments: "Inscriere la turneu",
      h_live: "Meciuri live",
      h_videos: "Videoclipuri",
      h_comments: "Comentarii",
      h_social: "Social",
      h_search: "Cautare fotbal",
      h_likes: "Like-uri",
      h_donate: "Doneaza",
      h_read_aloud: "Citire cu voce",
      h_about: "Despre mine",
      btn_signup: "Inscrie echipa",
      btn_find_opponents: "Cere un meci",
      btn_save_team: "Salveaza echipa",
      btn_post_request: "Publica cererea",
      btn_save_entry: "Salveaza",
      btn_add_video: "Adauga video",
      btn_post_comment: "Trimite comentariu",
      btn_save_social: "Salveaza",
      btn_search: "Cauta",
      ph_search: "Exemplu: Lamine Yamal highlights",
      btn_save_donate: "Salveaza",
    },
    es: {
      lang_label: "Idioma",
      nav_team_signup: "Registro del equipo",
      nav_match_request: "Solicitud de partido",
      nav_browse: "Buscar",
      nav_tournaments: "Torneos",
      nav_live: "Partidos en vivo",
      nav_videos: "Videos",
      nav_comments: "Comentarios",
      nav_social: "Social",
      nav_search: "Buscar",
      nav_likes: "Me gusta",
      nav_donate: "Donar",
      nav_read_aloud: "Leer",
      nav_about: "Sobre mi",
      h_index: "Haz que tu equipo juegue mas futbol.",
      h_team_signup: "Registro del equipo",
      h_match_request: "Publica una solicitud",
      h_browse: "Buscar",
      h_tournaments: "Inscripcion al torneo",
      h_live: "Partidos en vivo",
      h_videos: "Videos",
      h_comments: "Comentarios",
      h_social: "Social",
      h_search: "Buscar futbol",
      h_likes: "Me gusta",
      h_donate: "Donar",
      h_read_aloud: "Leer en voz alta",
      h_about: "Sobre mi",
      btn_signup: "Registrar equipo",
      btn_find_opponents: "Pedir un partido",
      btn_save_team: "Guardar equipo",
      btn_post_request: "Publicar",
      btn_save_entry: "Guardar",
      btn_add_video: "Agregar video",
      btn_post_comment: "Publicar comentario",
      btn_save_social: "Guardar",
      btn_search: "Buscar",
      ph_search: "Ejemplo: Lamine Yamal highlights",
      btn_save_donate: "Guardar",
    },
    fr: {
      lang_label: "Langue",
      nav_team_signup: "Inscription equipe",
      nav_match_request: "Demande de match",
      nav_browse: "Parcourir",
      nav_tournaments: "Tournois",
      nav_live: "Matchs en direct",
      nav_videos: "Videos",
      nav_comments: "Commentaires",
      nav_social: "Social",
      nav_search: "Rechercher",
      nav_likes: "J'aime",
      nav_donate: "Faire un don",
      nav_read_aloud: "Lecture",
      nav_about: "A propos de moi",
      h_index: "Fais jouer ton equipe plus souvent.",
      h_team_signup: "Inscription equipe",
      h_match_request: "Publier une demande",
      h_browse: "Parcourir",
      h_tournaments: "Inscription au tournoi",
      h_live: "Matchs en direct",
      h_videos: "Videos",
      h_comments: "Commentaires",
      h_social: "Social",
      h_search: "Recherche football",
      h_likes: "J'aime",
      h_donate: "Faire un don",
      h_read_aloud: "Lecture a voix haute",
      h_about: "A propos de moi",
      btn_signup: "Inscrire l'equipe",
      btn_find_opponents: "Demander un match",
      btn_save_team: "Enregistrer",
      btn_post_request: "Publier",
      btn_save_entry: "Enregistrer",
      btn_add_video: "Ajouter une video",
      btn_post_comment: "Publier un commentaire",
      btn_save_social: "Enregistrer",
      btn_search: "Rechercher",
      ph_search: "Exemple: Lamine Yamal highlights",
      btn_save_donate: "Enregistrer",
    },
  };

  function applyLang(lang) {
    const dict = I18N[lang] || I18N.en;
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const val = dict[key] || I18N.en[key];
      if (!val) return;
      el.textContent = val;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      const val = dict[key] || I18N.en[key];
      if (!val) return;
      el.setAttribute("placeholder", val);
    });
  }

  const savedLang = localStorage.getItem(STORAGE_KEYS.lang);
  const initial = savedLang && supported[savedLang] ? savedLang : "en";
  select.value = initial;
  applyLang(initial);

  select.addEventListener("change", () => {
    const lang = select.value;
    localStorage.setItem(STORAGE_KEYS.lang, lang);
    applyLang(lang);
    toast("Language updated", "Some personal text stays in its original language.");
  });
}

function setupMobileNav() {
  const header = document.querySelector(".site-header");
  const nav = document.querySelector(".site-header .nav");
  const headerInner = document.querySelector(".site-header .header-inner");
  if (!header || !nav || !headerInner) return;
  if (document.querySelector("[data-nav-toggle]")) return;

  const navId = "site-nav";
  nav.id = nav.id || navId;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("data-nav-toggle", "");
  btn.setAttribute("aria-controls", nav.id);
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `
    <span class="nav-toggle-icon" aria-hidden="true"></span>
    <span class="nav-toggle-text">Menu</span>
  `;

  // Insert toggle before the nav so it sits in the header row.
  headerInner.insertBefore(btn, nav);

  function setOpen(open) {
    header.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  btn.addEventListener("click", () => {
    const open = !header.classList.contains("nav-open");
    setOpen(open);
  });

  nav.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a");
    if (!a) return;
    setOpen(false);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", () => {
    // If we switch back to desktop width, ensure menu isn't stuck open.
    if (window.innerWidth > 720) setOpen(false);
  });
}

function setupLikeButton() {
  const headerInner = document.querySelector(".site-header .header-inner");
  if (!headerInner) return;
  if (document.querySelector("[data-like-pill]")) return;

  const pill = document.createElement("div");
  pill.className = "like-pill";
  pill.setAttribute("data-like-pill", "");
  pill.setAttribute(
    "title",
    "Likes are counted on your LAN server while server.rb is running. This does not automatically pay money."
  );
  pill.innerHTML = `
    <button class="btn btn-ghost like-btn" type="button" data-like-btn>
      Like
    </button>
    <span class="like-count" aria-label="Like count" data-like-count>0</span>
  `;

  headerInner.appendChild(pill);

  const deviceId = getDeviceId();
  const likeBtn = pill.querySelector("[data-like-btn]");
  const countEl = pill.querySelector("[data-like-count]");

  function setCount(n) {
    countEl.textContent = String(Math.max(0, Number(n) || 0));
  }

  async function fetchCount() {
    try {
      const res = await fetch(`/likes`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (!data || data.ok !== true || typeof data.likes !== "number") throw new Error("bad payload");
      setCount(data.likes);
      return true;
    } catch {
      return false;
    }
  }

  function localLikedKey() {
    return "kickoffhub_liked_v1";
  }

  function localCountKey() {
    return "kickoffhub_likes_local_count_v1";
  }

  function localInit() {
    const n = Number(localStorage.getItem(localCountKey()) || "0") || 0;
    setCount(n);
    const liked = localStorage.getItem(localLikedKey()) === "1";
    if (liked) {
      likeBtn.textContent = "Liked";
      likeBtn.disabled = true;
    }
  }

  async function doLike() {
    // Try LAN server first.
    try {
      const res = await fetch(`/likes/like?sid=${encodeURIComponent(deviceId)}`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (!data || data.ok !== true || typeof data.likes !== "number") throw new Error("bad payload");
      setCount(data.likes);
      likeBtn.textContent = "Liked";
      likeBtn.disabled = true;
      toast("Thanks!", "Your like was counted on the home Wi-Fi server.");
      return;
    } catch {
      // Fall back to device-local.
      const already = localStorage.getItem(localLikedKey()) === "1";
      if (already) {
        toast("Already liked", "This device has already liked.");
        likeBtn.textContent = "Liked";
        likeBtn.disabled = true;
        return;
      }
      const n = (Number(localStorage.getItem(localCountKey()) || "0") || 0) + 1;
      localStorage.setItem(localCountKey(), String(n));
      localStorage.setItem(localLikedKey(), "1");
      setCount(n);
      likeBtn.textContent = "Liked";
      likeBtn.disabled = true;
      toast("Thanks!", "Like saved on this device (no server found).");
    }
  }

  likeBtn.addEventListener("click", doLike);

  // Initialize count.
  fetchCount().then((ok) => {
    if (!ok) localInit();
  });
}

function setActiveNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll(".nav a");
  for (const link of links) {
    const href = (link.getAttribute("href") || "").split("/").pop();
    if (href === path) link.setAttribute("aria-current", "page");
  }
}

function collectForm(form) {
  const fd = new FormData(form);
  const data = {};
  for (const [key, value] of fd.entries()) {
    // Normalize empty strings.
    const v = typeof value === "string" ? value.trim() : value;
    data[key] = v === "" ? "" : v;
  }
  return data;
}

function requireFields(data, fields) {
  const missing = [];
  for (const field of fields) {
    if (!data[field]) missing.push(field);
  }
  return missing;
}

function addTeam(team) {
  const all = readJson(STORAGE_KEYS.teams, []);
  all.unshift(team);
  writeJson(STORAGE_KEYS.teams, all);
}

function addRequest(request) {
  const all = readJson(STORAGE_KEYS.requests, []);
  all.unshift(request);
  writeJson(STORAGE_KEYS.requests, all);
}

function addTournamentEntry(entry) {
  const all = readJson(STORAGE_KEYS.tournaments, []);
  all.unshift(entry);
  writeJson(STORAGE_KEYS.tournaments, all);
}

function addVideo(video) {
  const all = readJson(STORAGE_KEYS.videos, []);
  all.unshift(video);
  writeJson(STORAGE_KEYS.videos, all);
}

function removeVideo(id) {
  const all = readJson(STORAGE_KEYS.videos, []);
  const next = all.filter((v) => v && v.id !== id);
  writeJson(STORAGE_KEYS.videos, next);
}

function toEmbedUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    // YouTube
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return u;
      }
    }

    // Vimeo
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "player.vimeo.com" && parsed.pathname.startsWith("/video/")) {
      return u;
    }

    return "";
  } catch {
    return "";
  }
}

function onVideosPage() {
  const form = document.querySelector("[data-video-form]");
  const list = document.querySelector("[data-video-list]");
  const feed = document.querySelector("[data-football-feed]");
  const feedKindSel = document.querySelector("[data-feed-kind]");
  const feedTopBtn = document.querySelector("[data-feed-top]");
  if (!form || !list) return;

  function normalizeKind(value) {
    const v = String(value || "").toLowerCase();
    if (v === "training" || v === "match" || v === "other" || v === "highlights") return v;
    return "highlights";
  }

  function render() {
    const videos = readJson(STORAGE_KEYS.videos, []);
    if (!videos.length) {
      list.innerHTML = `<p class="muted">No videos yet. Add one above.</p>`;
      if (feed) {
        feed.innerHTML = `<p class="muted">No football videos yet. Add one above.</p>`;
      }
      return;
    }

    renderFeed(videos);

    list.innerHTML = videos
      .map((v) => {
        const embed = toEmbedUrl(v.url);
        const title = v.title || "Video";
        const desc = v.description || "";
        const safeId = escapeText(v.id);
        if (!embed) {
          return `
            <article class="video-card">
              <div class="video-meta">
                <h3 class="video-title">${escapeText(title)}</h3>
                ${desc ? `<p class="video-desc">${escapeText(desc)}</p>` : ""}
                <p class="mono">Link not supported. Use YouTube or Vimeo.</p>
              </div>
              <div class="video-actions">
                <a class="btn btn-ghost" href="${escapeText(v.url)}" target="_blank" rel="noreferrer">Open link</a>
                <button class="btn btn-ghost danger" type="button" data-video-remove="${safeId}">Remove</button>
              </div>
            </article>
          `;
        }
        return `
          <article class="video-card">
            <div class="video-frame">
              <iframe
                src="${escapeText(embed)}"
                title="${escapeText(title)}"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                referrerpolicy="strict-origin-when-cross-origin"
              ></iframe>
            </div>
            <div class="video-meta">
              <div class="video-head">
                <h3 class="video-title">${escapeText(title)}</h3>
                <button class="btn btn-ghost danger video-remove" type="button" data-video-remove="${safeId}">
                  Remove
                </button>
              </div>
              ${desc ? `<p class="video-desc">${escapeText(desc)}</p>` : ""}
              <p class="mono">${escapeText(v.url)}</p>
            </div>
          </article>
        `;
      })
      .join("");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);
    const missing = requireFields(data, ["title", "url"]);
    if (missing.length) {
      toast("Missing info", "Please add a title and a video link.");
      form.querySelector(`[name="${missing[0]}"]`)?.focus();
      return;
    }

    const embed = toEmbedUrl(data.url);
    if (!embed) {
      toast("Link not supported", "Please paste a YouTube or Vimeo link.");
      form.querySelector(`[name="url"]`)?.focus();
      return;
    }

    addVideo({
      id: uid("vid"),
      created_at: nowIso(),
      title: data.title,
      url: data.url,
      description: data.description || "",
      sport: "football",
      kind: normalizeKind(data.kind),
    });
    form.reset();
    toast("Video added", "It is now in your gallery.");
    render();
  });

  list.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-video-remove]");
    if (!btn) return;
    const id = btn.getAttribute("data-video-remove");
    if (!id) return;
    const ok = window.confirm("Remove this video from your device?");
    if (!ok) return;
    removeVideo(id);
    render();
  });

  function isFootball(v) {
    // Back-compat: older items without sport are treated as football.
    const sport = String(v?.sport || "football").toLowerCase();
    return sport === "football" || sport === "soccer";
  }

  function renderFeed(videos) {
    if (!feed) return;
    const kind = String(feedKindSel?.value || "all");
    const filtered = videos.filter(isFootball).filter((v) => {
      if (kind === "all") return true;
      return String(v.kind || "highlights") === kind;
    });

    if (!filtered.length) {
      feed.innerHTML = `<p class="muted">No videos for this filter yet. Try adding more.</p>`;
      return;
    }

    function providerLabel(url) {
      const u = String(url || "");
      if (u.includes("youtu")) return "YouTube";
      if (u.includes("vimeo")) return "Vimeo";
      return "Video";
    }

    feed.innerHTML = filtered
      .map((v) => {
        const embed = toEmbedUrl(v.url);
        if (!embed) return "";
        const kindLabel = (v.kind || "highlights").toString();
        const provider = providerLabel(v.url);
        return `
          <article class="feed-item">
            <div class="feed-frame">
              <iframe
                src="${escapeText(embed)}"
                title="${escapeText(v.title || "Video")}"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                referrerpolicy="strict-origin-when-cross-origin"
              ></iframe>

              <div class="feed-ui" aria-hidden="true">
                <div class="feed-ui-top">
                  <span class="source-badge" data-source="${escapeText(provider.toLowerCase())}">
                    ${escapeText(provider)}
                  </span>
                </div>
                <div class="feed-ui-bottom">
                  <div class="feed-ui-left">
                    <div class="feed-title">${escapeText(v.title || "Video")}</div>
                    <div class="tag-row">
                      <span class="tag">Football</span>
                      <span class="tag">${escapeText(kindLabel)}</span>
                    </div>
                    ${v.description ? `<p class="feed-desc">${escapeText(v.description)}</p>` : ""}
                  </div>
                  <div class="feed-ui-right">
                    <a class="icon-btn" href="${escapeText(v.url)}" target="_blank" rel="noreferrer" aria-label="Open link">
                      <span aria-hidden="true">↗</span>
                    </a>
                    <button class="icon-btn" type="button" data-copy-link="${escapeText(v.url)}" aria-label="Copy link">
                      <span aria-hidden="true">⧉</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  feedKindSel?.addEventListener("change", render);
  feedTopBtn?.addEventListener("click", () => {
    feed?.scrollTo({ top: 0, behavior: "smooth" });
  });

  feed?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-copy-link]");
    if (!btn) return;
    const link = btn.getAttribute("data-copy-link") || "";
    try {
      await navigator.clipboard.writeText(link);
      toast("Copied", "Video link copied.");
    } catch {
      toast("Copy failed", "Your browser blocked clipboard.");
    }
  });

  render();
}

function onCommentsPage() {
  const form = document.querySelector("[data-comments-form]");
  const list = document.querySelector("[data-comments-list]");
  if (!form || !list) return;

  const deviceId = getDeviceId();

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    } catch {
      return "";
    }
  }

  function renderItems(items) {
    if (!items || !items.length) {
      list.innerHTML = `<p class="muted">No comments yet. Be the first.</p>`;
      return;
    }
    list.innerHTML = items
      .slice(0, 80)
      .map((c) => {
        const meta = [
          c.topic ? `${c.topic}` : "",
          c.created_at ? formatTime(c.created_at) : "",
        ]
          .filter(Boolean)
          .join(" · ");

        return `
          <article class="comment">
            <div class="comment-head">
              <h3 class="comment-name">${escapeText(c.name || "Someone")}</h3>
              <div class="comment-meta">${escapeText(meta)}</div>
            </div>
            <p class="comment-body">${escapeText(c.message || "")}</p>
          </article>
        `;
      })
      .join("");
  }

  async function fetchComments() {
    try {
      const res = await fetch(`/comments`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (!data || data.ok !== true || !Array.isArray(data.comments)) throw new Error("bad payload");
      renderItems(data.comments);
      return true;
    } catch {
      return false;
    }
  }

  function loadLocal() {
    const items = readJson(STORAGE_KEYS.commentsLocal, []);
    renderItems(Array.isArray(items) ? items : []);
  }

  function saveLocal(comment) {
    const items = readJson(STORAGE_KEYS.commentsLocal, []);
    const next = Array.isArray(items) ? items : [];
    next.unshift(comment);
    writeJson(STORAGE_KEYS.commentsLocal, next);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = collectForm(form);
    const missing = requireFields(data, ["name", "message"]);
    if (missing.length) {
      toast("Missing info", "Please enter your name and a comment.");
      form.querySelector(`[name="${missing[0]}"]`)?.focus();
      return;
    }

    const payload = {
      sid: deviceId,
      name: data.name,
      topic: data.topic || "",
      message: data.message,
    };

    try {
      const res = await fetch(`/comments/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error("bad payload");
      toast("Posted", "Your comment is live on the Wi‑Fi server.");
      form.reset();
      await fetchComments();
      return;
    } catch {
      const local = {
        id: uid("c"),
        created_at: nowIso(),
        ...payload,
      };
      saveLocal(local);
      toast("Posted (local)", "Server not found. Saved on this device.");
      form.reset();
      loadLocal();
    }
  });

  // Initial load.
  fetchComments().then((ok) => {
    if (!ok) loadLocal();
  });
}

function onSocialPage() {
  const form = document.querySelector("[data-social-form]");
  const preview = document.querySelector("[data-social-preview]");
  const shareBtn = document.querySelector("[data-share-btn]");
  if (!form || !preview) return;

  const key = "kickoffhub_socials_v1";

  function readSocials() {
    const raw = readJson(key, {});
    return raw && typeof raw === "object" ? raw : {};
  }

  function normalizeUrl(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    // Allow plain usernames for snapchat as-is.
    if (!v.includes("://") && !v.startsWith("www.") && !v.includes(".")) return v;
    try {
      const u = new URL(v.includes("://") ? v : `https://${v}`);
      return u.toString();
    } catch {
      return v;
    }
  }

  function saveSocials(s) {
    writeJson(key, s);
  }

  function renderPreview(s) {
    const items = [
      ["Instagram", s.instagram],
      ["TikTok", s.tiktok],
      ["YouTube", s.youtube],
      ["Snapchat", s.snapchat],
      ["X", s.x],
      ["Facebook", s.facebook],
    ].filter(([, v]) => v);

    if (!items.length) {
      preview.innerHTML = `<p class="muted">No socials saved yet.</p>`;
      return;
    }

    preview.innerHTML = `
      <div class="social-row">
        ${items
          .map(([label, value]) => {
            const href =
              label === "Snapchat" && !String(value).includes("://")
                ? ""
                : escapeText(value);
            const text =
              label === "Snapchat" && !String(value).includes("://")
                ? `Snapchat: ${escapeText(value)}`
                : label;
            return href
              ? `<a class="btn btn-ghost" href="${href}" target="_blank" rel="noreferrer">${escapeText(text)}</a>`
              : `<span class="tag">${escapeText(text)}</span>`;
          })
          .join("")}
      </div>
    `;
  }

  const current = readSocials();
  for (const name of ["instagram", "tiktok", "youtube", "snapchat", "x", "facebook"]) {
    const el = form.querySelector(`[name="${name}"]`);
    if (el && current[name]) el.value = current[name];
  }
  renderPreview(current);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);
    const next = {
      instagram: normalizeUrl(data.instagram),
      tiktok: normalizeUrl(data.tiktok),
      youtube: normalizeUrl(data.youtube),
      snapchat: String(data.snapchat || "").trim(),
      x: normalizeUrl(data.x),
      facebook: normalizeUrl(data.facebook),
    };
    saveSocials(next);
    renderPreview(next);
    toast("Saved", "Your social links are saved on this device.");
  });

  shareBtn?.addEventListener("click", async () => {
    const url = location.origin + "/"; // homepage
    try {
      await navigator.clipboard.writeText(url);
      toast("Copied", "Website link copied to clipboard.");
    } catch {
      toast("Copy failed", "Your browser blocked clipboard. Copy the URL from the address bar.");
    }
  });
}

function onFootballSearchPage() {
  const form = document.querySelector("[data-football-search]");
  const quick = document.querySelector("[data-quick-searches]");
  const resultsEl = document.querySelector("[data-search-results]");
  const statusEl = document.querySelector("[data-search-status]");
  const modeSel = document.querySelector("[data-search-mode]");
  const clearBtn = document.querySelector("[data-search-clear]");
  if (!form) return;

  function buildUrl(provider, q, onlyFootball) {
    const queryText = onlyFootball ? `football ${q}` : q;
    const query = encodeURIComponent(queryText);
    if (provider === "wikipedia") return `https://en.wikipedia.org/wiki/Special:Search?search=${query}`;
    if (provider === "youtube") return `https://www.youtube.com/results?search_query=${query}`;
    if (provider === "ddg") return `https://duckduckgo.com/?q=${query}`;
    return `https://www.google.com/search?q=${query}`;
  }

  function runSearch(q, provider, onlyFootball) {
    const url = buildUrl(provider, q, onlyFootball);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
  }

  function setResultsHtml(html) {
    if (!resultsEl) return;
    resultsEl.innerHTML = html;
  }

  function stripHtml(html) {
    try {
      const div = document.createElement("div");
      div.innerHTML = String(html || "");
      return (div.textContent || "").trim();
    } catch {
      return String(html || "").replace(/<[^>]*>/g, "").trim();
    }
  }

  async function wikiSearch(q, onlyFootball) {
    if (!resultsEl) {
      runSearch(q, "google", onlyFootball);
      return;
    }

    const queryText = onlyFootball ? `football ${q}` : q;
    setStatus("Searching Wikipedia...");
    setResultsHtml(`<p class="muted">Loading results...</p>`);

    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&utf8=1&srlimit=8&srsearch=${encodeURIComponent(
        queryText
      )}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const items = data?.query?.search;
      if (!Array.isArray(items) || items.length === 0) {
        setStatus("No results. Try different words.");
        setResultsHtml(`<p class="muted">No results found.</p>`);
        return;
      }

      setStatus(`Top results for: ${queryText}`);
      const html = items
        .map((it) => {
          const title = it?.title || "Result";
          const snippet = stripHtml(it?.snippet || "");
          const pageTitle = String(title).split(" ").join("_");
          const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
          return `
            <article class="result">
              <a class="result-title" href="${escapeText(pageUrl)}" target="_blank" rel="noreferrer">${escapeText(title)}</a>
              <div class="result-url">${escapeText(pageUrl)}</div>
              <p class="result-snippet">${escapeText(snippet)}</p>
            </article>
          `;
        })
        .join("");
      setResultsHtml(html);
    } catch {
      setStatus("Could not load results. Try Open Google.");
      setResultsHtml(`<p class="muted">Wikipedia search failed in this browser/network.</p>`);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);
    const q = String(data.q || "").trim();
    const mode = String(data.mode || "wiki");
    const onlyFootball = data.only_football === "on" || data.only_football === "true" || data.only_football === true;
    if (!q) {
      toast("Missing search", "Type something to search.");
      form.querySelector("[name=\"q\"]")?.focus();
      return;
    }

    if (mode === "wiki") {
      wikiSearch(q, onlyFootball);
      return;
    }
    if (mode === "youtube") {
      runSearch(q, "youtube", onlyFootball);
      return;
    }
    runSearch(q, "google", onlyFootball);
  });

  quick?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-quick]");
    if (!btn) return;
    const q = btn.getAttribute("data-quick") || "";
    const mode = modeSel?.value || "wiki";
    const onlyFootball = form.querySelector("[name=\"only_football\"]")?.checked ?? true;
    if (mode === "wiki") {
      wikiSearch(q, onlyFootball);
      return;
    }
    if (mode === "youtube") {
      runSearch(q, "youtube", onlyFootball);
      return;
    }
    runSearch(q, "google", onlyFootball);
  });

  clearBtn?.addEventListener("click", () => {
    form.querySelector("[name=\"q\"]")?.focus();
    form.querySelector("[name=\"q\"]").value = "";
    setStatus("Type a search and press Search to see results here.");
    setResultsHtml("");
  });

  // Default state.
  if (resultsEl) setResultsHtml("");
}

function onLikesPage() {
  const totalEl = document.querySelector("[data-likes-total]");
  const modeEl = document.querySelector("[data-likes-mode]");
  const refreshBtn = document.querySelector("[data-likes-refresh]");
  if (!totalEl || !modeEl) return;

  function localCount() {
    return Number(localStorage.getItem("kickoffhub_likes_local_count_v1") || "0") || 0;
  }

  async function refresh() {
    try {
      const res = await fetch(`/likes`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (!data || data.ok !== true || typeof data.likes !== "number") throw new Error("bad payload");
      totalEl.textContent = String(Math.max(0, data.likes));
      modeEl.textContent = "Shared on Wi-Fi server (server.rb)";
      return;
    } catch {
      const n = localCount();
      totalEl.textContent = String(Math.max(0, n));
      modeEl.textContent = "Local on this device (no server)";
    }
  }

  refreshBtn?.addEventListener("click", refresh);
  refresh();
  window.setInterval(refresh, 6000);
}

function onDonatePage() {
  const form = document.querySelector("[data-donate-form]");
  const preview = document.querySelector("[data-donate-preview]");
  const amountRange = document.querySelector("[data-donate-amount]");
  const amountDirect = document.querySelector("[data-donate-amount-direct]");
  const amountLabel = document.querySelector("[data-donate-amount-label]");
  const currencySel = document.querySelector("[data-donate-currency]");
  const copyBtn = document.querySelector("[data-donate-copy]");
  const ticksEl = document.querySelector("[data-donate-ticks]");
  if (!form || !preview) return;

  function normalizeUrl(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    try {
      const u = new URL(v.includes("://") ? v : `https://${v}`);
      return u.toString();
    } catch {
      return v;
    }
  }

  function readDonate() {
    const raw = readJson(STORAGE_KEYS.donate, {});
    return raw && typeof raw === "object" ? raw : {};
  }

  function saveDonate(d) {
    writeJson(STORAGE_KEYS.donate, d);
  }

  function buildCashAppLink(cashtag) {
    const tag = String(cashtag || "").trim();
    if (!tag) return "";
    const cleaned = tag.startsWith("$") ? tag.slice(1) : tag;
    if (!cleaned) return "";
    return `https://cash.app/$${encodeURIComponent(cleaned)}`;
  }

  function getCurrency(d) {
    const base = String(d.currency || "GBP").trim();
    if (base === "Other") {
      const other = String(d.currency_other || "").trim().toUpperCase();
      return other || "GBP";
    }
    return base || "GBP";
  }

  function formatMoney(amount, currency) {
    const n = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Slider uses a log scale so we can reach 1,000,000,000 without needing a giant range input.
  // 0 => 1, 1000 => 1e9
  function sliderToAmount(pos) {
    const p = clamp(Number(pos) || 0, 0, 1000);
    const raw = Math.pow(10, (p / 1000) * 9);
    // Round to integer for donation providers.
    return clamp(Math.round(raw), 1, 1_000_000_000);
  }

  function amountToSlider(amount) {
    const a = clamp(Number(amount) || 1, 1, 1_000_000_000);
    const log = Math.log10(a);
    return String(clamp(Math.round((log / 9) * 1000), 0, 1000));
  }

  function renderTicks() {
    if (!ticksEl) return;
    const ticks = [
      { value: 1, label: "1" },
      { value: 10, label: "10" },
      { value: 100, label: "100" },
      { value: 1_000, label: "1k" },
      { value: 10_000, label: "10k" },
      { value: 100_000, label: "100k" },
      { value: 1_000_000, label: "1m" },
      { value: 10_000_000, label: "10m" },
      { value: 100_000_000, label: "100m" },
      { value: 1_000_000_000, label: "1b" },
    ];

    ticksEl.innerHTML = ticks
      .map((t) => {
        const pos = Number(amountToSlider(t.value)) || 0;
        const pct = clamp((pos / 1000) * 100, 0, 100);
        return `<span class="donate-tick" style="left:${pct}%">${escapeText(t.label)}</span>`;
      })
      .join("");
  }

  function withPayPalAmount(url, amount) {
    const u = String(url || "").trim();
    if (!u) return "";
    // PayPal.Me supports adding /{amount} at the end.
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return u;
    if (u.includes("paypal.me/") || u.includes("paypal.com/paypalme/")) {
      return u.replace(/\/+$/, "") + `/${encodeURIComponent(String(Math.round(n)))}`;
    }
    return u;
  }

  function withCashAppAmount(url, amount) {
    const u = String(url || "").trim();
    if (!u) return "";
    // Cash App supports /$cashtag/{amount} (amount only).
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return u;
    if (u.includes("cash.app/$")) {
      return u.replace(/\/+$/, "") + `/${encodeURIComponent(String(Math.round(n)))}`;
    }
    return u;
  }

  function render(d) {
    const items = [];
    const currency = getCurrency(d);
    const amount = clamp(Number(d.amount) || 5, 1, 1_000_000_000);
    const money = formatMoney(amount, currency);

    const cashBase = buildCashAppLink(d.cashapp);
    if (cashBase) items.push({ label: `Cash App (${money})`, href: withCashAppAmount(cashBase, amount) });

    if (d.paypalme) items.push({ label: `PayPal (${money})`, href: withPayPalAmount(d.paypalme, amount) });
    if (d.kofi) items.push({ label: "Ko-fi", href: d.kofi });
    if (d.bmac) items.push({ label: "Buy Me a Coffee", href: d.bmac });

    if (!items.length) {
      preview.innerHTML = `<p class="muted">No donation links yet. Add one above.</p>`;
      return;
    }

    preview.innerHTML = `
      <div class="social-row">
        ${items
          .map(
            (i) =>
              `<a class="btn btn-secondary" href="${escapeText(i.href)}" target="_blank" rel="noreferrer">${escapeText(i.label)}</a>`
          )
          .join("")}
      </div>
    `;
  }

  const current = readDonate();
  for (const name of ["cashapp", "paypalme", "kofi", "bmac", "currency", "currency_other", "amount"]) {
    const el = form.querySelector(`[name="${name}"]`);
    if (el && current[name]) el.value = current[name];
  }

  function syncAmountLabel() {
    if (!amountLabel || !amountRange) return;
    const d = readDonate();
    // Prefer current form values while editing.
    const amountFromSlider = sliderToAmount(amountRange.value);
    const typed = amountDirect ? Number(amountDirect.value) : NaN;
    const amount = Number.isFinite(typed) && typed > 0 ? typed : (Number(d.amount) || amountFromSlider || 5);
    const currency =
      currencySel?.value === "Other"
        ? (form.querySelector("[name=\"currency_other\"]")?.value || d.currency_other || "GBP")
        : (currencySel?.value || d.currency || "GBP");
    const cur = String(currency || "GBP").trim().toUpperCase();
    amountLabel.textContent = formatMoney(clamp(amount, 1, 1_000_000_000), cur);
  }

  // Set sensible defaults if missing.
  if (!current.amount) current.amount = "5";
  if (!current.currency) current.currency = "GBP";
  if (amountRange && !amountRange.value) amountRange.value = amountToSlider(current.amount);
  if (currencySel && !currencySel.value) currencySel.value = String(current.currency);
  if (amountDirect && !amountDirect.value) amountDirect.value = String(current.amount);

  renderTicks();
  syncAmountLabel();
  render({
    ...current,
    amount: amountDirect?.value || current.amount,
    currency: currencySel?.value || current.currency,
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);
    const exact = clamp(Number(data.amount_exact || data.amount || "5") || 5, 1, 1_000_000_000);
    const next = {
      cashapp: String(data.cashapp || "").trim(),
      paypalme: normalizeUrl(data.paypalme),
      kofi: normalizeUrl(data.kofi),
      bmac: normalizeUrl(data.bmac),
      currency: String(data.currency || "GBP"),
      currency_other: String(data.currency_other || "").trim(),
      amount: String(exact),
    };
    saveDonate(next);
    if (amountDirect) amountDirect.value = String(exact);
    if (amountRange) amountRange.value = amountToSlider(exact);
    syncAmountLabel();
    render(next);
    toast("Saved", "Donation links saved on this device.");
  });

  amountRange?.addEventListener("input", () => {
    const amount = sliderToAmount(amountRange.value);
    if (amountDirect) amountDirect.value = String(amount);
    syncAmountLabel();
    const d = readDonate();
    render({ ...d, amount: String(amount), currency: currencySel?.value || d.currency });
  });

  amountDirect?.addEventListener("input", () => {
    const amount = clamp(Number(amountDirect.value) || 1, 1, 1_000_000_000);
    if (amountRange) amountRange.value = amountToSlider(amount);
    syncAmountLabel();
    const d = readDonate();
    render({ ...d, amount: String(amount), currency: currencySel?.value || d.currency });
  });

  currencySel?.addEventListener("change", () => {
    syncAmountLabel();
    const d = readDonate();
    const amount = amountDirect?.value || d.amount;
    render({ ...d, amount: amount, currency: currencySel.value });
  });

  form.querySelector("[name=\"currency_other\"]")?.addEventListener("input", () => {
    syncAmountLabel();
    const d = readDonate();
    const amount = amountDirect?.value || d.amount;
    render({ ...d, amount: amount, currency: currencySel?.value || d.currency });
  });

  copyBtn?.addEventListener("click", async () => {
    const d = readDonate();
    const amount = clamp(Number(amountDirect?.value || d.amount) || 5, 1, 1_000_000_000);
    const currency = getCurrency({ ...d, currency: currencySel?.value || d.currency, currency_other: form.querySelector("[name=\"currency_other\"]")?.value || d.currency_other });
    const text = `Donation amount: ${formatMoney(amount, currency)}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", text);
    } catch {
      toast("Copy failed", text);
    }
  });
}

function setupFooterSocials() {
  const foot = document.querySelector(".site-footer .footer-inner");
  if (!foot) return;
  if (document.querySelector("[data-footer-socials]")) return;

  const key = "kickoffhub_socials_v1";
  const socials = readJson(key, {});
  const links = [];
  if (socials && typeof socials === "object") {
    for (const [label, href] of Object.entries({
      Instagram: socials.instagram,
      TikTok: socials.tiktok,
      YouTube: socials.youtube,
      X: socials.x,
      Facebook: socials.facebook,
    })) {
      if (href) links.push({ label, href });
    }
  }

  const box = document.createElement("div");
  box.className = "footer-socials";
  box.setAttribute("data-footer-socials", "");

  if (!links.length) {
    box.innerHTML = `<p class="fine">Add socials: <a href="./social.html">Social</a></p>`;
  } else {
    box.innerHTML = `
      <p class="fine">Follow:</p>
      <div class="social-row">
        ${links
          .map(
            (l) =>
              `<a class="btn btn-ghost" href="${escapeText(l.href)}" target="_blank" rel="noreferrer">${escapeText(l.label)}</a>`
          )
          .join("")}
      </div>
    `;
  }

  foot.appendChild(box);
}

function formatMaybeDate(value) {
  if (!value) return "Any date";
  try {
    // Avoid timezone shifts for <input type="date"> values ("YYYY-MM-DD").
    const parts = String(value).split("-");
    const d =
      parts.length === 3
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        : new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return value;
  }
}

function escapeText(s) {
  const str = String(s ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderListItem(title, meta, tags, body, footer) {
  const tagsHtml = (tags || [])
    .filter(Boolean)
    .map((t) => `<span class="tag">${escapeText(t)}</span>`)
    .join("");

  return `
    <article class="item">
      <div class="item-head">
        <h3 class="item-title">${escapeText(title)}</h3>
        <div class="item-meta">${escapeText(meta)}</div>
      </div>
      ${tagsHtml ? `<div class="tag-row">${tagsHtml}</div>` : ""}
      ${body ? `<p>${escapeText(body)}</p>` : ""}
      ${footer ? `<div class="mono">${escapeText(footer)}</div>` : ""}
    </article>
  `;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setupRevealStagger() {
  const reveal = document.querySelectorAll(".reveal");
  reveal.forEach((el, i) => {
    el.style.setProperty("--d", `${i * 90}ms`);
  });
}

function onTeamSignupPage() {
  const form = document.querySelector("[data-team-form]");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);

    const missing = requireFields(data, [
      "team_name",
      "team_type",
      "age_group",
      "contact_name",
      "contact_email",
      "town_city",
      "country",
    ]);
    if (missing.length) {
      toast("Missing info", "Please fill in all required fields.");
      form.querySelector(`[name="${missing[0]}"]`)?.focus();
      return;
    }

    const record = {
      id: uid("team"),
      created_at: nowIso(),
      ...data,
    };
    addTeam(record);
    form.reset();
    toast("Team saved", "Your team has been added. You can now post a match request.");
  });
}

function onMatchRequestPage() {
  const form = document.querySelector("[data-request-form]");
  if (!form) return;

  // Pre-fill contact from latest team signup (if available).
  const teams = readJson(STORAGE_KEYS.teams, []);
  const latest = teams[0];
  if (latest) {
    const map = {
      contact_name: "contact_name",
      contact_email: "contact_email",
      contact_phone: "contact_phone",
      town_city: "town_city",
      country: "country",
    };
    for (const [name, key] of Object.entries(map)) {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && !el.value) el.value = latest[key] || "";
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);

    const missing = requireFields(data, [
      "request_type",
      "age_group",
      "team_name",
      "town_city",
      "country",
      "contact_name",
      "contact_email",
    ]);
    if (missing.length) {
      toast("Missing info", "Please fill in all required fields.");
      form.querySelector(`[name="${missing[0]}"]`)?.focus();
      return;
    }

    const record = {
      id: uid("req"),
      created_at: nowIso(),
      ...data,
    };
    addRequest(record);
    form.reset();
    toast("Request posted", "Your match request is now visible in Browse.");

    // If kickoff time is provided, also add it to the Live Games leaderboard.
    const kickoffLocal = String(record.kickoff_datetime || "").trim();
    if (kickoffLocal) {
      const kickoffMs = new Date(kickoffLocal).getTime();
      if (Number.isFinite(kickoffMs)) {
        const homeScoreRaw = String(record.home_score || "").trim();
        const awayScoreRaw = String(record.away_score || "").trim();
        const homeScore = homeScoreRaw === "" ? null : Number(homeScoreRaw);
        const awayScore = awayScoreRaw === "" ? null : Number(awayScoreRaw);
        if (
          (homeScoreRaw !== "" && (!Number.isFinite(homeScore) || homeScore < 0 || homeScore > 99)) ||
          (awayScoreRaw !== "" && (!Number.isFinite(awayScore) || awayScore < 0 || awayScore > 99))
        ) {
          toast("Invalid score", "Scores must be a number between 0 and 99 (or left blank).");
          return;
        }

        const fixture = {
          id: uid("fx"),
          created_at: nowIso(),
          home: record.team_name || "Home",
          away: String(record.opponent_team || "").trim() || "Opponent",
          kickoff_iso: new Date(kickoffMs).toISOString(),
          duration_mins: Number(record.match_length || 90) || 90,
          competition: record.request_type || "",
          venue: [record.town_city || "", record.country || ""].filter(Boolean).join(", "),
          home_score: homeScore,
          away_score: awayScore,
        };

        // Local fallback (works even without the Wi‑Fi server).
        const local = readJson(STORAGE_KEYS.fixtures, []);
        const list = Array.isArray(local) ? local : [];
        list.unshift(fixture);
        writeJson(STORAGE_KEYS.fixtures, list.slice(0, 200));

        // Shared on Wi‑Fi server (if running).
        fetch("/fixtures/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sid: getDeviceId(),
            home: fixture.home,
            away: fixture.away,
            kickoff_iso: fixture.kickoff_iso,
            duration_mins: fixture.duration_mins,
            competition: fixture.competition,
            venue: fixture.venue,
            home_score: fixture.home_score,
            away_score: fixture.away_score,
          }),
        }).catch(() => {});
      }
    }
  });
}

function onTournamentPage() {
  const form = document.querySelector("[data-tournament-form]");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm(form);

    const missing = requireFields(data, [
      "tournament_name",
      "age_group",
      "team_name",
      "town_city",
      "country",
      "contact_name",
      "contact_email",
    ]);
    if (missing.length) {
      toast("Missing info", "Please fill in all required fields.");
      form.querySelector(`[name="${missing[0]}"]`)?.focus();
      return;
    }

    const record = {
      id: uid("tournament"),
      created_at: nowIso(),
      ...data,
    };
    addTournamentEntry(record);
    form.reset();
    toast("Entry saved", "Tournament entry saved on this device.");
  });
}

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = JSON.stringify(item).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function onBrowsePage() {
  const list = document.querySelector("[data-browse-list]");
  if (!list) return;

  const qEl = document.querySelector("[data-q]");
  const kindEl = document.querySelector("[data-kind]");
  const ageEl = document.querySelector("[data-age]");

  const admin = document.querySelector("[data-admin]");
  const exportAllBtn = document.querySelector("[data-export-all]");
  const wipeBtn = document.querySelector("[data-wipe]");

  if (exportAllBtn) {
    exportAllBtn.addEventListener("click", () => {
      const payload = {
        exported_at: nowIso(),
        teams: readJson(STORAGE_KEYS.teams, []),
        match_requests: readJson(STORAGE_KEYS.requests, []),
        tournament_entries: readJson(STORAGE_KEYS.tournaments, []),
      };
      downloadJson("kickoffhub-export.json", payload);
      toast("Export started", "Downloaded kickoffhub-export.json");
    });
  }

  if (wipeBtn) {
    wipeBtn.addEventListener("click", () => {
      const ok = window.confirm(
        "This will delete all saved teams/requests/tournament entries on this device. Continue?"
      );
      if (!ok) return;
      localStorage.removeItem(STORAGE_KEYS.teams);
      localStorage.removeItem(STORAGE_KEYS.requests);
      localStorage.removeItem(STORAGE_KEYS.tournaments);
      toast("Cleared", "Local data cleared. Refresh to see empty lists.");
      render();
    });
  }

  if (admin && location.hash === "#admin") {
    admin.scrollIntoView({ block: "start" });
  }

  function render() {
    const q = qEl?.value?.trim() || "";
    const kind = kindEl?.value || "requests";
    const age = ageEl?.value || "";

    const teams = readJson(STORAGE_KEYS.teams, []);
    const reqs = readJson(STORAGE_KEYS.requests, []);
    const tour = readJson(STORAGE_KEYS.tournaments, []);

    let html = "";
    if (kind === "teams") {
      const filtered = teams
        .filter((t) => (age ? t.age_group === age : true))
        .filter((t) => matchesQuery(t, q));
      if (!filtered.length) {
        list.innerHTML = `<p class="muted">No teams yet. Add one from Team Signup.</p>`;
        return;
      }
      html = filtered
        .map((t) =>
          renderListItem(
            t.team_name,
            `${t.age_group} · ${t.team_type} · ${t.town_city}, ${t.country}`,
            [t.level || "", t.preferred_day || ""].filter(Boolean),
            t.notes || "",
            `Contact: ${t.contact_name} · ${t.contact_email}${t.contact_phone ? " · " + t.contact_phone : ""}`
          )
        )
        .join("");
    } else if (kind === "tournaments") {
      const filtered = tour
        .filter((t) => (age ? t.age_group === age : true))
        .filter((t) => matchesQuery(t, q));
      if (!filtered.length) {
        list.innerHTML = `<p class="muted">No tournament entries yet. Add one from Tournaments.</p>`;
        return;
      }
      html = filtered
        .map((t) =>
          renderListItem(
            t.tournament_name,
            `${t.age_group} · ${t.town_city}, ${t.country}`,
            [t.event_date ? `Event: ${formatMaybeDate(t.event_date)}` : "", t.format || ""].filter(Boolean),
            t.notes || "",
            `Team: ${t.team_name} · Contact: ${t.contact_name} · ${t.contact_email}`
          )
        )
        .join("");
    } else {
      const filtered = reqs
        .filter((r) => (age ? r.age_group === age : true))
        .filter((r) => matchesQuery(r, q));
      if (!filtered.length) {
        list.innerHTML = `<p class="muted">No match requests yet. Post one from Match Request.</p>`;
        return;
      }
      html = filtered
        .map((r) => {
          const bodyParts = [];
          if (r.rules) bodyParts.push(`Rules: ${r.rules}`);
          if (r.message) bodyParts.push(r.message);
          return renderListItem(
            `${r.team_name} (${r.request_type})`,
            `${r.age_group} · ${r.town_city}, ${r.country}`,
            [
              r.home_away || "",
              r.level || "",
              r.pitch_size || "",
              r.match_length ? `${r.match_length} mins` : "",
              r.date_from ? `From: ${formatMaybeDate(r.date_from)}` : "",
              r.date_to ? `To: ${formatMaybeDate(r.date_to)}` : "",
            ].filter(Boolean),
            bodyParts.join(" "),
            `Contact: ${r.contact_name} · ${r.contact_email}${r.contact_phone ? " · " + r.contact_phone : ""}`
          );
        })
        .join("");
    }

    list.innerHTML = html;
  }

  qEl?.addEventListener("input", render);
  kindEl?.addEventListener("change", render);
  ageEl?.addEventListener("change", render);
  render();
}

function onLiveGamesPage() {
  const root = document.querySelector("[data-live-page]");
  if (!root) return;

  const nowEl = root.querySelector("[data-live-now]");
  const countEl = root.querySelector("[data-live-count]");
  const boardEl = root.querySelector("[data-live-board]");
  if (!boardEl) return;

  let fixtures = [];
  let source = "local";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatHms(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0) return `${hh}:${pad2(mm)}:${pad2(ss)}`;
    return `${mm}:${pad2(ss)}`;
  }

  function safeDateMs(isoOrLocal) {
    const ms = new Date(isoOrLocal).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function fixtureCompetition(f) {
    const comp = String(f.competition || "").trim();
    return comp || "Friendly";
  }

  function statusForFixture(f, nowMs) {
    const kickoffMs = safeDateMs(f.kickoff_iso);
    const durationMins = Number(f.duration_mins || 90) || 90;
    const durationMs = Math.max(1, durationMins) * 60 * 1000;
    const endMs = kickoffMs + durationMs;

    if (!Number.isFinite(kickoffMs)) return { kind: "invalid" };
    if (nowMs < kickoffMs) return { kind: "upcoming", kickoffMs, endMs, durationMs };
    if (nowMs >= kickoffMs && nowMs < endMs) return { kind: "live", kickoffMs, endMs, durationMs };
    return { kind: "finished", kickoffMs, endMs, durationMs };
  }

  function displayTimeForFixture(f, st, nowMs) {
    if (st.kind === "live") {
      const mins = Math.max(1, Math.floor((nowMs - st.kickoffMs) / 60000) + 1);
      return `${mins}'`;
    }
    if (st.kind === "finished") return "FT";
    if (st.kind === "invalid") return "--";
    try {
      const d = new Date(f.kickoff_iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--";
    }
  }

  function displayMetaForFixture(f, st, nowMs) {
    // Keep the leaderboard focused on score, not countdowns.
    return "";
  }

  function displayScoreForFixture(f) {
    const hs = Number(f.home_score);
    const as = Number(f.away_score);
    if (Number.isFinite(hs) && Number.isFinite(as)) return `${hs}-${as}`;
    return "-";
  }

  function renderRow(f, nowMs) {
    const st = statusForFixture(f, nowMs);
    const time = displayTimeForFixture(f, st, nowMs);
    const meta = displayMetaForFixture(f, st, nowMs);
    const score = displayScoreForFixture(f);
    const timeClass = st.kind === "live" ? "fs-time fs-time-live" : "fs-time";
    const rowClass = st.kind === "live" ? "fs-row fs-row-live" : "fs-row";

    return `
      <div class="${rowClass}">
        <div class="${timeClass}">
          <div class="fs-time-main">${escapeText(time)}</div>
          ${meta ? `<div class="fs-time-sub">${escapeText(meta)}</div>` : ""}
        </div>
        <div class="fs-teams">
          <div class="fs-team fs-team-home">${escapeText(f.home || "Home")}</div>
          <div class="fs-team fs-team-away">${escapeText(f.away || "Away")}</div>
        </div>
        <div class="fs-score">${escapeText(score)}</div>
      </div>
    `;
  }

  function renderLeagueBlock(name, rowsHtml) {
    return `
      <div class="fs-league">
        <div class="fs-league-name">${escapeText(name)}</div>
      </div>
      ${rowsHtml}
    `;
  }

  async function fetchFixturesFromServer() {
    try {
      const r = await fetch("/fixtures", { cache: "no-store" });
      if (!r.ok) return false;
      const json = await r.json();
      if (!json || json.ok !== true || !Array.isArray(json.fixtures)) return false;
      fixtures = json.fixtures;
      source = "server";
      return true;
    } catch {
      return false;
    }
  }

  function loadFixturesLocal() {
    const local = readJson(STORAGE_KEYS.fixtures, []);
    fixtures = Array.isArray(local) ? local : [];
    source = "local";
  }

  function render() {
    const now = new Date();
    const nowMs = now.getTime();
    if (nowEl) {
      nowEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    }

    const liveOnly = fixtures.filter((f) => statusForFixture(f, nowMs).kind === "live");
    if (countEl) countEl.textContent = String(liveOnly.length);

    if (!liveOnly.length) {
      boardEl.innerHTML = `<div class="fs-empty">No live games right now. Add one from Match Request with a kickoff time.</div>`;
      return;
    }

    // Leaderboard: most-advanced games (highest minute) first.
    const sorted = liveOnly.slice().sort((a, b) => {
      const sa = statusForFixture(a, nowMs);
      const sb = statusForFixture(b, nowMs);
      const ma = sa.kind === "live" ? nowMs - sa.kickoffMs : -1;
      const mb = sb.kind === "live" ? nowMs - sb.kickoffMs : -1;
      return mb - ma;
    });

    const byLeague = new Map();
    for (const f of sorted) {
      const league = fixtureCompetition(f);
      if (!byLeague.has(league)) byLeague.set(league, []);
      byLeague.get(league).push(f);
    }

    const leagueNames = Array.from(byLeague.keys()).sort((a, b) => a.localeCompare(b));
    boardEl.innerHTML = leagueNames
      .map((name) => {
        const rows = byLeague.get(name).map((f) => renderRow(f, nowMs)).join("");
        return renderLeagueBlock(name, rows);
      })
      .join("");
  }

  // Initial load tries the server first, then local fallback.
  fetchFixturesFromServer().then((ok) => {
    if (!ok) loadFixturesLocal();
    render();
  });

  window.setInterval(render, 1000);
  window.setInterval(() => fetchFixturesFromServer().then((ok) => ok && render()), 5000);
}

setActiveNav();
setupRevealStagger();
setupBackgroundLegend();
setupPresenceCounter();
setupLanguageSwitcher();
setupMobileNav();
setupLikeButton();
onTeamSignupPage();
onMatchRequestPage();
onTournamentPage();
onBrowsePage();
onLiveGamesPage();
onVideosPage();
onCommentsPage();
onSocialPage();
setupFooterSocials();
onFootballSearchPage();
onLikesPage();
onDonatePage();
onReadAloudPage();

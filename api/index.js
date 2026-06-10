const crypto = require("node:crypto");

const MANIFEST_VERSION = "2.0.0";
const TORRENTIO_BASE =
  "https://torrentio.strem.fun/sort=qualitysize%7Cqualityfilter=threed,4k,scr,cam%7Csizefilter=8GB,1.5GB%7Ctorbox=";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function sendJson(res, statusCode, body) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res, statusCode, html) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function hashKey(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function buildManifest(rdKey) {
  return {
    id: `id.my.normansyarif.stremiolinks.${hashKey(rdKey)}`,
    version: MANIFEST_VERSION,
    name: "Torbox",
    description: "Get streaming links",
    catalogs: [],
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    behaviorHints: {
      configurable: true,
    },
  };
}

function parseSize(title) {
  const match = title.match(/💾\s*([\d.]+)\s*(GB|MB)/i);
  if (!match) {
    return 0;
  }

  let size = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "GB") {
    size *= 1024;
  }

  return size;
}

function getSortableSize(stream) {
  const videoSize = stream.behaviorHints?.videoSize;
  if (typeof videoSize === "number" && Number.isFinite(videoSize) && videoSize > 0) {
    return videoSize / (1024 * 1024);
  }

  return parseSize(stream.title ?? "");
}

function transformStream(stream) {
  const rawName = stream.name ?? "";
  const rawTitle = stream.title ?? "";
  const normalizedName = rawName.toLowerCase();
  const hasVideoSize = stream.behaviorHints?.videoSize != null;
  let formattedName = "Source";

  if (normalizedName.includes("[tb+]")) {
    formattedName = rawName.replace(/\[TB\+\]\s*Torrentio/i, "Fast ⚡");
  } else if (normalizedName.includes("[tb download]")) {
    formattedName = rawName.replace(/\[TB download\]\s*Torrentio/i, "Download ⬇️");
  }

  const fileInfo = rawTitle.match(
    /💾\s*([0-9.,]+\s*(?:MB|GB|KB)).*?⚙️\s*([^\n]+)/iu,
  );
  const peerMatch = rawTitle.match(/👤\s*([0-9]+)/u);
  const audioMatch = rawTitle.match(/(?:🌐|[\u{1F1E6}-\u{1F1FF}]{2})\s*([^\n]+)/u);

  const fileSize = fileInfo?.[1] ?? "";
  const source = fileInfo?.[2] ?? "";
  const peers = peerMatch?.[1] ?? "";
  const languages = audioMatch?.[1] ?? "";

  let formattedTitle = "";

  if (fileSize && !hasVideoSize) {
    formattedTitle += `💾 ${fileSize}\n`;
  }

  if (peers || source) {
    if (peers) {
      formattedTitle += `👤 ${peers}`;
    }

    if (source) {
      formattedTitle += `${peers ? "  " : ""}🔍 ${source}`;
    }
  }

  if (languages) {
    formattedTitle += `${formattedTitle ? "\n" : ""}🌐 ${languages}`;
  }

  return {
    ...stream,
    name: formattedName,
    title: formattedTitle.trim(),
  };
}

function sortStreams(a, b) {
  const aName = a.name ?? "";
  const bName = b.name ?? "";
  const aTitle = a.title ?? "";
  const bTitle = b.title ?? "";

  const aHasFast = aName.includes("Fast ⚡");
  const bHasFast = bName.includes("Fast ⚡");
  if (aHasFast && !bHasFast) {
    return -1;
  }
  if (!aHasFast && bHasFast) {
    return 1;
  }

  const aSearchText = `${aName}\n${aTitle}`;
  const bSearchText = `${bName}\n${bTitle}`;
  const aIs1080 = aSearchText.includes("1080p");
  const bIs1080 = bSearchText.includes("1080p");
  if (aIs1080 && !bIs1080) {
    return -1;
  }
  if (!aIs1080 && bIs1080) {
    return 1;
  }
  if (aIs1080 && bIs1080) {
    const sizeDelta = getSortableSize(a) - getSortableSize(b);
    if (sizeDelta !== 0) {
      return sizeDelta;
    }
  }

  const aIs720 = aSearchText.includes("720p");
  const bIs720 = bSearchText.includes("720p");
  if (aIs720 && !bIs720) {
    return -1;
  }
  if (!aIs720 && bIs720) {
    return 1;
  }
  if (aIs720 && bIs720) {
    const sizeDelta = getSortableSize(b) - getSortableSize(a);
    if (sizeDelta !== 0) {
      return sizeDelta;
    }
  }

  return 0;
}

async function fetchStreams(rdKey, type, id) {
  const streamUrl =
    `${TORRENTIO_BASE}${encodeURIComponent(rdKey)}/stream/` +
    `${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;

  const response = await fetch(streamUrl, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Torrentio request failed with ${response.status}`);
  }

  return response.json();
}

function buildHomePage(origin) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Debrid Addon</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: rgba(10, 16, 32, 0.82);
      --panel-border: rgba(255, 255, 255, 0.12);
      --text: #f4f7fb;
      --muted: #a8b4cc;
      --accent: #82d7ff;
      --accent-2: #ffd166;
      --input: rgba(255, 255, 255, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(130, 215, 255, 0.2), transparent 32%),
        radial-gradient(circle at right, rgba(255, 209, 102, 0.15), transparent 28%),
        linear-gradient(160deg, #09101d 0%, #05070d 100%);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .panel {
      width: min(760px, 100%);
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      padding: 28px;
      backdrop-filter: blur(18px);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1;
    }
    p {
      margin: 0 0 18px;
      color: var(--muted);
      line-height: 1.55;
    }
    .row {
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr auto;
      margin-top: 22px;
    }
    input {
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--input);
      color: var(--text);
      font: inherit;
    }
    button, a.button {
      padding: 14px 18px;
      border-radius: 14px;
      border: 0;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #071019;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .mono {
      display: block;
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--accent);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      word-break: break-all;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .hint {
      margin-top: 18px;
      font-size: 0.95rem;
    }
    @media (max-width: 640px) {
      .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="panel">
    <h1>Debrid Addon</h1>
    <p>Install this Stremio addon by placing your Torbox API key in the URL path. The key is never bundled into client-side code and is not hardcoded into the deployment.</p>
    <form id="config-form">
      <div class="row">
        <input id="rd-key" type="password" placeholder="Paste your Torbox API key" autocomplete="off" required>
        <button type="submit">Build URL</button>
      </div>
    </form>
    <code class="mono" id="manifest-url">${origin}/YOUR_RD_KEY/manifest.json</code>
    <div class="actions">
      <a class="button" id="install-link" href="stremio://${new URL(origin).host}/YOUR_RD_KEY/manifest.json">Install in Stremio</a>
      <a class="button" id="open-manifest" href="${origin}/YOUR_RD_KEY/manifest.json" target="_blank" rel="noreferrer">Open manifest</a>
    </div>
    <p class="hint">Anyone with the full manifest URL can still use that key, so treat the install URL as sensitive.</p>
  </main>
  <script>
    const form = document.getElementById("config-form");
    const input = document.getElementById("rd-key");
    const manifestUrl = document.getElementById("manifest-url");
    const installLink = document.getElementById("install-link");
    const openManifest = document.getElementById("open-manifest");
    const base = ${JSON.stringify(origin)};
    const host = ${JSON.stringify(new URL(origin).host)};

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const key = input.value.trim();
      if (!key) {
        return;
      }

      const encodedKey = encodeURIComponent(key);
      const url = base + "/" + encodedKey + "/manifest.json";
      manifestUrl.textContent = url;
      installLink.href = "stremio://" + host + "/" + encodedKey + "/manifest.json";
      openManifest.href = url;
    });
  </script>
</body>
</html>`;
}

function normalizeOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  const origin = normalizeOrigin(req);
  const route = req.query.route;
  const rdKey = Array.isArray(req.query.rdKey)
    ? req.query.rdKey[0]
    : req.query.rdKey;

  if (route === "home" || route === "configure") {
    sendHtml(res, 200, buildHomePage(origin));
    return;
  }

  if (!rdKey) {
    sendJson(res, 400, {
      error: "Missing Torbox key in URL path",
      example: `${origin}/YOUR_RD_KEY/manifest.json`,
    });
    return;
  }

  if (route === "manifest") {
    sendJson(res, 200, buildManifest(rdKey));
    return;
  }

  if (route !== "stream") {
    sendJson(res, 404, { error: "Unknown route" });
    return;
  }

  const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  if (!type || !id) {
    sendJson(res, 400, { error: "Missing stream type or id" });
    return;
  }

  try {
    const data = await fetchStreams(rdKey, type, id);
    if (Array.isArray(data.streams)) {
      data.streams = data.streams.map(transformStream).sort(sortStreams);
    }

    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 502, {
      error: "Failed to fetch upstream streams",
      details: error.message,
    });
  }
};

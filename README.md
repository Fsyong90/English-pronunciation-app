# SpeakWell — English Pronunciation App

A free Progressive Web App (PWA) that helps users practice English pronunciation. Works in any modern browser and **installs on Android** like a native app.

## Features

- **Library** — curated word & phrase list across categories (Greetings, Often Mispronounced, Th/R/L sounds, Travel, Business, Numbers & Time, Tongue Twisters), each with IPA phonetics and meaning.
- **Listen** — tap any word to hear native pronunciation (browser TTS). Adjustable speed and voice.
- **Practice** — tap *Record*, speak the word, and the app scores your pronunciation 0–100% with a colored diff of what was heard.
- **Custom** — type any word or sentence and practice it. **📷 Capture from photo** uses your phone camera + Gemini vision to extract English text from a photo (sign, menu, book) and pronounce it automatically.
- **Settings** — pick voice, speed (0.5×–1.3×), and recognition accent (US / UK / AU / IN / CA).
- **Streak & daily count** — saved locally.
- **Offline support** — once loaded, works without internet (TTS still needs the device's TTS engine).
- **Install on Android** — Chrome → menu → *Install app*.

## How it works (and why it stays free for end users)

Two voice paths:

1. **Default — browser Web Speech API.** No API key, no backend.
   - `speechSynthesis` for pronunciation (uses Android's on-device Google TTS engine).
   - `webkitSpeechRecognition` for scoring (Chrome routes to Google's speech recognition for free).

2. **Optional premium — Google Gemini** via your own free Cloudflare Worker.
   - **Premium voice**: Gemini 3.1 Flash TTS for richer, more natural pronunciation.
   - **Photo to speech**: snap a photo, Gemini vision (`gemini-2.5-flash`) extracts the English text, and the app reads it aloud.
   - Routed through your own **Cloudflare Worker** (free tier: 100k req/day) so the API key never ships to the browser.
   - Uses Gemini's free API tier, with a configurable hard cap in the worker as a safety net.
   - **Automatic fallback**: if the worker is offline or hits its daily cap, the app falls back to the device voice for TTS so it keeps working. (OCR requires the worker.)

Static PWA + free Worker = $0/month, no credit card required.

## Run locally

Any static file server works. From the project root:

```bash
# option 1: Python
python3 -m http.server 8000

# option 2: Node
npx serve .
```

Open `http://localhost:8000` in Chrome. For mic access on a real device you must use HTTPS (or `localhost`).

## Deploy free (GitHub Pages)

1. Push this repo to GitHub.
2. Repo → Settings → Pages → Source: `main` (or your branch), folder `/ (root)`.
3. Wait ~1 minute, then open the published URL on your Android phone in Chrome.

## Install on Android

1. Open the deployed URL in **Chrome on Android**.
2. Tap the menu (⋮) → **Install app** (or **Add to Home screen**).
3. Launch from your home screen — it runs fullscreen with its own icon.
4. Grant **microphone permission** the first time you tap *Record*.

## Browser support

| Feature                   | Chrome (Android) | Chrome (Desktop) | Safari (iOS)    | Firefox          |
| ------------------------- | :--------------: | :--------------: | :-------------: | :--------------: |
| Listen (TTS)              | yes              | yes              | yes             | yes              |
| Record / score            | yes              | yes              | partial*        | no               |
| Install (PWA)             | yes              | yes              | partial         | yes              |

\* iOS Safari has limited Web Speech Recognition support; for best results use Chrome on Android.

## Enable premium voice (optional, ~5 minutes)

Full guide in [`worker/README.md`](worker/README.md). Short version:

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler secret put GEMINI_API_KEY        # paste key from aistudio.google.com/app/apikey
wrangler deploy
```

Take the printed `https://speakwell-tts.<sub>.workers.dev` URL, open the PWA's
**Settings** tab, paste it into *TTS worker URL*, toggle *Use premium voice*,
and tap *Test premium voice*.

## Project structure

```
.
├── index.html
├── styles.css
├── app.js
├── data/words.js          # word library
├── manifest.webmanifest   # PWA manifest
├── service-worker.js      # offline cache
├── icons/                 # app icons (svg + png 192/512, normal + maskable)
└── worker/                # optional Cloudflare Worker for Gemini TTS
    ├── worker.js
    ├── wrangler.toml
    └── README.md
```

## Customize the word list

Edit `data/words.js`. Each entry is `{ word, ipa, meaning }`. Add or rename categories at the top-level keys.

## Roadmap ideas

- Lesson mode with structured drills (minimal pairs, sentence stress).
- Pitch / intonation visualization.
- Per-user rate limiting in the worker (currently global).
- Audio caching in the service worker so previously-heard premium clips replay offline.

## License

MIT.

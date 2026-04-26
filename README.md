# SpeakWell — English Pronunciation App

A free Progressive Web App (PWA) that helps users practice English pronunciation. Works in any modern browser and **installs on Android** like a native app.

## Features

- **Library** — curated word & phrase list across categories (Greetings, Often Mispronounced, Th/R/L sounds, Travel, Business, Numbers & Time, Tongue Twisters), each with IPA phonetics and meaning.
- **Listen** — tap any word to hear native pronunciation (browser TTS). Adjustable speed and voice.
- **Practice** — tap *Record*, speak the word, and the app scores your pronunciation 0–100% with a colored diff of what was heard.
- **Custom** — type any word or sentence and practice it.
- **Settings** — pick voice, speed (0.5×–1.3×), and recognition accent (US / UK / AU / IN / CA).
- **Streak & daily count** — saved locally.
- **Offline support** — once loaded, works without internet (TTS still needs the device's TTS engine).
- **Install on Android** — Chrome → menu → *Install app*.

## How it works (and why it's free)

The app uses the browser's built-in **Web Speech API**:

- `window.speechSynthesis` for native pronunciation (uses Android's on-device Google Text-to-Speech engine).
- `webkitSpeechRecognition` for scoring the user's voice (Chrome routes this to Google's speech recognition service, free for end users — no API key, no backend).

Because everything runs in the browser, there's **no server cost** and **no API key** to manage. Host it on GitHub Pages, Netlify, or Vercel for free.

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

## Project structure

```
.
├── index.html
├── styles.css
├── app.js
├── data/words.js          # word library
├── manifest.webmanifest   # PWA manifest
├── service-worker.js      # offline cache
└── icons/                 # app icons (svg + png 192/512, normal + maskable)
```

## Customize the word list

Edit `data/words.js`. Each entry is `{ word, ipa, meaning }`. Add or rename categories at the top-level keys.

## Roadmap ideas

- Lesson mode with structured drills (minimal pairs, sentence stress).
- Pitch / intonation visualization.
- Optional cloud TTS (e.g. Gemini 3.1 Flash TTS / Google Cloud TTS) for richer voices — would require a small backend and paid API, so the app would no longer be 100% free for end users.

## License

MIT.

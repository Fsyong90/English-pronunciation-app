# SpeakWell TTS Worker

Tiny Cloudflare Worker that proxies Gemini 3.1 Flash TTS so the API key
stays on the server and never ships to phones.

The PWA in the parent directory calls `POST /tts` and gets back a `.wav`
audio blob. If this worker is offline, slow, or hits its daily cap, the
PWA automatically falls back to the browser's built-in TTS so the app
keeps working.

## What you need (all free)

1. **Cloudflare account** — https://dash.cloudflare.com/sign-up (no card).
2. **Gemini API key** — https://aistudio.google.com/app/apikey → *Create API key*.
3. **Node + npm** locally, to run `wrangler` (Cloudflare's CLI).

## One-time setup

```bash
# 1. Install Cloudflare CLI
npm install -g wrangler

# 2. Log in to Cloudflare (opens browser)
wrangler login

# 3. From this worker/ directory, store your Gemini key as a secret
cd worker
wrangler secret put GEMINI_API_KEY
# (paste the key from aistudio.google.com when prompted)

# 4. Deploy
wrangler deploy
```

After `wrangler deploy` you'll see a URL like:

```
https://speakwell-tts.<your-subdomain>.workers.dev
```

That's the URL you'll paste into the app's **Settings → Premium voice URL**.

## (Optional) Enable the daily-cap safety net

Without KV, the only thing limiting calls is Gemini's own free-tier rate
limit. If you want a hard daily cap enforced by the worker itself:

```bash
wrangler kv:namespace create RATE_KV
# copy the printed id, then edit wrangler.toml:
#
# [[kv_namespaces]]
# binding = "RATE_KV"
# id = "the-id-you-just-copied"

wrangler deploy
```

`DAILY_LIMIT` defaults to `500`. Change it in `wrangler.toml` and redeploy.

## (Optional) Lock down CORS

Once your PWA is deployed, set `ALLOWED_ORIGIN` in `wrangler.toml` to your
exact origin so random sites can't burn through your quota:

```toml
[vars]
ALLOWED_ORIGIN = "https://fsyong90.github.io"
```

Then `wrangler deploy` again.

## Test the worker from the command line

```bash
curl -X POST https://speakwell-tts.<your-subdomain>.workers.dev/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is SpeakWell.","voice":"Kore"}' \
  --output hello.wav

# play it
ffplay hello.wav    # or open hello.wav in any media player
```

## Available voices

Pass any prebuilt Gemini voice name in the request body's `voice` field.
Common ones include `Kore`, `Puck`, `Zephyr`, `Charon`, `Fenrir`, `Aoede`,
`Leda`, `Orus`. The PWA's Settings tab includes a picker.

## Troubleshooting

| Response                                       | Meaning / fix                                             |
| ---------------------------------------------- | --------------------------------------------------------- |
| `500 server_not_configured`                    | `GEMINI_API_KEY` secret not set. Run `wrangler secret put GEMINI_API_KEY`. |
| `429 daily_limit_reached`                      | Hit `DAILY_LIMIT`. Resets at UTC midnight, or raise the limit. |
| `502 upstream_error` with `status: 429`        | Gemini's own free-tier rate limit hit. Wait a minute.     |
| `502 upstream_error` with `status: 403/404`    | Wrong model name or API key invalid. Check `MODEL` and the secret. |
| `502 no_audio` with `finishReason: SAFETY`     | Gemini blocked the text. Try different wording.           |

## Costs

- **Cloudflare Workers** free tier: 100,000 requests/day. Plenty.
- **Gemini API** free tier: rate-limited (a few requests/minute). The
  worker's `DAILY_LIMIT` is your second line of defence.
- **No credit card required** for either tier.

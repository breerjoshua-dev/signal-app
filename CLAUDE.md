# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Signal is a single-page HTML application — a personalized AI news briefing app. There is no build step, no framework, and no package.json. The entire client is `signal.html`. External API calls are proxied through Vercel serverless functions in `api/` so secrets never reach the browser.

## Deploy & Development

**Redeploy to production:**
```bash
vercel --prod --cwd /Users/joshuabreer/Documents/Claude/Projects/Signal
```

**Add a Vercel environment variable:**
```bash
vercel env add VAR_NAME production --value VALUE --yes --cwd /Users/joshuabreer/Documents/Claude/Projects/Signal
```

**Pull env vars locally (for testing):**
```bash
vercel env pull /tmp/signal-env --cwd /Users/joshuabreer/Documents/Claude/Projects/Signal --yes
```

**Test an API proxy endpoint:**
```bash
curl -s -X POST https://signaldaily.app/api/groq \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```

There are no tests, no linter, and no local dev server. Iterate by editing `signal.html`, committing, and deploying. For proxy changes, deploy is required since they run server-side on Vercel.

## Architecture

### File map
```
signal.html          — entire client application (~5000 lines)
api/
  groq.js            — proxies POST to api.groq.com/openai/v1/chat/completions
  pexels.js          — proxies GET to api.pexels.com/v1/search
  elevenlabs.js      — proxies POST to api.elevenlabs.io/v1/text-to-speech/{voice_id}
  tts.js             — proxies POST to api.openai.com/v1/audio/speech (unused by default)
vercel.json          — zero-config; single rewrite "/" → signal.html; api/ auto-detected
supabase-schema.sql  — reference schema (run manually in Supabase SQL editor)
```

### Vercel environment variables (production)
| Variable | Used in |
|---|---|
| `GROQ_KEY` | `api/groq.js` |
| `PEXELS_KEY` | `api/pexels.js` |
| `ELEVENLABS_KEY` | `api/elevenlabs.js` |
| `SUPABASE_URL` | stored in Vercel; Supabase client is initialized client-side with the public anon key |
| `SUPABASE_ANON_KEY` | same — the anon key is safe to expose |

### signal.html — section map
The script block is one large IIFE broken into 13 labeled sections:

| Section | Responsibility |
|---|---|
| 1 — Constants & Data Model | `supabaseClient`, `INTEREST_MAP`, `INTEREST_KEYS`, `INTEREST_EMOJI`, `SIGNAL_VOICES`, `TIERS`, `DEPTH/TONE/SCHEDULE_OPTIONS`, `GOAL_OPTIONS` |
| 2 — Utilities | `$()`, `escapeHtml()`, `wait()`, `formatDateline()` |
| 3 — Profile | `loadProfile()` / `saveProfile()` — read/write localStorage. `getSections()` derives the ordered section list from `profile.interests`. |
| 4 — Boot | `init()` — async; checks Supabase session first, falls back to localStorage, then shows onboarding |
| 5 — Onboarding | 8-step wizard: Name → Role → Interests → Goals → Depth → Tone → Schedule. State held in `obData`. `goToStep(n)` drives navigation with slide animation. |
| 6 — Paywall | `showPaywall()` renders the plan selection overlay. On CTA click → `completeOnboarding(tier)` → `showAuthScreen('signup')` |
| 6A — Auth | `showAuthScreen()`, `doSignUp()`, `doSignIn()`, `signOut()`. Sign-up saves profile to Supabase `profiles` table then localStorage. Sign-in loads from Supabase. |
| 6B — Streak | Daily visit streak tracked in localStorage |
| 7 — Main App | `showApp()`, `switchView()`, `setAppMode()`, briefing generation pipeline |
| 8 — Explore Tab | Interest discovery, adjacent topic suggestions |
| 9 — LLM | `fetchCommentary()` → tries `callGroq()` (via `/api/groq`), falls back to `callPollinations()`. `buildSystemPrompt()` constructs the LLM prompt from tone/name/mode. |
| 10 — RSS Fetching | `fetchSectionImage()` calls `/api/pexels`. RSS fetched via `rss2json.com` proxy. |
| 11/12 — Voice & Playback | `buildSegments()` (lede text only, no intro), `playElevenLabsBriefing()` — fetches each segment from `/api/elevenlabs`, verifies blob, plays sequentially with 0.5s gaps; skips failed segments |
| 13 — Profile Page | `renderProfile()` — re-rendered on every visit to Profile tab |

### Core data flow

```
profile.interests (array of INTEREST_MAP keys)
  → getSections() → [{key, label, feeds[], context}]
  → RSS fetch per section (rss2json proxy)
  → buildSystemPrompt() + headline list
  → callGroq() via /api/groq
  → rendered lede + headline list in #briefing-content
  → playElevenLabsBriefing() → /api/elevenlabs → Audio blob
```

### Profile object shape
```js
{
  name, identities[], interests[], goal,
  depth, tone, schedule[],
  tier,           // 'free' | 'pro' | 'annual'
  trialStart,
  email,          // from Supabase auth
  supabaseId,     // auth.users.id
  onboardingComplete: true
}
```

Stored in `localStorage` under key `signal:profile`. On return visits, Supabase session is checked first; if valid, profile is loaded from the `profiles` table and localStorage is refreshed.

### Supabase schema
Single table: `public.profiles` (columns: `id`, `name`, `interests text[]`, `goals`, `tone`, `depth`, `schedule text[]`, `plan`, `stripe_customer_id`, `stripe_subscription_id`, `created_at`). Row-level security enabled — users can only read/write their own row. A trigger auto-inserts a blank profile row on new auth user creation.

### CSS architecture
All styles are inline in `signal.html` before `</style>`. Custom properties on `:root` define the design tokens (`--accent`, `--ink`, `--surface`, `--rule`, `--radius`, etc.). Three responsive breakpoints: desktop (1024px+), tablet (768–1023px), mobile (<768px). On desktop with sidebar visible, `.app-content.has-sidebar` uses `margin-left: 200px; margin-right: 0; max-width: none` to fill the full remaining width.

## Common Edit Patterns

**Add a new interest topic:** Add to `INTEREST_MAP` (with `label`, `feeds[]`, `context`), `INTEREST_KEYS` array, and `INTEREST_EMOJI` map.

**Add a new ElevenLabs voice:** Add to `SIGNAL_VOICES` array with `{ id: '<elevenlabs_voice_id>', label, desc, webSpeech }`. Verify the voice ID works first: `curl -s -o /dev/null -w "%{http_code}" -X POST https://signaldaily.app/api/elevenlabs -H "Content-Type: application/json" -d '{"voice_id":"ID","text":"test"}'`.

**Add a new external API proxy:** Create `api/service.js` following the pattern of existing proxies (method guard → read `process.env.KEY` → fetch upstream → return response). Add the key to Vercel with `vercel env add`. The `api/` directory is zero-config — Vercel auto-detects and deploys all `.js` files there as serverless functions.

**Change onboarding steps:** `TOTAL_STEPS` controls the progress bar. Each step is `renderStepN(el)` + a `goToStep(N+1)` call on the CTA. Steps are pre-rendered by `renderAllSteps()` and shown/hidden by `goToStep()` with a slide animation.

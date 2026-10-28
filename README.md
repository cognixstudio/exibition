# Gesture Lab

Control the browser with your hands. Draw in the air, play games, and fingerspell in ASL, all from a webcam. Hand tracking runs fully in your browser (MediaPipe); optional AI features use OpenRouter.

> Screenshots: add yours to `docs/` and link them here.
> `![Home](docs/home.png)` `![Air Draw](docs/draw.png)` `![Games](docs/game.png)` `![Sign Translator](docs/sign.png)`

## Features
- **Air Draw**: ☝️ draw, 🖐️ pause, ✊ erase, ✌️ change color. Neon strokes, Undo, Clear, Save PNG, hide video, and **AI Guess** (vision model guesses your sketch and adds a fun fact).
- **Gesture Strike** (full-screen action shooter): defend your base from waves of drones, gunships, meteors and bosses. Your fingertip is the crosshair and each gesture is a weapon: ☝️ blaster, ✌️ flak burst, ✊ hold-and-release rail beam, 🖐️ shockwave, 🤟 repair. Easy / Normal / Hard difficulty (each with its own leaderboard), combos, power-ups, and a boss every 5th wave (War Robot and Kraken alternate), sound, AI commentary and its own leaderboard. It pauses automatically if your hand leaves the camera.
- **Gesture Game** (5 modes, with sound effects and an AI commentator):
  - **Rock · Paper · Scissors** vs the computer.
  - **Fruit Slicer**: slice with your index fingertip; multi-fruit swipes give combo bonuses; avoid bombs.
  - **Space Defender**: steer with your palm; ✊ rapid fire, 🖐️ shield, ✌️ bomb; power-ups, tougher aliens and boss fights.
  - **Air Hockey**: your fingertip is the paddle against an aiming CPU; first to 5 wins.
  - **Copy Cat**: memorise a growing gesture pattern and repeat it; new gestures unlock as you progress.
- **Sign Translator**: ASL letters A-Y by landmark rules (J and Z need motion, so type them), signs Hello / Yes / No / Thank you / I love you, Space and Backspace. Hold a sign for 1 second to accept it. Tricky signs are sent as a small hand crop to the vision model. **AI Fix** cleans up the text, and **Speak** reads it aloud after optional translation.
- **Talk to a character**: pick Zippy (robot), Sakura (cheerful anime girl), Luna (sassy anime cat-girl) or Captain Pun (pirate). Each has its own look, personality and voice pitch. A live talking AI buddy. Speak (Chrome/Edge) or type, and Zippy answers out loud with jokes, puns, fun facts, riddles and friendly roasts. Supports Live conversation (auto-listens after each reply) and several languages.
- **Hand control** (🖐️ in the navbar, or `Alt+H`): no mouse needed. Steer a glowing cursor with your index fingertip, pinch thumb + index to click, or hold still over a button for 1.3 s. Hover the ▲ ▼ buttons on the right edge to scroll. Clicks over the camera stage are ignored so drawing and games are never triggered by accident. It turns on automatically in Exhibition mode. Settings has a **sensitivity** slider (how far your hand must move) and a **dwell time** slider (0.1 to 3 s, or 0 to turn dwell off).
- **Gesture reactions**: switch on *Gesture reactions (camera)* on the character page. Wave, thumbs up, peace sign, fist, I-love-you or point, and the character reacts out loud with floating emojis.
- **Leaderboard + QR code**: Every arcade game (Fruit Slicer, Space Defender, Air Hockey, Copy Cat) keeps its own local top 10 (enter your name after a high score) and shows a QR code so visitors can open the app on their phone. Set the public link under Settings → *Public link for QR codes*.
- **Exhibition mode** (`Alt+E` or the ⛶ button): fullscreen, navbar hidden. `Esc` exits.
- **Attract mode** (only in Exhibition mode): after 45 seconds without a hand, tap or key, the app resets to Home and shows a big "Wave to start!" screen with a talking character, the top scores and a QR code. Wave, tap or press a key to begin.
- **Offline / Demo fallback**: with no key, no network, or an API error, gestures still work and AI features return canned answers. Turn on **Demo mode** in Settings to force this.
- Shortcuts: `Alt+S` opens Settings, `Alt+E` toggles Exhibition mode.

## Run locally
Requires Node 18+ and a webcam.
```bash
npm install
npm run dev
```
Open the printed `http://localhost:5173` address in Chrome or Edge. `npm install` copies the MediaPipe WASM runtime into `public/` and downloads the gesture model (if that download fails, the app loads the model from Google at runtime).

## Get an OpenRouter key
1. Create an account at [openrouter.ai](https://openrouter.ai) and open **Keys**.
2. Create a key (starts with `sk-or-v1-`) and add a little credit if your chosen model is not free.
3. In the app, go to **Settings**, paste the key, pick a **vision-capable** model (default `google/gemini-3.8-flash`; check openrouter.ai/models for current IDs, they change often), press **Test connection**, then **Save**.

The key is stored only in your browser's localStorage and is sent only to OpenRouter. Because the app has no backend, anyone with access to your browser profile can read it; use a key with a spending limit.

## Deploy to GitHub Pages
1. Push this project to a GitHub repo with the default branch `main`.
2. In the repo go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` builds the app and publishes `dist/`. The site appears at `https://<user>.github.io/<repo>/`.

Vite is configured with `base: './'`, so it works from any sub-path. GitHub Pages serves HTTPS, which the camera requires.

## Build check
```bash
npm run build     # outputs dist/
npm run preview   # serve the build locally
```

## Troubleshooting
- **Camera blocked**: click the camera icon in the address bar, allow access, then press *Try again*. On Windows also check *Settings → Privacy → Camera*.
- **Camera needs HTTPS**: browsers only allow cameras on `https://` pages or `localhost`. Do not open `index.html` as a file, and do not use a plain `http://192.168…` LAN address.
- **Camera busy**: close other tabs or apps (Zoom, Teams) that use it.
- **Wrong camera**: Settings → *Detect cameras*, pick one, Save.
- **Hand model will not load**: check your connection, run `npm install` again, restart `npm run dev`.
- **Low FPS**: close heavy tabs, use good front lighting, and prefer Chrome or Edge. The GPU delegate is used automatically when available.
- **AI says "no key" or fails**: open Settings and press *Test connection*. 401 means a bad key, 402 means no credits, 429 means wait a moment.
- **No voice for a language**: install that language's voice in your OS. The text is still shown.
- **Mirrored the wrong way**: toggle *Mirror camera* in Settings.

## Project layout
`src/core` (camera, hand tracker, overlay, ASL rules, OpenRouter client, storage, demo answers), `src/pages` (home, draw, game, sign, settings), `src/router.js`, `src/main.js`, `scripts/setup-mediapipe.js`, `.github/workflows/deploy.yml`.

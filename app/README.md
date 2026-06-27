# Agentic OS — Frontend

React + Vite dashboard with JARVIS real-time voice conversation.

## Quick start

```bash
cd app
pnpm install   # or npm install
npm run dev    # http://localhost:3000
```

## Voice pipeline

**Default:** Conversation mode with live browser captions + Whisper final accuracy + browser TTS.

### 1. Start Whisper (final transcription)

```bash
npm run voice:whisper   # Docker on port 9000
npm run voice:check     # verify
```

### 2. Start Ollama (JARVIS brain)

```bash
ollama serve
ollama pull llama3.2   # or your preferred model
```

### 3. Optional: Voicebox fallback

Run Voicebox on `127.0.0.1:17493` with Whisper + TTS loaded. Enable in **Voice Settings** (gear in status bar).

### 4. JARVIS voice sample

Place your `jarvis-voice.wav` at:

```
app/public/voices/jarvis-voice.wav
```

Preview it in Voice Settings. For cloned JARVIS TTS, create a Voicebox profile from this file and set TTS provider to Voicebox.

## Voice Settings

Click **Voice** (gear) in the status bar to configure:

- Conversation vs push-to-talk
- Turn silence timeout
- Whisper refine toggle
- STT/TTS providers
- Browser voice, rate, pitch
- Voicebox profile name
- Service health

Settings persist in browser localStorage.

## Environment

Copy `.env.example` to `.env` for build-time defaults. Runtime overrides live in Voice Settings.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with proxies (`/whisper`, `/voicebox`, `/ollama`) |
| `npm run build` | Production build |
| `npm run voice:whisper` | Start Docker Whisper on :9000 |
| `npm run voice:check` | Health check Whisper API |

## Browser

Use **Chrome or Edge** for live speech recognition. Safari/Firefox fall back to push-to-talk + Whisper only.

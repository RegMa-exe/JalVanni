# JalVaani — Change Log

## Phase 3.1 — Safer incident analysis: verification-first actions, evidence-based severity (2026-11-10)

### Why
A real Hindi complaint was classified correctly, but the output recommended "Dispatch … immediately" for an unverified report. It also had no explanation for the severity, mixed photos in with essential questions, and showed confidence as if it were a probability.

### Changed: prompt and schema (`server/analyze.mjs`)
- **`recommended_action`** is now `{ immediate_actions[], after_verification_actions[] }`.
  - Immediate: call-back, field inspector/JE verification, SCADA cross-check, and precautionary advice. For contamination, sampling and "don't drink until tested" are also immediate.
  - Every repair, isolation or tanker step is phrased "If verified, …". Emergency escalation is allowed only as "dispatch only if authorised".
- **`severity_factors[]`** (new, enum): flooding/safety risk, supply disruption, large population, health risk, illness reported, prolonged outage.
- **`severity_rationale`** (new): a plain-English explanation of the severity that cites the transcript and says what unknowns could change it.
- **Rubric**:
  - critical = illness reported, or 3+ core factors
  - high = 2 factors, health risk, or an outage over 24 h
  - medium = 1 factor, or a burst/leak with no further information
  - low = no factors
  - The model must choose the lower level when information is insufficient.
- **`reported_duration`** (new): how long the problem has lasted, as stated, or null.
- **`missing_information`** is now `{ essential[], optional_evidence[] }`. Essential items follow a fixed priority (exact location → duration → supply impact → households). Photos, consumer number and consent go under optional evidence.
- **`confidence`** is documented as qualitative and uncalibrated.

### Added: server-side enforcement (deterministic, after JSON-schema validation)
- **Dispatch guard**: an immediate action that dispatches a repair crew or tanker, isolates a section or excavates, without verification wording, is moved to after-verification as "If verified, …". The count is reported as `guard_moved_actions`.
- **Factor cross-check**: claimed factors that the model's own fields contradict are dropped and reported in `severity_factors_dropped`.
  - `supply_disruption` requires `water_supply_impact` to be no_supply or reduced_supply.
  - `large_population` requires 50+ households or an area-wide scope.
  - `prolonged_outage` requires a stated duration.
- **Severity cap**: severity can't exceed what the remaining factors allow (`severity_adjusted` records it).
- **Illness floor**: `illness_reported` + `health_risk` always means critical.
- **Missing-info pruning**: essential items for facts that were provided (duration, supply impact, household count) are removed. Evidence items are always moved to optional.
- Timeouts raised (server 60 s, client 75 s), because analyses now take 20–35 s.

### Changed: presentation (same layout)
- `AnalysisPanel`:
  - "Why <severity>: …" rationale, plus a note when the server adjusted the severity and why.
  - Reported duration.
  - Actions in two groups: "Now — verification & precaution" and "Only after verification or authorised emergency triage" (shown greyed).
  - Missing information in two groups: "Essential — collect on call-back" and "Optional evidence".
  - "AI confidence (qualitative): Medium", with a tooltip saying it is not a probability.
- Legacy demo incidents also show qualitative confidence instead of a percentage.
- Older stored analyses (flat arrays) still render (`normaliseActions` / `normaliseMissing`).
- Fallback results use the new structure and are still labelled "Rule-based fallback".

### Fixed
- The language-mix chart listed "Hindi" twice (a leftover from the Phase 2 Rajasthani removal). The second entry is now "Hinglish", and the duplicate React key warning is gone.

### Before → after (same 7 complaints, live OpenRouter `qwen/qwen-2.5-72b-instruct`)
| # | Complaint | Severity before → after | Unconditional dispatch (before → after) | Essential missing info after |
|---|-----------|-------------------------|------------------------------|------------------------------|
| 1 | Hindi: burst, road flooded, vehicles stuck, no water 2 h | critical → **high** (model said critical with an unsupported `large_population`; the server dropped it and capped) | 2 → 0 | exact location, households |
| 2 | English: yellow, smelly water 3 days, 2 children ill | critical → **critical** (model said high; the illness floor applied) | 0 → 0; sampling and "don't drink" now immediate | exact location, households |
| 3 | Hinglish: low pressure, 3rd floor, 1 week | medium → medium | 0 → 0 | exact location, households |
| 4 | Code-mix: valve chamber leak since last night | medium → medium | 2 → 0 | exact location, supply impact, households (duration no longer listed) |
| 5 | Hindi: no supply 4 days, about 200 homes | high → high | 1 → 0 (tanker now "If verified") | exact location, reason for shutdown |
| 6 | Vague "water problem" | low → low | 0 → 0 | nature, location, duration, supply, households |
| 7 | **User's complaint**: "हमारे घर मालवीय नगर में pipeline … फट गई है और पानी बह रहा है" | high → **medium** | 2 → 0 | exact location, duration, supply impact, households |

All 7 passed on the first attempt (HTTP 200, schema-valid).

### Known limitations
- Latency rose from about 10–16 s to about 20–35 s per analysis (longer prompt and output).
- The model still sometimes claims `flooding_or_safety_risk` for water that is merely "flowing" (cases 4 and 7). Severity is unaffected there, because a burst/leak with no other information is medium anyway.
- Rationale text is written by the model and can disagree with a server adjustment. The adjustment note in the UI explains the final value.

## Phase 3 — AI incident intelligence via OpenRouter (2026-11-10)

### Summary
Transcripts are analysed by an LLM through **OpenRouter** (`POST https://openrouter.ai/api/v1/chat/completions`). The model comes from `OPENROUTER_MODEL`, never hardcoded. Output is structured JSON that the server validates. The rule-based extractor stays as a fallback and is always labelled as one. Every result requires human review. The provider is OpenRouter (this is not Gnani Evon).

### Added
- **`server/analyze.mjs`**: the analysis proxy.
  - `GET /api/analyze/status` returns the provider, the configured model, whether that model exists in the OpenRouter catalogue (with a suggested ID if it doesn't), and whether it supports structured outputs.
  - `POST /api/analyze` with `{ transcript, detectedLanguageCode? }` calls OpenRouter with `Authorization: Bearer $OPENROUTER_API_KEY` and `model: $OPENROUTER_MODEL`.
  - Structured output comes from the model's `supported_parameters` in the catalogue (cached for 1 h):
    - `structured_outputs` → `response_format: json_schema` (strict)
    - `response_format` only → `json_object`
    - neither → prompt-only JSON
    - `provider.require_parameters: true` is set whenever a response format is used.
  - The system prompt is written for Hindi, English and Hinglish. It:
    - classifies leak, burst, low pressure, shortage and contamination, plus `other` and `unclear`;
    - extracts location and landmark exactly as stated;
    - sets severity from evidence, choosing the lower level when evidence is thin;
    - lists missing information and recommends practical municipal actions;
    - must never invent facts, and must mark every citizen report as unverified.
  - Response fields: `incident_type, location, landmark, severity, description, water_supply_impact, affected_population{scope, estimated_households}, recommended_action[], missing_information[], requires_human_review, reasoning`, plus `verification_status` and `confidence`.
  - Server-side validation:
    - enums, types, non-empty strings and arrays;
    - placeholder strings like "unknown" or "none_reported" become `null`;
    - `requires_human_review` is always forced to `true`.
  - Reliability: a 45 s overall timeout, and one automatic retry when the output is invalid or empty.
  - Errors are mapped to codes: `NOT_CONFIGURED`, `MODEL_NOT_FOUND`, `INVALID_API_KEY`, `INSUFFICIENT_CREDITS`, `RATE_LIMITED`, `TIMEOUT`, `INVALID_AI_OUTPUT`, `EMPTY_TRANSCRIPT` and others.
- **`src/services/analysis.ts`**:
  - Client for the endpoint, with a 60 s timeout and cancel support.
  - `ruleBasedFallback()` wraps the existing `extractIncident()` in the same shape with `source: 'rule_based_fallback'` and the reason.
  - Display labels.
- **`src/components/analysis/AnalysisPanel.tsx`**: shared panel showing:
  - the provider, the model as served, the output mode, latency and generation ID;
  - a yellow "Rule-based fallback — not AI analysis" warning when it applies;
  - every structured field, plus the human-review notice.
- **`src/store/incidents.ts`**: shared incident store (demo data plus incidents created here, saved in localStorage). Created incidents now appear on the Dashboard, in Incident Analysis and in the sidebar count.

### Changed
- **`src/pages/VoiceReportingPage.tsx`**:
  - New header badge: `AI: OpenRouter · <model>`, or a not-configured / model-not-found warning.
  - "Analyse transcript" calls OpenRouter. While it runs, a loading state names the model and offers Cancel.
  - On any failure it falls back to the labelled rule-based result and offers **Retry AI analysis**.
  - "Create incident" saves a real incident with the analysis attached and links to it in Incident Analysis.
- **`src/pages/IncidentAnalysisPage.tsx`**:
  - Reads from the store.
  - Incidents with an analysis show the AnalysisPanel instead of the static recommendations.
  - New review banner with **Mark reviewed**, which sets `reviewed` and moves the status from New to Triaged.
- **`src/pages/DashboardPage.tsx`, `src/components/layout/AppLayout.tsx`**: read from the store.
- **`src/types/index.ts`**: new `Other` category, plus `AiIncidentAnalysis`, `AnalysisMeta` and `IncidentAnalysisRecord`.
- **`server/index.mjs`, `vite.config.ts`**: mount `/api/analyze` alongside `/api/transcribe`.
- **`.env`**: `OPENROUTER_MODEL` changed from `qwen/qwen2.5-72b-instruct` (not a valid OpenRouter ID) to `qwen/qwen-2.5-72b-instruct`, with the user's approval.
- **`.env.example`**: documents `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.

### Verified (live OpenRouter calls, model `qwen/qwen-2.5-72b-instruct`, `json_schema` mode)
| # | Complaint | Result |
|---|-----------|--------|
| 1 | Hindi (Devanagari): burst opposite Gaurav Tower, Malviya Nagar Sec 6, road flooded, no water 2h | pipe_burst · critical · no_supply · loc "Malviya Nagar Sector 6" · landmark "Gaurav Tower" |
| 2 | English: yellow, smelly water for 3 days in Pratap Nagar Sec 4, two children ill | suspected_contamination · critical · loc "Pratap Nagar Sector 4" · actions include boil-water advisory and sampling |
| 3 | Romanised Hinglish: low pressure, can't reach 3rd floor, Vaishali Nagar near Amrapali Circle, 1 week | low_pressure · medium · reduced_supply · landmark "Amrapali Circle" |
| 4 | Hindi + English code-mix: valve chamber leak near Hanuman Mandir, Raja Park, since last night | pipeline_leak · medium · landmark "hanuman mandir" (first ever run returned empty output; now retried automatically) |
| 5 | Hindi: no supply 4 days, Sanganer Ward 58, about 200 homes, no tanker | water_shortage · high · households 200 (stated by the caller) |
| 6 | Vague: "Water problem hai, please jaldi kuch karo" | unclear · low · confidence low · location null · asks for nature, location and duration |

- Every result had `verification_status: reported_unverified` and `requires_human_review: true`. All 6 passed in the final run (attempts=1, 10–16 s each).
- With the wrong model ID: the UI showed "model not found" and the rule-based fallback, labelled with the reason.
- UI end to end: Gnani transcript → operator edit → AI analysis (12.9 s) → Create incident (INC-2418) → Incident Analysis detail → Mark reviewed → status Triaged.
- Validation: an empty transcript returns 400 `EMPTY_TRANSCRIPT`; a non-JSON body returns 400 `INVALID_JSON`.
- The production bundle contains no API keys and no model ID.

### Known limitations
- Latency is 10–19 s per analysis with this model.
- The model sometimes lists something that was already stated as missing (e.g. "Since when… (already stated as four days)").
- Landmark casing follows the transcript ("hanuman mandir").
- Created incidents have no zone assigned (`zoneId` is empty), so zone correlation doesn't apply to them yet.
- Incidents are stored in browser localStorage until Prisma persistence is added.

## Phase 2 — Gnani Prisma v3.0 speech-to-text integration (2026-11-10)

### Summary
Replaced the demo transcription with real Gnani Prisma v3.0 speech-to-text through a secure server-side proxy. The UI, routing, components and styling are unchanged apart from the Voice Reporting logic.

### Added
- **`server/transcribe.mjs`**: the transcription proxy, shared by the dev and production servers.
  - `GET /api/transcribe/status` returns `{ provider, model, configured }`. It never returns the key.
  - `POST /api/transcribe?language_code=…` takes the raw audio body and the filename from the `X-Audio-Filename` header. It forwards to `POST https://api.vachana.ai/stt/v3` as multipart/form-data with:
    - `audio_file`, `model=prisma-v3.0`, `language_code`, `format=codemix`
    - header `X-API-Key-ID: $GNANI_API_KEY`
  - Validation:
    - `language_code` must be one of `hi-IN`, `en-IN`, `hi-IN,en-IN`.
    - The file extension must be wav, mp3, ogg, flac, aac or m4a.
    - Empty audio is rejected, and uploads are capped at 10 MB.
    - WAV files over 30 s are rejected (the duration is read from the WAV header).
  - Normalises Gnani's documented error shapes (`error.type`, `detail.error_code`, 422 `detail[]`, 504 `code`) into `{ error: { code, message } }`.
  - Returns 503 `NOT_CONFIGURED` when `GNANI_API_KEY` is missing.
  - Success response: `{ transcript, detectedLanguageCode, requestId, model, truncated, processingTime, roundTripMs }`.
  - Logs the `request_id`, model and language for each call. It never logs the key.
- **`server/index.mjs`**: production server (`npm start`). Serves `dist/` with an SPA fallback, plus `/api/transcribe`.
- **`src/lib/audio.ts`**:
  - `toWav16kMono()` decodes the MediaRecorder WebM/Opus recording and re-encodes it as 16 kHz mono 16-bit PCM WAV, trimmed to 30 s. WebM is not a documented Prisma format.
  - `getAudioDuration()` reads a file's duration for upload checks.
  - Constants: `MAX_AUDIO_SECONDS = 30` and the supported upload extensions.
- **`.env.example`**: template for `GNANI_API_KEY`, which stays server-side and never gets a `VITE_` prefix.
- **`.env`**: created empty, and the user added the key. It is listed in `.gitignore`.
- **`package.json`**: new `start` script, `node --env-file-if-exists=.env server/index.mjs`.

### Changed
- **`vite.config.ts`**:
  - Loads all env vars server-side with `loadEnv(mode, cwd, '')`. They are not exposed to the client.
  - Adds the `jalvaani-transcribe-api` plugin, which mounts the proxy on the dev and preview servers, so `npm run dev` stays a single command.
  - Fix: the hooks use block bodies. An arrow function that returned a value made Vite treat it as a post-hook, which crashed the dev server.
- **`src/hooks/useRecorder.ts`**:
  - Takes `maxSeconds` and auto-stops at 30 s, exposing an `autoStopped` flag.
  - `blob` is set when the recording is finalised.
  - `reset()` discards a recording still in progress.
  - The mic is requested as mono with echo cancellation and noise suppression.
- **`src/services/voice.ts`**:
  - Removed the demo adapter and its mock transcripts. There is no mock fallback.
  - Added `getTranscriptionStatus()`, `transcribeAudio()` and `TranscriptionError`.
  - Language options: Hindi + English (`hi-IN,en-IN`, the default), Hindi (`hi-IN`), English (`en-IN`).
  - `extractIncident()` is still rule-based, now with Devanagari keywords and location patterns.
- **`src/pages/VoiceReportingPage.tsx`**: same layout, new logic.
  - Header badge shows the live service status: not configured, ready, then connected after the first successful transcript. It replaces "Demo mode · speech provider not connected".
  - A red setup banner appears when `GNANI_API_KEY` is missing. Record and Upload are disabled until the key is set.
  - Rajasthani is removed from the language picker.
  - Timer shows `mm:ss / 00:30`, with an auto-stop countdown in the last 5 s.
  - When recording stops, the audio is converted to WAV, sent to `/api/transcribe` and the result is shown.
  - "Use sample call" is replaced by **Upload audio** (WAV, MP3, OGG, FLAC, AAC or M4A, up to 30 s, checked in the browser).
  - Transcript panel:
    - Loading state, then an **editable** transcript.
    - Shows the detected language, model, processing time and Gnani `request_id`, plus an "edited" marker after changes.
    - Warnings for an empty transcript (no speech) and for a truncated transcript.
    - On errors: the Gnani error code and message, with **Retry** (resends the same audio) and **Record again**.
  - Stepper: Transcribe is the active step while the user reviews or edits the transcript, and turns red on error. **Analyse transcript** moves to Understand. **Edit transcript** goes back from the review step.
- **`src/data/demo.ts`**: removed Rajasthani. INC-2416's language is now Hindi, and the language-mix chart entry is now "Hinglish".

### Verified
- `npm run build` (type-check + production build) passes.
- Without a key, the status endpoint returns `configured:false`, POST returns 503 `NOT_CONFIGURED`, and the UI shows the setup banner.
- With an invalid key, the live Gnani API returned `401 INVALID_API_KEY`, which the proxy passed through. This confirms the URL, header and multipart format.
- Validation returns 400 for an unsupported language, a `.webm` file, empty audio and a 35 s WAV (`MAX_AUDIO_DURATION_EXCEEDED`). GET returns 405.
- WebM/Opus to WAV conversion in the browser produces 16 kHz, mono, 16-bit output.
- **Real Gnani call with the user's key** returned HTTP 200:
  - transcript: "Hello, I am calling from Malviya Nagar Sector 6. A water pipeline has burst on the main road, and there has been no water supply for 2 hours."
  - `model: prisma-v3.0`, `detected_language_code: en-IN`, `request_id: 01a1c64f-56e3-7b34-a901-73d27749a3cb`, processing time 0.20 s
- UI flow:
  - Uploading the audio showed the transcript, and the badge changed to "Gnani prisma-v3.0 · connected".
  - The transcript was edited, then "Analyse transcript" returned Pipe Burst · Critical · Malviya Nagar Sector 6.
  - The temporary test file used for the upload (`public/__test_complaint.wav`) was removed afterwards.

### Known gaps
- Live microphone recording with real Hindi speech has not been tested yet. It needs a human speaker.
- The Understand step is still rule-based, not an LLM.
- Created incidents are kept only in page state and are lost on reload.

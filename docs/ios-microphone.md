# iPhone microphone audio session

Race Rush beta 0.9.2-beta.3 (2026-10-02).

The audio unlock handler forced navigator.audioSession.type = playback. WebKit rejects getUserMedia with InvalidStateError while the explicit audio category is incompatible with capture, before showing a permission prompt. The former message incorrectly assumed this error meant the page was in the background.

AudioSessionCoordinator now reserves play-and-record synchronously before native microphone permission is requested, and retains it while permission is pending and while the microphone track is open (including mute). Audio unlock respects the reservation. Stopping tracks, refusal, missing tracks or leaving the lobby releases the reservation. Cleanup is idempotent so late permission answers cannot reset a newer capture session. A separate microphone generation discards permission answers after cancelling only the microphone.

Browsers without the optional Audio Session API continue using native capture. Permission remains opt-in from the Micro button; there is no automatic retry or recording on page load. No private key, API secret, database or realtime server change.

Validation: nine targeted tests pass, including simulated WebKit playback rejection and compatible capture, subsequent unlocks, concurrent capture leases, late cleanup and unsupported API; TypeScript/Vite client build passes. These tests do not substitute for a real iPhone permission/capture check. After deployment reload the game, create or join a lobby, tap Micro and allow capture if prompted. A previously granted permission may activate Micro ON without showing another prompt.

References:
- https://github.com/WebKit/webkit/blob/main/Source/WebCore/Modules/mediastream/MediaDevices.cpp
- https://github.com/w3c/audio-session/blob/main/explainer.md

Deployment: frontend assets, app-shell.html, sw.js and version.txt only, on the existing Race Rush site. Backup before deployment: public_html/.racerush-backups/20261002-audio-session/frontend-before.tar.gz. Runtime config.js is preserved. Previous hashed assets are retained for already-open sessions.

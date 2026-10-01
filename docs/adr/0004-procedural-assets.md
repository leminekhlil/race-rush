# ADR 0004 — Procedural low-poly assets for the MVP

**Status:** accepted

**Decision.** Tracks, decor, vehicles, textures (road markings, curbs, barriers, facades, banners), audio (Web Audio synthesis) and particles are generated at runtime. No asset pipeline blocks the MVP; the visual identity (night blue, electric blue, gold) is applied consistently. `TrackDefinition` and the vehicle blueprints are the seams where GLB models and real textures will plug in.

**Consequences.** + Tiny download, instant iteration, no licensing questions. − Art is placeholder quality: final GLB vehicles, textured environments and recorded engine sounds are needed for production polish.

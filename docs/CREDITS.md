# Crédits & licences des assets

Race Rush — un jeu par **Zahra Khlil**.
Developed and deployed by Software engineering Mohamed Lemine Khlil | MATER IT.
Support : lemine@pro.mr

| Asset | Fichier(s) | Source | Licence | Adaptation |
|---|---|---|---|---|
| Sport Car (modèle 3D) | `client/public/models/sport.glb` | *Car Concept* — Khronos glTF-Sample-Assets (Eric Chadwick / Darmstadt Graphics Group, d'après un modèle public domain de "Unity Fan") | CC-BY 4.0 (modèle de base CC0) | Intérieur/essuie-glaces retirés, simplification par pièce, fusion par matériau, textures WebP 512, quantification (11,8 Mo → 1,7 Mo). Script : `tools/assets/opt-car.mjs`, `merge-car.mjs` |
| Environnements d'éclairage (IBL) | `client/public/env/*.env` | Poly Haven HDRIs (Greg Zaal) : Potsdamer Platz, Studio Small 03, Dikhololo Night, Venice Sunset, Kiara Dawn — via pmndrs/market-assets | CC0 | Préfiltrés en `.env` 128 px (`e2e/env-bake.mjs`) |
| Sons moteur, moto, dérapage, impact | `client/public/audio/*.ogg|m4a` | Kenney — Starter Kit Racing (skid : Landeplage) | CC0 | Copie AAC pour Safari |
| Motorcycle, Buggy, Monster Truck, ville, circuits, décors, textures | code (`client/src/game/scene/**`) | Originaux, générés procéduralement | Projet | — |
| Musiques (5 titres) | code (`client/src/game/audio/MusicPlayer.ts`) | Compositions originales synthétisées en temps réel | Projet | — |
| Voix de l'annonceur | synthèse vocale du navigateur (Web Speech API) | — | — | — |
| Polices Russo One, Rajdhani | `client/public/fonts` | Google Fonts | SIL OFL 1.1 | Auto-hébergées |

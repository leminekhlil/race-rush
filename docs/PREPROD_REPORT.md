# RACE RUSH — PREPRODUCTION REPORT (v0.9.0-preprod)

| | |
|---|---|
| URL cible | https://racerush.pro.mr/ (pas encore déployé : installation manuelle par le propriétaire via hPanel) |
| Dépôt | https://github.com/leminekhlil/race-rush |
| Version | branche `release/v0.9.0-preprod` = commit `d2a9906` (aussi sur `main`). Le tag `v0.9.0-preprod` n'a pas pu être poussé (le proxy git de la session refuse les tags) : le créer depuis GitHub sur `d2a9906` si besoin |
| Paquet | `racerush-hostinger-0.9.0-preprod.zip` (23 Mo) |
| SHA-256 | `aaf22ab29db09b1236e51490ad75f0bc48f7f50281ccef6a0ff19ac7d14e53a2` |
| Généré par | `scripts/build-hostinger.sh` (reproductible) |
| Instructions | `DEPLOY_HOSTINGER.md` (dans le ZIP et dans `deploy/hostinger/`) |

## Déploiement
- **SSH** : non utilisé. La session cloud n'a ni la clé ni l'accès réseau à Hostinger ; la clé privée n'a jamais été lue, copiée ni demandée.
- **Disposition** : `ZIP/public_html/*` → `public_html/` (racine du domaine) ; `ZIP/racerush-app/` → **à côté** de `public_html` ;
  `database/race_rush.sql` → phpMyAdmin (base vide). Le domaine pointe sur `public_html/` (pas sur un dossier `public/`).
- **Prérequis** : PHP 8.3+ (Laravel 13), MySQL 8 / MariaDB 10.6+, SSL actif.
- **Configuration** : `racerush-app/.env` à créer depuis `.env.example` (identifiants DB + `APP_KEY`). Aucun secret dans le paquet ni dans le dépôt.
- **Rollback** : sauvegarde zip de `public_html` + renommage `racerush-app-prev` + export SQL (§3 et §10 du guide).

## Installation propre simulée (avant livraison)
Apache 2.4 + mod_php 8.3 + `.htaccess` du paquet, dossier `websites/<site>/public_html` + `racerush-app` voisin, base
MariaDB 10.11 neuve importée depuis le `.sql`, `.env` créé depuis `.env.example`, `php artisan key:generate`.

| Vérification | Résultat |
|---|---|
| `/`, `/version.txt`, `/api/health`, `/api/catalog`, routes SPA (`/garage`, `/lobby`) | 200 |
| `/racerush-app/.env`, `/.htaccess`, accès direct à `/laravel-api.php` | 403 |
| Fichier statique manquant (`/assets/x.js`, `/models/x.glb`) | 404 réel (pas de index.html) |
| Types MIME `.glb` / `.ibl` / `.m4a` / `.js` | corrects ; gzip actif |
| Cache | assets hashés 1 an immutable ; `index.html`, `sw.js`, `config.js` no-cache |
| En-têtes | nosniff, Referrer-Policy, X-Frame-Options, `Permissions-Policy: microphone=(self)` |
| Parcours navigateur (`e2e/hostinger-smoke.mjs`) | intro → compte invité (+500 v-MRU) → son débloqué au 1er toucher → achat amélioration (500 → 350) → multijoueur/voice masqués proprement → course offline 3D → **0 erreur HTTP, 0 erreur console, service worker actif** |
| Serveur temps réel embarqué (`realtime-server/server.mjs`) | démarre, `/health` OK |

## Graphismes
- Avant : véhicules procéduraux simples. Après : Sport Car GLB PBR (reflets IBL), Moto/Buggy/Monster lissés, City enrichie, mode nuit, post-traitement léger (désactivable en ECO).
- Corrigé dans cette version : la voiture du garage n'apparaissait pas en build de production (effets React enfants exécutés avant le montage de la scène).

## Audio
- AudioManager central : un seul AudioContext, bus master / moteurs / effets / musique / voix, mute global, volumes séparés, déverrouillage au premier geste (Chrome, Safari, iOS : touchend/click, élément audio silencieux, `audioSession`), suspension quand l'onglet est caché.
- Bouton 🔊 (« Touchez pour activer le son » tant que le navigateur bloque l'audio).
- Testé sans flag d'autoplay : contexte `running` + musique après le premier clic.

## Voice chat
| | |
|---|---|
| Implémentation | WebRTC P2P mesh (2–5 joueurs), Opus, abstraction `VoiceTransport` (SFU possible plus tard) |
| Signalisation | WebSocket du serveur temps réel, relayée uniquement entre membres du même salon ayant activé le voice |
| Micro | opt-in explicite (🎤), coupure immédiate, pistes arrêtées à la sortie du salon / désactivation / fermeture |
| UI | 🔊 Voice / 🎤 Micro / couper mon micro / couper un joueur / volume des voix / indicateur de parole (salon + course) |
| Erreurs | permission refusée, aucun micro, micro occupé, serveur indisponible → messages clairs |
| Ducking | musique et moteurs baissés quand quelqu'un parle |
| TURN | prêt (identifiants éphémères coturn générés côté serveur, aucun secret dans le frontend), non configuré |
| Tests | 2 navigateurs + micro simulé : connexion P2P, lecture distante, indicateur, mute local, self-mute, nettoyage, permission refusée — OK |
| Sur Hostinger mutualisé | **indisponible** tant que le serveur temps réel n'est pas déployé sur un VPS (masqué proprement) |

## Gameplay
- Solo offline vs 4 bots (City/Desert), garage et économie v-MRU validés par l'API : OK sur le paquet.
- Multijoueur, récompenses serveur, revanche : OK en local avec le serveur temps réel (`e2e/mvp-loop.mjs`, `e2e/multiplayer-ui.mjs`).

## Performance
- JavaScript initial : **965 Ko → 602 Ko gzip (−38 %)** grâce au découpage de Babylon (shaders et modules chargés à la demande).
- Paquet : `public_html` 11 Mo (modèle GLB, cartes d'environnement, audio, polices).
- FPS : les mesures de ce conteneur utilisent un rendu logiciel (SwiftShader, 7–10 FPS) et ne sont pas représentatives. Mesure réelle à faire sur `https://racerush.pro.mr/` (Paramètres → Afficher les FPS ; profils ECO / STANDARD / HIGH).

## Tests navigateur
Chromium (Playwright) : desktop + viewport mobile tactile. Tests automatisés : typecheck 3 paquets, 18 tests shared, 3 tests realtime (dont signalisation voice), 19 tests backend (126 assertions), E2E audio, voice, MVP online, multijoueur, smoke Hostinger.
Non testés ici : Safari iOS, Firefox, Android réel, voice entre deux réseaux distincts (NAT réels).

## Limitations connues
- Hébergement mutualisé : pas de processus Node persistant → multijoueur, récompenses de course et voice chat désactivés tant qu'un VPS n'héberge pas `realtime-server` (`deploy/realtime/README.md`).
- iOS ignore `volume` sur les éléments audio : le volume des voix suit les boutons du téléphone (le mute fonctionne).
- Voice sans TURN : certains NAT stricts empêcheront la connexion P2P.
- Captures du domaine public non réalisables depuis la session (déploiement manuel en attente) : captures prises sur l'installation simulée.

## Dette technique
- Passe de finition véhicules / caméra / ville (D4) non faite dans ce lot.
- Tag Git `v0.9.0-preprod` à créer côté GitHub.

## Prochaine étape
1. Déployer le ZIP sur racerush.pro.mr (guide) et vérifier la checklist §9.
2. Petit VPS + `realtime-server` + coturn → multijoueur, récompenses et voice en ligne.
3. Mesures FPS sur mobiles réels, passe de finition graphique.

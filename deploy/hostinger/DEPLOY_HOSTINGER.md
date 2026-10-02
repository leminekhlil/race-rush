# Race Rush — Déploiement Hostinger (préproduction `https://racerush.pro.mr/`)

Installation **manuelle** via le Gestionnaire de fichiers hPanel + phpMyAdmin. Rien à compiler sur le serveur :
le frontend est déjà buildé et les dépendances PHP de production sont incluses.

---

## 1. Contenu du ZIP

```
racerush-hostinger-<version>/
├── public_html/          ← CONTENU à copier DANS le public_html du domaine (racine web)
│   ├── index.php, app-shell.html, assets/, models/, env/, audio/, fonts/, app-icons/, sw.js, manifest.webmanifest
│   ├── config.js         ← configuration runtime (URL du serveur temps réel), modifiable sans rebuild
│   ├── laravel-api.php   ← contrôleur Laravel appelé par index.php pour /api/*
│   ├── .htaccess         ← HTTPS, SPA, API, types MIME, cache, en-têtes de sécurité (fichier caché !)
│   └── version.txt
├── racerush-app/         ← Application Laravel (API) : à placer À CÔTÉ de public_html, JAMAIS dedans
│   ├── app/ bootstrap/ config/ database/ routes/ storage/ vendor/ artisan
│   ├── .env.example      ← modèle à copier en .env puis compléter
│   └── .htaccess         ← refus total (sécurité si le dossier était exposé par erreur)
├── database/race_rush.sql   ← schéma + catalogue + historique des migrations (aucune donnée joueur)
├── realtime-server/      ← OPTIONNEL, pour un VPS (multijoueur, récompenses, signalisation voice) — voir §8
├── DEPLOY_HOSTINGER.md
└── VERSION.txt
```

### Disposition cible sur le serveur

```
/home/u535953249/websites/gM8HrNatJ/        ← dossier du site (à vérifier dans le Gestionnaire de fichiers)
├── public_html/        ← racine du domaine racerush.pro.mr = contenu de  ZIP/public_html/
└── racerush-app/       ← contenu de ZIP/racerush-app/  (non accessible en HTTP)
```

- Le domaine pointe **directement sur `public_html/`** (configuration Hostinger par défaut). **Ne pas** faire pointer
  le domaine vers `racerush-app/public` : ce dossier n'existe pas dans le paquet, le point d'entrée est
  `public_html/index.php`.
- `laravel-api.php` cherche l'application dans `../racerush-app` (recommandé). Si le Gestionnaire de fichiers ne
  vous permet pas d'écrire à côté de `public_html`, il accepte aussi `public_html/racerush-app/` en secours : configurer alors hPanel sur le sous-dossier public décrit dans la section HWS ci-dessous.

---

## 2. Prérequis

| Élément | Exigence |
|---|---|
| PHP | **8.3 ou 8.4** (Laravel 13). hPanel → *Avancé* → *Configuration PHP* → version 8.3+ |
| Extensions PHP | pdo_mysql, mbstring, openssl, tokenizer, xml, ctype, fileinfo, json, bcmath (actives par défaut chez Hostinger) |
| Base de données | MySQL 8 ou MariaDB 10.6+, utf8mb4 |
| HTTPS | Certificat SSL actif sur racerush.pro.mr (hPanel → *Sécurité* → *SSL*) — le `.htaccess` force HTTPS |
| Espace disque | ~60 Mo |

---

## 3. Sauvegarde AVANT tout remplacement (rollback possible)

1. Gestionnaire de fichiers → ouvrir le dossier du site → vérifier que `public_html` contient bien un ancien
   Race Rush (ou une page par défaut Hostinger) et **rien d'autre** à conserver.
2. Clic droit sur `public_html` → *Compresser* → `backup-public_html-AAAAMMJJ.zip` → déplacer l'archive à côté de
   `public_html` (pas dedans).
3. Si `racerush-app/` existe déjà : le **renommer** en `racerush-app-prev`.
4. Si une base Race Rush existe déjà : phpMyAdmin → *Exporter* → enregistrer le `.sql`.

---

## 4. Base de données

1. hPanel → *Bases de données* → *Bases MySQL* → créer :
   base `u535953249_racerush`, utilisateur `u535953249_racerush`, mot de passe fort (noter les 3 valeurs).
2. *phpMyAdmin* → sélectionner la base (vide) → *Importer* → `database/race_rush.sql` → *Exécuter*.
3. Vérifier : 24 tables, dont `users`, `vehicles` (4 lignes), `cosmetics` (14), `player_vehicles`,
   `wallet_transactions`, `races`, `race_results`, `personal_access_tokens`, `migrations` (6).

---

## 5. Fichiers

1. Téléverser le ZIP dans le dossier du site (à côté de `public_html`) puis *Extraire*.
2. Copier **le contenu** de `racerush-hostinger-<version>/public_html/` dans `public_html/`
   (vider d'abord l'ancien contenu après la sauvegarde §3). Activer l'affichage des fichiers cachés pour vérifier
   que **`.htaccess`** est bien présent dans `public_html/`.
3. Déplacer `racerush-hostinger-<version>/racerush-app/` à côté de `public_html/` (nom exact : `racerush-app`).
4. Supprimer ensuite le dossier extrait et le ZIP (ne pas les laisser sur le serveur).

---

## 6. Configuration `.env` (API)

1. Dans `racerush-app/` : copier `.env.example` → `.env`, puis éditer :
   - `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` : valeurs du §4 (`DB_HOST=localhost`).
   - `APP_URL=https://racerush.pro.mr`, `APP_ENV=production`, `APP_DEBUG=false` (déjà renseignés).
   - `APP_KEY` : **obligatoire**, à générer une seule fois :
     - par SSH : `cd ~/websites/gM8HrNatJ/racerush-app && php artisan key:generate --force`
       (si `php -v` < 8.3 en SSH : utiliser `/opt/alt/php83/usr/bin/php artisan key:generate --force`) ;
     - ou sans SSH : sur votre ordinateur `openssl rand -base64 32`, puis `APP_KEY=base64:<résultat>`.
   - `RACERUSH_REALTIME_SECRET` : laisser **vide** tant qu'aucun serveur temps réel n'est déployé (§8).
2. Le fichier `.env` ne doit jamais être partagé, commité, ni placé dans `public_html`.

---

## 7. Permissions

PHP s'exécute sous votre utilisateur Hostinger : les permissions standard suffisent.

| Chemin | Permission |
|---|---|
| dossiers | 755 |
| fichiers | 644 |
| `racerush-app/.env` | 600 (ou 640) |
| `racerush-app/storage/` et `racerush-app/bootstrap/cache/` (récursif) | 755 — doivent être inscriptibles |

Aucune tâche cron ni file d'attente n'est requise (`QUEUE_CONNECTION=sync`).

---

## 8. Temps réel, WebSocket, WebRTC — limitations de l'hébergement mutualisé

- Ce déploiement **PHP/HWS** ne fournit pas le processus Node.js persistant ni les connexions WebSocket
  entrantes nécessaires au serveur de course (voir `deploy/realtime/README.md` pour les autres offres). Le paquet est donc livré avec `config.js` → `realtimeUrl: ''` :
  - ✅ fonctionnent : jeu complet en solo (course contre 4 bots, City + Desert), garage 3D, achats/améliorations
    avec la monnaie virtuelle v-MRU (validés par l'API Laravel), comptes invités, audio, PWA/hors ligne ;
  - ⛔ désactivés proprement (message « bientôt disponibles ») : création/rejoindre une partie multijoueur,
    **chat vocal** (la signalisation WebRTC passe par le serveur temps réel), et **récompenses de course** (XP/v-MRU
    attribués uniquement par le serveur à partir de la course validée — jamais par le client).
- Pour activer multijoueur + récompenses + voice : déployer `realtime-server/` sur un petit VPS (voir
  `realtime-server/README.md`), puis `public_html/config.js` → `realtimeUrl: 'wss://rt.racerush.pro.mr/ws'` et
  le même secret dans `racerush-app/.env` (`RACERUSH_REALTIME_SECRET`). Aucun rebuild nécessaire.
- **TURN** : non fourni. Le voice chat utilise STUN public ; derrière certains NAT stricts (réseaux d'entreprise,
  certains opérateurs mobiles) un serveur TURN (coturn) sera nécessaire — ses identifiants sont générés côté serveur
  temps réel et expirent ; aucun identifiant TURN permanent dans le frontend.

---

## 9. Vérifications après déploiement

| Test | Attendu |
|---|---|
| `https://racerush.pro.mr/version.txt` | version + commit du paquet |
| `https://racerush.pro.mr/api/health` | `{"ok":true,"service":"race-rush-api",...}` |
| `https://racerush.pro.mr/api/catalog` | JSON véhicules / peintures / améliorations |
| `http://racerush.pro.mr/` | redirection 301 vers HTTPS |
| `https://racerush.pro.mr/racerush-app/.env` et `/.htaccess` | 403 / 404 (jamais le contenu) |
| `https://racerush.pro.mr/models/sport.glb`, `/env/city-day.ibl`, `/audio/engine.m4a` | 200 |
| Accueil | intro cinématique, logo puis « par Zahra Khlil », signature en bas |
| Son | toucher l'écran → musique ; bouton 🔊 en bas à gauche (muet / actif) |
| Pseudo → GO | compte invité créé (+500 v-MRU) |
| Jouer → Course rapide | course offline vs 4 bots, sons moteur/freins, fin de course |
| Garage | Sport Car 3D, achat d'une amélioration (solde mis à jour) |
| Mobile | paysage, commandes tactiles, ECO/STANDARD/HIGH dans Paramètres |

Erreurs JSON possibles de `/api/health` : `php_version` (passer en PHP 8.3+), `backend_missing` (dossier
`racerush-app` mal placé), `backend_not_configured` (`.env` absent). Une erreur 500 : vérifier `APP_KEY` et les
identifiants DB, puis `racerush-app/storage/logs/laravel-AAAA-MM-JJ.log`.

---

## 10. Rollback

1. Vider `public_html/`, y extraire `backup-public_html-AAAAMMJJ.zip`.
2. Renommer `racerush-app` → `racerush-app-failed`, puis `racerush-app-prev` → `racerush-app`.
3. Si la base a été modifiée : phpMyAdmin → supprimer les tables → importer la sauvegarde `.sql` du §3.
4. Vider le cache du navigateur / désinstaller la PWA si l'ancienne version reste affichée (service worker).

## 11. Mises à jour suivantes

Même procédure ; si une nouvelle migration est livrée, l'appliquer par SSH :
`cd ~/websites/gM8HrNatJ/racerush-app && php artisan migrate --force` (le paquet SQL ne sert qu'à une base vide).

Support : lemine@pro.mr


## Hostinger HWS : entrée PHP (correctif du 2 octobre 2026)

HWS peut ignorer les règles Apache du `.htaccess`. Si `index.html` reste à la racine,
les GET `/api/*` peuvent recevoir le HTML de la SPA et les POST un 405. Le paquet
utilise désormais `index.php` comme seul index et conserve le frontend dans
`app-shell.html`. `index.php` transmet les URI `/api/*` inchangées à Laravel et
sert la SPA pour les autres pages. Ne pas remettre `index.html` à côté de
`index.php`. Les appels du frontend restent `./api` ; aucun fallback par query
string ni changement du bundle n'est nécessaire.

Sur Apache/LiteSpeed, le `.htaccess` doit également cibler `index.php`. L'accès
direct à `laravel-api.php` est refusé par PHP, même sans rewrite. Le service worker
renouvelle ses caches et précharge la racine plutôt que `index.html`.

Si le backend est dans `public_html/racerush-app` et que le parent du site est
non inscriptible, mettre les seuls fichiers publics dans `public_html/public`,
puis définir le Public directory de hPanel sur `public`. Le contrôleur trouve
alors Laravel dans `../racerush-app`. Garder archives, sauvegardes, logs et `.env`
hors de ce dossier public : les protections `.htaccess` ne suffisent pas sur HWS.

Une fois le routage réparé, une erreur MySQL 1045 est un problème distinct :
vérifier les identifiants `.env`, sans réimporter la base ni régénérer APP_KEY.
Validation minimale : health/catalog 200 JSON, guest 201, `/me` authentifié 200,
guest sans nom 422, contrôleur PHP direct 403 et backend/archives inaccessibles.

# CLAUDE.md — Dashboard Plongée

Contexte permanent pour les sessions Claude Code sur ce dépôt.

---

## Architecture

```
dashboard-plongee/
├── frontend/     React 18 + Vite + TypeScript + Tailwind CSS
├── backend/      Node 20 + Express + TypeScript
├── satellite/    Job Python quotidien — Copernicus Marine
├── data/         Persistance JSON (équipement + satellite_clarity.json)
├── docker-compose.yml
└── .env          Clés API — jamais commitées
```

### Services Docker sur le réseau bridge `plongee-net`

| Service | Image base | Port exposé | Rôle |
|---------|-----------|-------------|------|
| `frontend` | `nginx:alpine` | `3080:80` | Sert le SPA, proxifie `/api/` |
| `backend` | `node:20-alpine` | interne `:3001` | API REST, accès aux données externes |
| `satellite-clarity` | `python:3.11-slim` | — | Job cron quotidien 04h00 UTC, écrit `data/satellite_clarity.json` |

### Proxy nginx

Toutes les requêtes `/api/*` sont proxifiées par nginx vers `http://backend:3001`.
Le frontend n'utilise **que des chemins relatifs** (`/api/weather`, `/api/tides`…) — aucune URL absolue hardcodée côté client.

Exception : la recherche de lieu appelle directement `geocoding-api.open-meteo.com` depuis le navigateur (pas de proxy, pas de clé).

---

## Variables d'environnement (fichier `.env` à la racine)

| Variable | Service | Obligatoire | Description |
|---|---|---|---|
| `MAREE_API_KEY` | backend | Oui | Clé api-maree.fr — créer un compte sur https://api-maree.fr |
| `COPERNICUS_USER` | satellite-clarity | Non* | Identifiant compte Copernicus Marine Service |
| `COPERNICUS_PASSWORD` | satellite-clarity | Non* | Mot de passe Copernicus Marine Service |

*Sans les variables Copernicus, le service `satellite-clarity` ne démarre pas mais le backend fonctionne (bascule sur le modèle calculé ou la climatologie).

Compte Copernicus Marine : https://marine.copernicus.eu (gratuit)

---

## Sources de données externes

| Source | Appelant | Clé requise | Cache | Repli |
|--------|----------|-------------|-------|-------|
| Open-Meteo atmosphérique | backend · `weatherService.ts` | non | 10 min | Mock déterministe (`isMock: true`) |
| Open-Meteo marine | backend · `weatherService.ts` | non | 10 min | Inclus dans le mock |
| api-maree.fr (Ifremer) | backend · `tidesService.ts` | `MAREE_API_KEY` | 6 h | Aucun — erreur propagée à l'UI |
| Hub'Eau hydrométrie | backend · `clarityService.ts` | non | 7 j (station), 24 h (résultat) | Climatologie Orne H1422510 |
| Copernicus Marine (satellite) | job Python · `satellite/fetch_clarity.py` | `COPERNICUS_USER` + `COPERNICUS_PASSWORD` | fichier JSON 24 h | Modèle calculé ou climatologie |
| Open-Meteo géocodage | frontend direct | non | — | Aucun (appel UI uniquement) |

**Marine limité à 7 jours.** Au-delà, le score bascule automatiquement en mode partiel /45 (vent + clarté uniquement).

---

## Clarté de l'eau — hiérarchie des sources

```
satellite_clarity.json (< 3 jours)
  └── KD490 / ZSD → Kd   confiance ≥ 0.60
       ↓ absent ou trop vieux
modèle calculé (clarityService.ts)
  └── Orne + houle + phytoplancton   confiance ~0.50-0.85
       ↓ Hub'Eau indisponible
climatologie mensuelle seule          confiance 0.30
```

**Note CHL/SPM** : en Manche orientale (eaux turbides), la chlorophylle
satellite est biaisée par les sédiments et la CDOM. Seuls ZSD et KD490
alimentent le Kd quantitatif ; CHL et SPM servent uniquement à afficher
la cause probable (bloom vs sédiment).

---

## Module de scoring

Toutes les valeurs numériques du modèle (pondérations, seuils, paliers)
sont dans **`frontend/src/scoring/model.ts`** — unique source de vérité.
`computeDivability()` dans `frontend/src/utils/scoring.ts` est la seule implémentation.

---

## Palette Tailwind custom

Les couleurs `navy` et `ocean` sont pilotées par des **CSS variables** pour permettre le thème clair/sombre dynamique.

```
navy-600 → navy-950   (fond, surfaces, bordures)
ocean-400 → ocean-900 (accent primaire — bleu-teal)
coral     #ff6b6b     (accent secondaire — alertes)
seafoam   #48cae4     (accent tertiaire — highlights)
```

Valeurs RGB définies dans `frontend/src/index.css` sous `:root` (dark) et `html.light` (light).

---

## Commandes utiles (NAS)

```bash
# Déploiement complet
cd /volume1/docker/dashboard-plongee
git pull && sudo docker compose up -d --build

# Frontend seul (pas de changement backend)
sudo docker compose up -d --build frontend

# Backend seul
sudo docker compose up -d --build backend

# Job satellite manuel (pour tester)
sudo docker compose run --rm satellite-clarity python /app/fetch_clarity.py

# Voir les logs satellite
sudo docker compose logs satellite-clarity

# Rebuild après ajout des variables Copernicus dans .env
sudo docker compose up -d --force-recreate satellite-clarity
```

---

## Branche de développement

Branche active : `claude/eager-ptolemy-dcJIj`

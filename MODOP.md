# Mode opératoire — Dashboard Plongée

## Vue d'ensemble

Application web personnelle de dashboard de plongée, déployée sur un NAS Synology via Docker.
Stack : **React + Vite + TypeScript + Tailwind CSS** (frontend) / **Node.js + Express + TypeScript** (backend).

---

## 1. Architecture

```
dashboard-plongee/
├── frontend/          React + Vite + Tailwind
├── backend/           Node.js + Express
├── docker-compose.yml
└── .env               (clés API — jamais commitées)
```

**Sources de données :**
| Donnée | Source | Clé API |
|--------|--------|---------|
| Météo & marine | Open-Meteo (gratuit, sans clé) | — |
| Marées (hauteurs, PM/BM) | api-maree.fr (Ifremer/PREVIMER) | `MAREE_API_KEY` |
| Géocodage lieux | Open-Meteo Geocoding (gratuit) | — |

---

## 2. Flux de développement

### Modifier le code (depuis Claude Code ou en local)

1. Les modifications sont commitées sur la branche de travail et **pushées sur GitHub**
2. Sur le NAS, on **pull** puis on **rebuild** le conteneur modifié

### Déployer sur le NAS (via SSH)

```bash
# Connexion (depuis n'importe où, pas besoin d'être sur le même réseau)
ssh maxsandman@maxsandman.synology.me -p 22

# Se placer dans le projet
cd /volume1/docker/dashboard-plongee

# Récupérer les dernières modifications
git pull

# Rebuilder et redémarrer le conteneur concerné
sudo docker compose up -d --build frontend   # si modif frontend
sudo docker compose up -d --build backend    # si modif backend
sudo docker compose up -d --build           # si les deux

# Vérifier les logs en direct
sudo docker compose logs backend --tail=50 -f
sudo docker compose logs frontend --tail=20
```

**URL du dashboard :** `http://maxsandman.synology.me:3080`

---

## 3. Configuration des clés API

Les clés sont dans le fichier `.env` à la racine du projet sur le NAS, **jamais dans le code ni dans Git**.

```bash
# Créer ou éditer le .env
nano /volume1/docker/dashboard-plongee/.env
```

Contenu type :
```
MAREE_API_KEY=ta_clé_api_maree_ici
```

Le `docker-compose.yml` référence la variable :
```yaml
environment:
  - MAREE_API_KEY=${MAREE_API_KEY}
```

Après modification du `.env`, forcer la recréation du conteneur :
```bash
sudo docker compose up -d --force-recreate backend
```

Vérifier que la clé est bien injectée :
```bash
sudo docker compose exec backend printenv MAREE_API_KEY
```

---

## 4. Obtenir les clés API

### api-maree.fr (marées Ifremer/PREVIMER)
1. S'inscrire sur **api-maree.fr**
2. Récupérer la clé dans le tableau de bord
3. L'ajouter dans `.env` → `MAREE_API_KEY=...`
4. Rebuilder le backend

> ⚠️ La clé transite dans les URLs côté backend uniquement — elle n'est jamais exposée au navigateur.

---

## 5. Fonctionnalités principales

| Fonctionnalité | Détail |
|---|---|
| Barre de jours (15j) | Tuiles avec score plongeabilité, vent, temp, coefficient — compacte au scroll |
| Indice de plongeabilité | Score /100, facteurs vent/vagues/marée/météo, fiabilité prévision |
| Meilleur créneau du jour | Fenêtres d'étale ±45 min autour des PM/BM |
| Widget Marées | Marégramme, règle des douzièmes, seuil de hauteur, lever/coucher soleil, phase de lune |
| Tableau horaire | Vue résumé / tableau 24h coloré / graphiques Recharts |
| Unités | kt ou km/h / °C ou °F — sélecteur en haut, persisté |
| Mode clair/sombre | Toggle ☀/🌙, persisté en localStorage |
| Recherche de lieu | Autocomplétion avec debounce, sélection explicite — pas de résolution aveugle |
| Favoris | Étoile ⭐ sur le lieu courant, puces cliquables, persisté en localStorage |

---

## 6. Dépannage courant

| Symptôme | Cause probable | Solution |
|---|---|---|
| Marées indisponibles | `MAREE_API_KEY` absente ou mal injectée | Vérifier `.env` + `--force-recreate backend` |
| `printenv MAREE_API_KEY` vide | Conteneur non recréé | `sudo docker compose up -d --force-recreate backend` |
| Conteneur ne rebuild pas | `up -d` sans `--build` utilise l'ancienne image | Toujours ajouter `--build` après un `git pull` |
| La variable d'env n'est pas lue | Elle n'est pas déclarée dans `docker-compose.yml` | Vérifier la section `environment:` du service |
| Frontend affiche une erreur API | Backend non démarré ou port 3001 bloqué | `sudo docker compose ps` + logs backend |

---

## 7. Notes importantes

- **Ne jamais hardcoder de clé API** dans le code source — toujours via variables d'environnement
- **Le coefficient de marée est estimé** (non officiel SHOM) — lien vers `maree.shom.fr` pour la valeur officielle
- **Les marées sont fixes sur Ouistreham** (port de plongée cible) — changer de lieu affecte météo et marine, pas les marées
- **Portainer CE** ne permet pas de rebuilder une image — SSH reste nécessaire pour les déploiements
- **SSH fonctionne à distance** — pas besoin d'être sur le même réseau Wi-Fi que le NAS

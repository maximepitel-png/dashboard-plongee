#!/usr/bin/env python3
"""
fetch_clarity.py — Job quotidien Copernicus Marine
===================================================
Télécharge ZSD, KD490, SPM et CHL pour un petit carré au large d'Ouistreham
depuis le produit Atlantique côtier (300 m, quasi temps réel).

Produit : OCEANCOLOUR_ATL_BGC_L3_NRT_009_111
  https://data.marine.copernicus.eu/product/OCEANCOLOUR_ATL_BGC_L3_NRT_009_111

Exécuté une fois par jour (via cron dans le conteneur) ; écrit
./data/satellite_clarity.json et se termine.
Le backend Node.js lit ce fichier — il ne dépend jamais de la disponibilité
de l'API au moment du rendu.

Variables d'environnement requises :
  COPERNICUS_USER       Identifiant compte Copernicus Marine
  COPERNICUS_PASSWORD   Mot de passe (ou token API Copernicus)

Zone d'extraction :
  Centre à ~2 km au large d'Ouistreham (49.300°N, -0.250°E).
  Carré ±0.03° (~3.3 km) pour capturer un signal offshore fiable
  et éviter les pixels côtiers contaminés.

Note sur la fiabilité des variables :
  En eaux côtières turbides (Manche orientale), CHL est biaisée vers le haut
  par la réflectance des sédiments et de la matière organique colorée.
  Seuls ZSD et KD490 alimentent le calcul de Kd ; CHL et SPM servent
  uniquement à attribuer la cause (bloom vs sédiment) pour l'affichage.
"""

import json
import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OUTPUT_FILE = Path(os.environ.get("DATA_DIR", "/app/data")) / "satellite_clarity.json"

COPERNICUS_USER     = os.environ.get("COPERNICUS_USER", "")
COPERNICUS_PASSWORD = os.environ.get("COPERNICUS_PASSWORD", "")

# Produit Copernicus Marine — Atlantique côtier (300 m, NRT)
DATASET_ID  = "cmems_obs-oc_atl_bgc-transp_nrt_l3-300m_P1D"
PRODUCT_ID  = "OCEANCOLOUR_ATL_BGC_L3_NRT_009_111"

# Variables à extraire
VARIABLES = ["ZSD", "KD490", "SPM", "CHL"]

# Carré centré à 2-3 km au large d'Ouistreham
# Le site de plongée est à 49.277°N, -0.246°E
# On décale légèrement vers le nord (offshore) pour éviter les pixels côtiers
BBOX = {
    "minimum_longitude": -0.28,
    "maximum_longitude": -0.22,
    "minimum_latitude":  49.28,
    "maximum_latitude":  49.33,
}

# Nombre de jours passés à récupérer (pour la mémoire exponentielle)
LOOKBACK_DAYS = 3

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def nanmedian_safe(arr) -> float | None:
    """Médiane ignorant les NaN ; None si tableau vide ou tout NaN."""
    if arr is None or len(arr) == 0:
        return None
    val = float(np.nanmedian(arr))
    return None if np.isnan(val) else val


def kd_from_zsd(zsd_m: float) -> float:
    """Kd490 estimé depuis ZSD via la relation de Lee et al. (2015) : Kd ≈ 1.49 / ZSD."""
    if zsd_m <= 0:
        return 0.5
    return 1.49 / zsd_m


def classify_cause(chl: float | None, spm: float | None) -> str:
    """
    Attribue la cause principale de turbidité pour l'affichage.
    CHL et SPM sont peu fiables en absolu en eaux côtières turbides ;
    on les utilise seulement pour le rapport relatif.
    """
    if chl is None and spm is None:
        return "inconnu"
    if chl is None:
        return "sédiment" if (spm or 0) > 5 else "turbidité faible"
    if spm is None:
        return "bloom" if chl > 3 else "turbidité faible"
    if spm > 10:
        return "sédiment"
    if chl > 5:
        return "bloom"
    if spm / max(chl, 0.1) > 3:
        return "sédiment"
    return "bloom" if chl > 2 else "turbidité faible"

# ---------------------------------------------------------------------------
# Fetch Copernicus
# ---------------------------------------------------------------------------

def fetch_copernicus() -> list[dict]:
    """
    Télécharge les données du produit Copernicus et retourne une liste de points
    [{ time, kd490, kd_from_zsd, zsd, chl, spm, cause, n_pixels }].
    """
    import copernicusmarine  # import tardif — dépendance lourde

    if not COPERNICUS_USER or not COPERNICUS_PASSWORD:
        raise RuntimeError("COPERNICUS_USER et COPERNICUS_PASSWORD sont requis")

    date_end   = datetime.now(timezone.utc).date()
    date_start = date_end - timedelta(days=LOOKBACK_DAYS)

    log.info("Téléchargement %s du %s au %s", DATASET_ID, date_start, date_end)

    ds = copernicusmarine.open_dataset(
        dataset_id  = DATASET_ID,
        variables   = VARIABLES,
        username    = COPERNICUS_USER,
        password    = COPERNICUS_PASSWORD,
        start_datetime = str(date_start),
        end_datetime   = str(date_end),
        **BBOX,
    )

    results = []
    for t in ds.time.values:
        ts = str(t)[:10]  # YYYY-MM-DD
        try:
            day = ds.sel(time=t)

            # Extraction des médianes spatiales sur le carré
            kd490_arr = day["KD490"].values.flatten() if "KD490" in day else None
            zsd_arr   = day["ZSD"].values.flatten()   if "ZSD"   in day else None
            chl_arr   = day["CHL"].values.flatten()   if "CHL"   in day else None
            spm_arr   = day["SPM"].values.flatten()   if "SPM"   in day else None

            kd490_med = nanmedian_safe(kd490_arr)
            zsd_med   = nanmedian_safe(zsd_arr)
            chl_med   = nanmedian_safe(chl_arr)
            spm_med   = nanmedian_safe(spm_arr)

            # Nombre de pixels valides (non NaN)
            n_pixels = int(np.sum(~np.isnan(kd490_arr))) if kd490_arr is not None else 0

            # Kd composite : préférence à KD490 direct ; fallback sur ZSD
            kd_composite = kd490_med
            kd_source = "KD490"
            if kd_composite is None and zsd_med is not None:
                kd_composite = kd_from_zsd(zsd_med)
                kd_source = "ZSD"

            results.append({
                "date":       ts,
                "kd490":      kd490_med,
                "kd_from_zsd": kd_from_zsd(zsd_med) if zsd_med else None,
                "kd":         kd_composite,
                "kd_source":  kd_source,
                "zsd":        zsd_med,
                "chl":        chl_med,
                "spm":        spm_med,
                "cause":      classify_cause(chl_med, spm_med),
                "n_pixels":   n_pixels,
                # CHL peu fiable en eaux côtières turbides : valeur informative seulement
                "chl_reliable": (chl_med is not None and spm_med is not None
                                 and spm_med < 5),
            })
        except Exception as e:
            log.warning("Jour %s ignoré : %s", ts, e)

    return results

# ---------------------------------------------------------------------------
# Écriture JSON
# ---------------------------------------------------------------------------

def write_output(points: list[dict]) -> None:
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at":  datetime.now(timezone.utc).isoformat(),
        "product":     PRODUCT_ID,
        "dataset":     DATASET_ID,
        "bbox":        BBOX,
        "lookback_days": LOOKBACK_DAYS,
        "points":      points,
    }
    tmp = OUTPUT_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=str))
    tmp.replace(OUTPUT_FILE)
    log.info("Écrit %s (%d points)", OUTPUT_FILE, len(points))

# ---------------------------------------------------------------------------
# Entrée
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        points = fetch_copernicus()
        if not points:
            log.warning("Aucun point retourné — fichier non mis à jour")
            sys.exit(1)
        write_output(points)
        log.info("Terminé avec succès")
    except Exception as exc:
        log.error("Échec : %s", exc)
        sys.exit(1)

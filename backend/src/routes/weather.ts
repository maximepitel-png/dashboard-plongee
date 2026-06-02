import { Router, Request, Response } from 'express';
import { fetchWeather } from '../services/weatherService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat((req.query.lat as string) || '49.2796');
    const lon = parseFloat((req.query.lon as string) || '-0.2602');
    const name = (req.query.name as string) || 'Ouistreham';

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Coordonnées invalides' });
    }

    const data = await fetchWeather(lat, lon, name);
    return res.json(data);
  } catch (err) {
    console.error('Weather error:', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération météo' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { getTideData, getTidalImpact } from '../services/tidesService';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    const days = 15;
    const data = getTideData(days);
    return res.json(data);
  } catch (err) {
    console.error('Tides error:', err);
    return res.status(500).json({ error: 'Erreur lors du calcul des marées' });
  }
});

router.get('/impact', (req: Request, res: Response) => {
  try {
    const timestamp = req.query.timestamp
      ? parseInt(req.query.timestamp as string)
      : Date.now();
    const impact = getTidalImpact(timestamp);
    return res.json(impact);
  } catch (err) {
    console.error('Tidal impact error:', err);
    return res.status(500).json({ error: 'Erreur lors du calcul' });
  }
});

export default router;

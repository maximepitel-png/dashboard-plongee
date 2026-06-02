import { Router, Request, Response } from 'express';
import { fetchClubDives, clearClubCache } from '../services/clubService';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const data = await fetchClubDives();
    return res.json(data);
  } catch (err) {
    console.error('Club route error:', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des sorties' });
  }
});

router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    clearClubCache();
    const data = await fetchClubDives();
    return res.json(data);
  } catch (err) {
    console.error('Club refresh error:', err);
    return res.status(500).json({ error: 'Erreur lors du rafraîchissement' });
  }
});

export default router;

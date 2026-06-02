import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const DATA_FILE = path.join(process.env.DATA_DIR || '/app/data', 'equipment.json');

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  status: 'À acheter' | 'À remplacer' | 'Possédé';
  priority: 'haute' | 'moyenne' | 'basse';
  estimatedPrice: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function loadData(): EquipmentItem[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveData(items: EquipmentItem[]): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

router.get('/', (_req: Request, res: Response) => {
  const items = loadData();
  return res.json(items);
});

router.post('/', (req: Request, res: Response) => {
  const { name, category, status, priority, estimatedPrice, notes } = req.body;
  if (!name || !category || !status || !priority) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  const items = loadData();
  const item: EquipmentItem = {
    id: uuidv4(),
    name,
    category,
    status,
    priority,
    estimatedPrice: estimatedPrice ?? null,
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.push(item);
  saveData(items);
  return res.status(201).json(item);
});

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = loadData();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Élément non trouvé' });

  items[idx] = {
    ...items[idx],
    ...req.body,
    id,
    createdAt: items[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  saveData(items);
  return res.json(items[idx]);
});

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = loadData();
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length === items.length) {
    return res.status(404).json({ error: 'Élément non trouvé' });
  }
  saveData(filtered);
  return res.status(204).send();
});

export default router;

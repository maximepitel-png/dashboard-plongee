import React, { useState, useEffect } from 'react';
import axios from 'axios';

type Status = 'À acheter' | 'À remplacer' | 'Possédé';
type Priority = 'haute' | 'moyenne' | 'basse';
type Category =
  | 'Combinaison'
  | 'Détendeur'
  | 'Ordinateur'
  | 'Palmes'
  | 'Masque'
  | 'Gilet (BCD)'
  | 'Bouteille'
  | 'Lampe'
  | 'Couteau'
  | 'Accessoire'
  | 'Autre';

interface EquipmentItem {
  id: string;
  name: string;
  category: Category;
  status: Status;
  priority: Priority;
  estimatedPrice: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES: Category[] = [
  'Combinaison', 'Détendeur', 'Ordinateur', 'Palmes', 'Masque',
  'Gilet (BCD)', 'Bouteille', 'Lampe', 'Couteau', 'Accessoire', 'Autre',
];

const STATUS_COLORS: Record<Status, string> = {
  'À acheter': 'bg-blue-900/50 text-blue-300 border-blue-800',
  'À remplacer': 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  'Possédé': 'bg-green-900/50 text-green-300 border-green-800',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  haute: 'text-red-400',
  moyenne: 'text-yellow-400',
  basse: 'text-gray-400',
};

const PRIORITY_ICONS: Record<Priority, string> = {
  haute: '🔴',
  moyenne: '🟡',
  basse: '🟢',
};

const CATEGORY_ICONS: Record<string, string> = {
  'Combinaison': '🤿', 'Détendeur': '🫁', 'Ordinateur': '⌚',
  'Palmes': '🦶', 'Masque': '🥽', 'Gilet (BCD)': '🦺',
  'Bouteille': '🪣', 'Lampe': '🔦', 'Couteau': '🔪',
  'Accessoire': '🧰', 'Autre': '📦',
};

const emptyForm = {
  name: '',
  category: 'Combinaison' as Category,
  status: 'À acheter' as Status,
  priority: 'moyenne' as Priority,
  estimatedPrice: '',
  notes: '',
};

const EquipmentWidget: React.FC = () => {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState<Status | 'Tous'>('Tous');
  const [filterCategory, setFilterCategory] = useState<Category | 'Toutes'>('Toutes');
  const [saving, setSaving] = useState(false);

  const fetchEquipment = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await axios.get('/api/equipment');
      setItems(res.data);
    } catch {
      setFetchError('Impossible de charger la liste d\'équipement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (item: EquipmentItem) => {
    setForm({
      name: item.name,
      category: item.category,
      status: item.status,
      priority: item.priority,
      estimatedPrice: item.estimatedPrice?.toString() || '',
      notes: item.notes,
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      estimatedPrice: form.estimatedPrice ? parseFloat(form.estimatedPrice) : null,
    };
    try {
      if (editId) {
        const res = await axios.put(`/api/equipment/${editId}`, payload);
        setItems((prev) => prev.map((i) => (i.id === editId ? res.data : i)));
      } else {
        const res = await axios.post('/api/equipment', payload);
        setItems((prev) => [...prev, res.data]);
      }
      resetForm();
    } catch {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet élément ?')) return;
    try {
      await axios.delete(`/api/equipment/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      alert('Erreur lors de la suppression');
    }
  };

  const filtered = items.filter((i) => {
    if (filterStatus !== 'Tous' && i.status !== filterStatus) return false;
    if (filterCategory !== 'Toutes' && i.category !== filterCategory) return false;
    return true;
  });

  const totalBudget = items
    .filter((i) => i.status !== 'Possédé' && i.estimatedPrice !== null)
    .reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);

  return (
    <div className="card">
      <div className="card-header">
        <span>🎒</span>
        <span>Liste d'Équipement</span>
        <button className="ml-auto btn-primary text-xs" onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}>
          + Ajouter
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['À acheter', 'À remplacer', 'Possédé'] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? 'Tous' : s)}
            className={`rounded-lg p-2 text-center transition-all ${
              filterStatus === s ? STATUS_COLORS[s] + ' ring-1' : 'bg-navy-900 text-gray-400'
            } border`}
          >
            <p className="text-lg font-bold">{items.filter((i) => i.status === s).length}</p>
            <p className="text-xs">{s}</p>
          </button>
        ))}
      </div>

      {totalBudget > 0 && (
        <div className="mb-3 bg-navy-900 rounded-lg px-3 py-2 text-xs text-gray-400 flex justify-between">
          <span>Budget estimé (à acheter/remplacer)</span>
          <span className="text-ocean-400 font-semibold">{totalBudget.toFixed(0)} €</span>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <button
          onClick={() => setFilterCategory('Toutes')}
          className={`text-xs px-2 py-1 rounded ${filterCategory === 'Toutes' ? 'bg-ocean-500 text-white' : 'bg-navy-900 text-gray-400'}`}
        >
          Toutes
        </button>
        {CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => (
          <button
            key={c}
            onClick={() => setFilterCategory(filterCategory === c ? 'Toutes' : c)}
            className={`text-xs px-2 py-1 rounded ${filterCategory === c ? 'bg-ocean-500 text-white' : 'bg-navy-900 text-gray-400'}`}
          >
            {CATEGORY_ICONS[c]} {c}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-navy-900 rounded-xl p-4 mb-4 border border-navy-600 space-y-3">
          <h3 className="text-sm font-semibold text-ocean-400 mb-2">
            {editId ? 'Modifier l\'équipement' : 'Nouvel équipement'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Nom de l'équipement *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              className="select"
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
              className="select"
            >
              <option>À acheter</option>
              <option>À remplacer</option>
              <option>Possédé</option>
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
              className="select"
            >
              <option value="haute">🔴 Haute</option>
              <option value="moyenne">🟡 Moyenne</option>
              <option value="basse">🟢 Basse</option>
            </select>
            <input
              type="number"
              placeholder="Prix estimé (€)"
              value={form.estimatedPrice}
              onChange={(e) => setForm({ ...form, estimatedPrice: e.target.value })}
              className="input"
              min="0"
              step="0.01"
            />
            <div className="col-span-2">
              <textarea
                placeholder="Notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input w-full resize-none h-16"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={resetForm}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Sauvegarde...' : editId ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div className="flex items-center justify-center h-24 text-gray-500 animate-pulse">
          Chargement...
        </div>
      )}

      {fetchError && !loading && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{fetchError}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={fetchEquipment}
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !fetchError && (
        <div className="space-y-2 overflow-y-auto max-h-80">
          {filtered.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              <p className="text-3xl mb-2">🎒</p>
              <p className="text-sm">Aucun équipement</p>
              <button className="mt-2 text-xs text-ocean-400 hover:text-ocean-300" onClick={() => setShowForm(true)}>
                Ajouter un équipement
              </button>
            </div>
          )}
          {filtered.map((item) => (
            <div key={item.id} className="bg-navy-900 rounded-lg p-3 flex items-start gap-3 group hover:bg-navy-800/50 transition-colors">
              <span className="text-xl mt-0.5">{CATEGORY_ICONS[item.category] || '📦'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white">{item.name}</span>
                  <span className={`badge border ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs ${PRIORITY_COLORS[item.priority]}`}>
                    {PRIORITY_ICONS[item.priority]} {item.priority}
                  </span>
                  <span className="text-xs text-gray-500">{item.category}</span>
                  {item.estimatedPrice !== null && (
                    <span className="text-xs text-ocean-400">{item.estimatedPrice.toFixed(0)} €</span>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{item.notes}</p>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => handleEdit(item)}
                  className="p-1 rounded hover:bg-navy-700 text-gray-400 hover:text-white transition-colors"
                  title="Modifier"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
                  title="Supprimer"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EquipmentWidget;

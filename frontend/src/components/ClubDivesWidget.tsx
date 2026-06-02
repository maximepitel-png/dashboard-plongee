import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ClubDive {
  id: string;
  date: string;
  location: string;
  site: string;
  organizer: string;
  maxParticipants: number | null;
  currentParticipants: number | null;
  level: string;
  notes: string;
  registrationUrl: string | null;
}

interface ClubData {
  dives: ClubDive[];
  lastUpdated: string;
  error?: string;
}

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

const ClubDivesWidget: React.FC = () => {
  const [data, setData] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDives = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = refresh
        ? await axios.post('/api/club/refresh')
        : await axios.get('/api/club');
      setData(res.data);
    } catch {
      setData({ dives: [], lastUpdated: '', error: 'Impossible de contacter le serveur' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchDives(); }, []);

  return (
    <div className="card">
      <div className="card-header">
        <span>🤿</span>
        <span>Sorties du Club</span>
        <button
          className="ml-auto btn-ghost text-xs"
          onClick={() => fetchDives(true)}
          disabled={refreshing}
        >
          {refreshing ? '⟳ ...' : '⟳ Rafraîchir'}
        </button>
      </div>

      {data?.error && (
        <div className="mb-3 text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-900/30 rounded-lg p-2 flex items-start gap-2">
          <span>⚠️</span>
          <span>{data.error} — données de démonstration affichées</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-500 animate-pulse">
          Chargement des sorties...
        </div>
      )}

      {!loading && data && (
        <>
          <div className="space-y-3 overflow-y-auto max-h-96">
            {data.dives.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-4xl mb-2">📅</p>
                <p>Aucune sortie planifiée</p>
              </div>
            )}
            {data.dives.map((dive) => {
              const days = daysUntil(dive.date);
              return (
                <div key={dive.id} className="bg-navy-900 rounded-xl p-3 border border-navy-700 hover:border-ocean-500/30 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{dive.site || dive.location}</p>
                      <p className="text-xs text-gray-400">{formatDate(dive.date)}</p>
                    </div>
                    <span className={`badge text-xs shrink-0 ${
                      days === 0 ? 'bg-green-900/50 text-green-400' :
                      days <= 7 ? 'bg-ocean-500/20 text-ocean-400' :
                      'bg-navy-700 text-gray-400'
                    }`}>
                      {days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : `J-${days}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {dive.location && dive.site && (
                      <div className="flex items-center gap-1 text-gray-400">
                        <span>📍</span><span>{dive.location}</span>
                      </div>
                    )}
                    {dive.organizer && (
                      <div className="flex items-center gap-1 text-gray-400">
                        <span>👤</span><span>{dive.organizer}</span>
                      </div>
                    )}
                    {dive.level && (
                      <div className="flex items-center gap-1 text-gray-400">
                        <span>🎓</span><span>{dive.level}</span>
                      </div>
                    )}
                    {(dive.maxParticipants !== null) && (
                      <div className="flex items-center gap-1 text-gray-400">
                        <span>👥</span>
                        <span>
                          {dive.currentParticipants !== null
                            ? `${dive.currentParticipants}/${dive.maxParticipants} plongeurs`
                            : `Max ${dive.maxParticipants}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {dive.notes && (
                    <p className="mt-2 text-xs text-gray-500 italic border-t border-navy-700 pt-2">{dive.notes}</p>
                  )}

                  {dive.registrationUrl && (
                    <a
                      href={dive.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-ocean-400 hover:text-ocean-300 transition-colors"
                    >
                      📝 S'inscrire
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {data.lastUpdated && (
            <p className="text-xs text-gray-600 mt-3">
              Mis à jour: {new Date(data.lastUpdated).toLocaleString('fr-FR')}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default ClubDivesWidget;

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Waves, TrendingUp, TrendingDown } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface TidePoint {
  time: string;
  height: number;
}

interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface DayTides {
  date: string;
  coefficient: number;
  extremes: TideExtreme[];
  points: TidePoint[];
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function getCoefficientColor(coeff: number): string {
  if (coeff <= 50) return '#22c55e';
  if (coeff <= 70) return '#84cc16';
  if (coeff <= 90) return '#f59e0b';
  if (coeff <= 100) return '#f97316';
  return '#ef4444';
}

interface TooltipPayload {
  value?: number;
  payload?: { time: string };
}

const CustomTooltip: React.FC<{ active?: boolean; payload?: TooltipPayload[]; label?: string }> = ({
  active,
  payload,
}) => {
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0];
  const time = pt.payload?.time;
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-xs">
      {time && <p className="text-gray-400 mb-1">{formatTime(time)}</p>}
      <p className="text-ocean-400 font-bold">{pt.value?.toFixed(2)} m</p>
    </div>
  );
};

interface Props {
  selectedDay: number;
  tideData: DayTides[];
  tidesLoading: boolean;
  tidesError: string | null;
  onRetry: () => void;
}

const TidesWidget: React.FC<Props> = ({ selectedDay, tideData, tidesLoading, tidesError, onRetry }) => {
  const currentDay = tideData[selectedDay];
  const now = new Date().toISOString();

  const currentHeight = currentDay?.points?.length
    ? currentDay.points.reduce((prev, pt) =>
        Math.abs(new Date(pt.time).getTime() - Date.now()) <
        Math.abs(new Date(prev.time).getTime() - Date.now()) ? pt : prev,
        currentDay.points[0]
      )
    : null;

  const chartData = currentDay?.points?.map((p) => ({
    time: p.time,
    height: p.height,
    displayTime: formatTime(p.time),
  }));

  const thinChartData = chartData?.filter((_, i) => i % 2 === 0);

  return (
    <div className="card">
      <div className="card-header">
        <Waves size={18} className="text-ocean-400" />
        <span>Marées — Ouistreham</span>
        {currentDay && (
          <span className="ml-auto text-sm font-normal" style={{ color: getCoefficientColor(currentDay.coefficient) }}>
            Coeff. ~{currentDay.coefficient} <span className="text-gray-500 text-xs">(estimé)</span>
          </span>
        )}
      </div>

      {tidesLoading && (
        <div className="flex items-center justify-center h-40 text-gray-500 animate-pulse">
          Calcul des marées...
        </div>
      )}

      {tidesError && !tidesLoading && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{tidesError}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={onRetry}
          >
            Réessayer
          </button>
        </div>
      )}

      {!tidesLoading && !tidesError && tideData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Waves size={32} className="mx-auto mb-2 text-gray-600" />
          <p>Aucune donnée de marée disponible</p>
        </div>
      )}

      {!tidesLoading && !tidesError && currentDay && (
        <>
          {selectedDay === 0 && currentHeight && (
            <div className="flex items-center gap-3 mb-4 bg-navy-900 rounded-lg p-3">
              <Waves size={24} className="text-ocean-400" />
              <div>
                <p className="text-xl font-bold text-ocean-400">{currentHeight.height.toFixed(2)} m</p>
                <p className="text-xs text-gray-400">Hauteur actuelle</p>
              </div>
            </div>
          )}

          <div className="h-48 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={thinChartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00b4d8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
                <XAxis
                  dataKey="displayTime"
                  interval={3}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={{ stroke: '#0f2d4a' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 8]}
                  tickCount={5}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  tickFormatter={(v) => `${v}m`}
                />
                <Tooltip content={<CustomTooltip />} />
                {selectedDay === 0 && (
                  <ReferenceLine
                    x={formatTime(now)}
                    stroke="#00b4d8"
                    strokeDasharray="4 4"
                    label={{ value: 'Maintenant', position: 'top', fill: '#00b4d8', fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="height"
                  stroke="#00b4d8"
                  strokeWidth={2}
                  fill="url(#tideGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#00b4d8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {currentDay.extremes.map((ext, i) => (
              <div
                key={i}
                className={`rounded-lg p-2.5 flex items-center gap-2 ${
                  ext.type === 'high' ? 'bg-ocean-500/10 border border-ocean-500/20' : 'bg-navy-900'
                }`}
              >
                {ext.type === 'high' ? <TrendingUp size={20} className="text-ocean-400" /> : <TrendingDown size={20} className="text-gray-400" />}
                <div>
                  <p className="text-sm font-bold text-white">{ext.height.toFixed(2)} m</p>
                  <p className="text-xs text-gray-400">{formatTime(ext.time)}</p>
                </div>
                <span className="ml-auto text-xs text-gray-500">
                  {ext.type === 'high' ? 'PM' : 'BM'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 bg-navy-900 rounded-lg p-2.5">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span className="flex items-center gap-1">Coeff. marée estimé<InfoTooltip text="Le coefficient de marée (20 à 120) mesure l'amplitude de la marée. En dessous de 70 : morte-eau (faibles courants). Au-dessus de 95 : vive-eau (forts courants, grande amplitude)." /> : <strong style={{ color: getCoefficientColor(currentDay.coefficient) }}>~{currentDay.coefficient}</strong></span>
              <span>{currentDay.coefficient <= 70 ? 'Morte-eau' : currentDay.coefficient >= 95 ? 'Vive-eau' : 'Modérée'}</span>
            </div>
            <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${((currentDay.coefficient - 20) / 100) * 100}%`,
                  backgroundColor: getCoefficientColor(currentDay.coefficient),
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>20</span><span>70</span><span>95</span><span>120</span>
            </div>
            <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
              Marnage estimé
              <InfoTooltip text="Le marnage est la différence de hauteur entre la pleine mer et la basse mer. À Ouistreham il varie de ~3 m (morte-eau) à ~7,6 m (vive-eau de fort coefficient)." />
            </p>
          </div>

          <p className="text-xs text-gray-600 mt-3 text-center">
            Hauteurs en mètres au-dessus du Zéro Hydrographique (ZH) · Calcul harmonique estimé · <span className="text-amber-600/70">Indicatif, pas pour la navigation</span>
          </p>
        </>
      )}

      {!tidesLoading && (
        <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
          Source · Modèle harmonique local (constituants SHOM Ouistreham) · Calculé le {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};

export default TidesWidget;

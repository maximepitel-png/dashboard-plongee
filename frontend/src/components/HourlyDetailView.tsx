import React, { useState } from 'react';
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { LayoutGrid, Table2, TrendingUp } from 'lucide-react';
import WeatherWidget from './WeatherWidget';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface TidePoint { time: string; height: number; }
interface TideExtreme { time: string; height: number; type: 'high' | 'low'; }
interface DayTides { date: string; coefficient: number; extremes: TideExtreme[]; points: TidePoint[]; }

interface WeatherData {
  current: {
    temperature: number; windspeed: number; windgusts: number;
    winddirection: number; weathercode: number; precipitation: number; time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature?: number[];
    windspeed_10m: number[];
    windgusts_10m: number[];
    winddirection_10m: number[];
    precipitation: number[];
    precipitation_probability?: number[];
    weathercode: number[];
    cloudcover?: number[];
    visibility?: number[];
    surface_pressure?: number[];
    uv_index?: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
      wave_direction: number[];
      wave_period: number[];
      swell_wave_height: number[];
      swell_wave_direction: number[];
      swell_wave_period: number[];
      wind_wave_height: number[];
      wind_wave_direction: number[];
      wind_wave_period?: number[];
      ocean_current_velocity: number[];
      ocean_current_direction: number[];
      sea_surface_temperature: number[];
    };
  };
  daily: { sunrise: string[]; sunset: string[] };
  location: { lat: number; lon: number; name: string };
  isMock?: boolean;
  marineHorizonDate?: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function windDirLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function windDirectionFull(deg: number): string {
  const dirs = [
    'Nord', 'Nord-Nord-Est', 'Nord-Est', 'Est-Nord-Est',
    'Est', 'Est-Sud-Est', 'Sud-Est', 'Sud-Sud-Est',
    'Sud', 'Sud-Sud-Ouest', 'Sud-Ouest', 'Ouest-Sud-Ouest',
    'Ouest', 'Ouest-Nord-Ouest', 'Nord-Ouest', 'Nord-Nord-Ouest',
  ];
  const label = dirs[Math.round(deg / 22.5) % 16];
  return `${label} (${Math.round(deg)}°)`;
}

function fmt1(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(1);
}

function fmt0(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toString();
}

function wavelength(period: number): number {
  return 1.56 * period * period;
}

function windColor(kt: number): string {
  if (kt < 8) return '#2dd4bf22';
  if (kt < 12) return '#f59e0b22';
  if (kt < 15) return '#f97316aa';
  if (kt < 20) return '#ef444444';
  return '#991b1b88';
}

function windTextColor(kt: number): string {
  if (kt < 8) return '#2dd4bf';
  if (kt < 12) return '#f59e0b';
  if (kt < 15) return '#f97316';
  return '#ef4444';
}

function waveColor(m: number): string {
  if (m < 0.3) return '#2dd4bf22';
  if (m < 0.5) return '#84cc1622';
  if (m < 0.8) return '#f59e0b33';
  if (m < 1.2) return '#f9731633';
  return '#ef444444';
}

function waveTextColor(m: number): string {
  if (m < 0.3) return '#2dd4bf';
  if (m < 0.5) return '#84cc16';
  if (m < 0.8) return '#f59e0b';
  if (m < 1.2) return '#f97316';
  return '#ef4444';
}

function precipColor(mm: number): string {
  if (mm <= 0) return 'transparent';
  if (mm < 0.5) return '#3b82f622';
  if (mm < 2) return '#3b82f644';
  if (mm < 5) return '#1d4ed855';
  return '#1e3a8a77';
}

function cloudColor(pct: number): string {
  if (pct < 25) return '#2dd4bf22';
  if (pct < 50) return '#6b728022';
  if (pct < 75) return '#6b728033';
  return '#37415144';
}

function uvColor(uv: number): string {
  if (uv <= 2) return '#2dd4bf22';
  if (uv <= 5) return '#f59e0b22';
  if (uv <= 7) return '#f9731633';
  return '#ef444444';
}

function uvTextColor(uv: number): string {
  if (uv <= 2) return '#2dd4bf';
  if (uv <= 5) return '#f59e0b';
  if (uv <= 7) return '#f97316';
  return '#ef4444';
}

// ──────────────────────────────────────────────
// Table cell component
// ──────────────────────────────────────────────

const Cell: React.FC<{
  value: string;
  bg?: string;
  color?: string;
  small?: boolean;
  bold?: boolean;
  center?: boolean;
}> = ({ value, bg = 'transparent', color = '#9ca3af', small, bold, center }) => (
  <td
    className={`px-2 py-1.5 whitespace-nowrap border-b border-navy-800/50 font-mono ${small ? 'text-xs' : 'text-sm'} ${bold ? 'font-bold' : ''} ${center ? 'text-center' : 'text-right'}`}
    style={{ backgroundColor: bg, color, minWidth: '52px' }}
  >
    {value}
  </td>
);

const GroupHeader: React.FC<{ label: string; colspan: number }> = ({ label, colspan }) => (
  <tr>
    <td
      className="sticky left-0 z-10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ocean-400 bg-navy-950"
      style={{ borderBottom: '1px solid #0f2d4a' }}
    >
      {label}
    </td>
    <td
      colSpan={colspan}
      className="border-b border-navy-700/30"
      style={{ backgroundColor: '#060f1e' }}
    />
  </tr>
);

const RowLabel: React.FC<{ label: string; unit?: string }> = ({ label, unit }) => (
  <td className="sticky left-0 z-10 px-3 py-1.5 text-xs text-gray-500 bg-navy-900 border-b border-navy-800/50 whitespace-nowrap" style={{ minWidth: '130px' }}>
    {label}{unit && <span className="text-gray-700 ml-1">({unit})</span>}
  </td>
);

// ──────────────────────────────────────────────
// Tableau mode
// ──────────────────────────────────────────────

const TableMode: React.FC<{
  weather: WeatherData;
  dayTides: DayTides | null;
  selectedDay: number;
  marineHorizonDate: string | null;
}> = ({ weather, dayTides, selectedDay, marineHorizonDate }) => {
  const date = (() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDay);
    return d.toISOString().slice(0, 10);
  })();

  const beyondMarine = marineHorizonDate
    ? new Date(date + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const hourIndices: number[] = [];
  for (let h = 0; h < 24; h++) {
    const targetStr = `${date}T${String(h).padStart(2, '0')}`;
    const idx = weather.hourly.time.findIndex(t => t.startsWith(targetStr));
    hourIndices.push(idx);
  }

  const marineHourIndices: number[] = [];
  for (let h = 0; h < 24; h++) {
    const targetStr = `${date}T${String(h).padStart(2, '0')}`;
    const idx = weather.marine.hourly.time.findIndex(t => t.startsWith(targetStr));
    marineHourIndices.push(idx);
  }

  const getTideHeight = (hour: number): string => {
    if (!dayTides?.points?.length) return '—';
    const targetMs = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
    const closest = dayTides.points.reduce((prev, pt) =>
      Math.abs(new Date(pt.time).getTime() - targetMs) < Math.abs(new Date(prev.time).getTime() - targetMs) ? pt : prev
    );
    return closest.height.toFixed(2);
  };

  const getTideLabel = (hour: number): string => {
    if (!dayTides?.extremes?.length) return '';
    const targetMs = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
    const match = dayTides.extremes.find(ext => {
      const diff = Math.abs(new Date(ext.time).getTime() - targetMs);
      return diff < 30 * 60 * 1000;
    });
    if (!match) return '';
    return match.type === 'high' ? 'PM' : 'BM';
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const validHours = hours.filter(h => hourIndices[h] >= 0);

  const get = (arr: number[] | undefined, hour: number): number | null => {
    const idx = hourIndices[hour];
    return idx >= 0 && arr ? (arr[idx] ?? null) : null;
  };

  const getM = (arr: number[] | undefined, hour: number): number | null => {
    const idx = marineHourIndices[hour];
    return idx >= 0 && arr ? (arr[idx] ?? null) : null;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-navy-700/50" style={{ maxHeight: '70vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table className="border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
        <thead className="sticky top-0 z-20 bg-navy-900">
          <tr>
            <th className="sticky left-0 z-30 bg-navy-900 px-3 py-2 text-left text-xs text-gray-600 border-b border-navy-700" style={{ minWidth: '130px' }}>
              {date}
              <span className="block text-xs text-gray-700 font-normal mt-0.5">Heures locales (Europe/Paris)</span>
            </th>
            {validHours.map(h => (
              <th key={h} className="px-2 py-2 text-xs text-gray-400 border-b border-navy-700 text-right font-mono" style={{ minWidth: '52px' }}>
                {String(h).padStart(2, '0')}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>

          {/* ── VENT ── */}
          <GroupHeader label="Vent" colspan={validHours.length} />
          <tr>
            <RowLabel label="Direction" />
            {validHours.map(h => {
              const v = get(weather.hourly.winddirection_10m, h);
              return (
                <td
                  key={h}
                  title={v != null ? windDirectionFull(v) : undefined}
                  className="px-2 py-1.5 whitespace-nowrap border-b border-navy-800/50 font-mono text-sm text-center"
                  style={{ color: '#9ca3af', minWidth: '52px' }}
                >
                  {v != null ? windDirLabel(v) : '—'}
                </td>
              );
            })}
          </tr>
          <tr>
            <RowLabel label="Vitesse" unit="kt" />
            {validHours.map(h => {
              const v = get(weather.hourly.windspeed_10m, h);
              return <Cell key={h} value={fmt0(v)} bg={v != null ? windColor(v) : undefined} color={v != null ? windTextColor(v) : undefined} bold />;
            })}
          </tr>
          <tr>
            <RowLabel label="Rafales" unit="kt" />
            {validHours.map(h => {
              const v = get(weather.hourly.windgusts_10m, h);
              return <Cell key={h} value={fmt0(v)} bg={v != null ? windColor(v) : undefined} color={v != null ? windTextColor(v) : undefined} />;
            })}
          </tr>

          {/* ── VAGUE ── */}
          <GroupHeader label={beyondMarine ? 'Vague (données indisponibles au-delà de ~7j)' : 'Vague'} colspan={validHours.length} />
          {beyondMarine ? (
            <tr>
              <td colSpan={validHours.length + 1} className="px-3 py-3 text-xs text-gray-600 text-center italic">
                Données marines non disponibles pour cette période — horizon API ~7 jours
              </td>
            </tr>
          ) : (
            <>
              <tr>
                <RowLabel label="Mer totale" unit="m" />
                {validHours.map(h => {
                  const v = getM(weather.marine.hourly.wave_height, h);
                  return <Cell key={h} value={fmt1(v)} bg={v != null ? waveColor(v) : undefined} color={v != null ? waveTextColor(v) : undefined} bold />;
                })}
              </tr>
              <tr>
                <RowLabel label="Mer de vent" unit="m" />
                {validHours.map(h => {
                  const v = getM(weather.marine.hourly.wind_wave_height, h);
                  return <Cell key={h} value={fmt1(v)} bg={v != null ? waveColor(v) : undefined} color={v != null ? waveTextColor(v) : undefined} />;
                })}
              </tr>
              <tr>
                <RowLabel label="Houle haut." unit="m" />
                {validHours.map(h => {
                  const v = getM(weather.marine.hourly.swell_wave_height, h);
                  return <Cell key={h} value={fmt1(v)} bg={v != null ? waveColor(v) : undefined} color={v != null ? waveTextColor(v) : undefined} />;
                })}
              </tr>
              <tr>
                <RowLabel label="Houle dir." />
                {validHours.map(h => {
                  const v = getM(weather.marine.hourly.swell_wave_direction, h);
                  return <Cell key={h} value={v != null ? windDirLabel(v) : '—'} center />;
                })}
              </tr>
              <tr>
                <RowLabel label="Houle pér." unit="s" />
                {validHours.map(h => {
                  const v = getM(weather.marine.hourly.swell_wave_period, h);
                  return <Cell key={h} value={fmt1(v)} />;
                })}
              </tr>
              <tr>
                <RowLabel label="Long. d'onde" unit="m" />
                {validHours.map(h => {
                  const p = getM(weather.marine.hourly.swell_wave_period, h);
                  const wl = p != null ? wavelength(p) : null;
                  return <Cell key={h} value={wl != null ? Math.round(wl).toString() : '—'} small />;
                })}
              </tr>
            </>
          )}

          {/* ── MARÉE ── */}
          <GroupHeader label="Marée" colspan={validHours.length} />
          <tr>
            <RowLabel label="Hauteur" unit="m" />
            {validHours.map(h => {
              const label = getTideLabel(h);
              const height = getTideHeight(h);
              return (
                <td key={h} className="px-2 py-1.5 text-right border-b border-navy-800/50 font-mono text-sm" style={{ minWidth: '52px' }}>
                  <span className="text-ocean-300">{height}</span>
                  {label && (
                    <span className="block text-xs font-bold" style={{ color: label === 'PM' ? '#2dd4bf' : '#f59e0b' }}>
                      {label}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>

          {/* ── MÉTÉO ── */}
          <GroupHeader label="Météo" colspan={validHours.length} />
          <tr>
            <RowLabel label="Nébulosité" unit="%" />
            {validHours.map(h => {
              const v = get(weather.hourly.cloudcover, h);
              return <Cell key={h} value={fmt0(v)} bg={v != null ? cloudColor(v) : undefined} />;
            })}
          </tr>
          <tr>
            <RowLabel label="Précip." unit="mm/h" />
            {validHours.map(h => {
              const v = get(weather.hourly.precipitation, h);
              return <Cell key={h} value={fmt1(v)} bg={v != null ? precipColor(v) : undefined} color={v != null && v > 0 ? '#93c5fd' : '#4b5563'} />;
            })}
          </tr>
          <tr>
            <RowLabel label="Prob. précip." unit="%" />
            {validHours.map(h => {
              const v = get(weather.hourly.precipitation_probability, h);
              return <Cell key={h} value={fmt0(v)} color={v != null && v > 50 ? '#93c5fd' : '#6b7280'} />;
            })}
          </tr>
          <tr>
            <RowLabel label="Visibilité" unit="km" />
            {validHours.map(h => {
              const v = get(weather.hourly.visibility, h);
              const km = v != null ? v / 1000 : null;
              return <Cell key={h} value={km != null ? fmt1(km) : '—'} color={km != null && km < 5 ? '#f59e0b' : '#6b7280'} />;
            })}
          </tr>
          <tr>
            <RowLabel label="Pression" unit="hPa" />
            {validHours.map(h => {
              const v = get(weather.hourly.surface_pressure, h);
              return <Cell key={h} value={fmt0(v)} small />;
            })}
          </tr>
          <tr>
            <RowLabel label="UV" />
            {validHours.map(h => {
              const v = get(weather.hourly.uv_index, h);
              return <Cell key={h} value={fmt1(v)} bg={v != null ? uvColor(v) : undefined} color={v != null ? uvTextColor(v) : undefined} bold />;
            })}
          </tr>

          {/* ── TEMPÉRATURE ── */}
          <GroupHeader label="Température" colspan={validHours.length} />
          <tr>
            <RowLabel label="Air" unit="°C" />
            {validHours.map(h => {
              const v = get(weather.hourly.temperature_2m, h);
              return <Cell key={h} value={fmt1(v)} color="#e5e7eb" bold />;
            })}
          </tr>
          <tr>
            <RowLabel label="Ressentie" unit="°C" />
            {validHours.map(h => {
              const v = get(weather.hourly.apparent_temperature, h);
              return <Cell key={h} value={fmt1(v)} color="#9ca3af" />;
            })}
          </tr>
          {!beyondMarine && (
            <tr>
              <RowLabel label="Eau (surface)" unit="°C" />
              {validHours.map(h => {
                const v = getM(weather.marine.hourly.sea_surface_temperature, h);
                return <Cell key={h} value={fmt1(v)} color="#2dd4bf" />;
              })}
            </tr>
          )}

        </tbody>
      </table>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 border-t border-navy-700 bg-navy-950 text-xs text-gray-500">
        <span className="font-semibold text-gray-400 w-full">Légende des couleurs :</span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded" style={{ backgroundColor: '#2dd4bf33' }} />
          <span className="text-gray-400">Favorable</span>
          <span className="text-gray-600 ml-1">(vent &lt;8 kt, vagues &lt;0,3 m)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded" style={{ backgroundColor: '#f59e0b33' }} />
          <span className="text-gray-400">Modéré</span>
          <span className="text-gray-600 ml-1">(vent 8–15 kt, vagues 0,3–0,8 m)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded" style={{ backgroundColor: '#f9731633' }} />
          <span className="text-gray-400">Difficile</span>
          <span className="text-gray-600 ml-1">(vent 15–20 kt, vagues 0,8–1,2 m)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded" style={{ backgroundColor: '#ef444433' }} />
          <span className="text-gray-400">Défavorable</span>
          <span className="text-gray-600 ml-1">(vent &gt;20 kt, vagues &gt;1,2 m)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded" style={{ backgroundColor: '#3b82f633' }} />
          <span className="text-gray-400">Précipitations</span>
        </span>
        <span className="mt-1 w-full text-gray-700">Long. d'onde = 1,56 × T² (approximation eau profonde) · Données marines disponibles ~7 premiers jours uniquement</span>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// Graph mode
// ──────────────────────────────────────────────

const GraphMode: React.FC<{
  weather: WeatherData;
  dayTides: DayTides | null;
  selectedDay: number;
  marineHorizonDate: string | null;
}> = ({ weather, dayTides, selectedDay, marineHorizonDate }) => {
  const date = (() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDay);
    return d.toISOString().slice(0, 10);
  })();

  const beyondMarine = marineHorizonDate
    ? new Date(date + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const chartData = Array.from({ length: 24 }, (_, h) => {
    const hStr = `${date}T${String(h).padStart(2, '0')}`;
    const fIdx = weather.hourly.time.findIndex(t => t.startsWith(hStr));
    const mIdx = weather.marine.hourly.time.findIndex(t => t.startsWith(hStr));

    let tideHeight: number | null = null;
    if (dayTides?.points?.length) {
      const targetMs = new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).getTime();
      const closest = dayTides.points.reduce((prev, pt) =>
        Math.abs(new Date(pt.time).getTime() - targetMs) < Math.abs(new Date(prev.time).getTime() - targetMs) ? pt : prev
      );
      tideHeight = closest.height;
    }

    return {
      hour: `${String(h).padStart(2, '0')}h`,
      wind: fIdx >= 0 ? Math.round(weather.hourly.windspeed_10m[fIdx] ?? 0) : null,
      gusts: fIdx >= 0 ? Math.round(weather.hourly.windgusts_10m[fIdx] ?? 0) : null,
      temp: fIdx >= 0 ? parseFloat((weather.hourly.temperature_2m[fIdx] ?? 0).toFixed(1)) : null,
      precip: fIdx >= 0 ? parseFloat((weather.hourly.precipitation[fIdx] ?? 0).toFixed(2)) : null,
      waves: !beyondMarine && mIdx >= 0 ? parseFloat((weather.marine.hourly.wave_height[mIdx] ?? 0).toFixed(2)) : null,
      swell: !beyondMarine && mIdx >= 0 ? parseFloat((weather.marine.hourly.swell_wave_height[mIdx] ?? 0).toFixed(2)) : null,
      tide: tideHeight != null ? parseFloat(tideHeight.toFixed(2)) : null,
    };
  });

  return (
    <div className="space-y-6">
      {/* Wind + Gusts */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Vent (kt)</p>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
            <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={{ backgroundColor: '#0d1f35', border: '1px solid #1e3a5f', borderRadius: '8px', fontSize: '11px' }} />
            <Line type="monotone" dataKey="wind" stroke="#2dd4bf" strokeWidth={2} dot={false} name="Vent" />
            <Line type="monotone" dataKey="gusts" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Rafales" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Waves */}
      {!beyondMarine && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Vagues (m)</p>
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
              <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ backgroundColor: '#0d1f35', border: '1px solid #1e3a5f', borderRadius: '8px', fontSize: '11px' }} />
              <Line type="monotone" dataKey="waves" stroke="#2dd4bf" strokeWidth={2} dot={false} name="Mer totale" />
              <Line type="monotone" dataKey="swell" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Houle" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Precipitation */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Précipitations (mm/h)</p>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
            <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={{ backgroundColor: '#0d1f35', border: '1px solid #1e3a5f', borderRadius: '8px', fontSize: '11px' }} />
            <Bar dataKey="precip" fill="#3b82f6" opacity={0.7} name="Précip." />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Temperature */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Température (°C)</p>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
            <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={{ backgroundColor: '#0d1f35', border: '1px solid #1e3a5f', borderRadius: '8px', fontSize: '11px' }} />
            <Line type="monotone" dataKey="temp" stroke="#fbbf24" strokeWidth={2} dot={false} name="Air (°C)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tide */}
      {dayTides && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Marée (m)</p>
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="tideGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00b4d8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
              <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 8]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ backgroundColor: '#0d1f35', border: '1px solid #1e3a5f', borderRadius: '8px', fontSize: '11px' }} />
              <Area type="monotone" dataKey="tide" stroke="#00b4d8" strokeWidth={2} fill="url(#tideGrad2)" dot={false} name="Marée (m)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// Main HourlyDetailView component
// ──────────────────────────────────────────────

interface HourlyDetailViewProps {
  weather: WeatherData | null;
  weatherLoading: boolean;
  weatherError: string | null;
  onRetry: () => void;
  selectedDay: number;
  location: { lat: number; lon: number; name: string };
  dayTides: DayTides | null;
  marineHorizonDate: string | null;
}

type ViewMode = 'summary' | 'table' | 'graph';

const HourlyDetailView: React.FC<HourlyDetailViewProps> = ({
  weather,
  weatherLoading,
  weatherError,
  onRetry,
  selectedDay,
  location,
  dayTides,
  marineHorizonDate,
}) => {
  const [mode, setMode] = useState<ViewMode>('summary');

  const modes: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'summary', label: 'Résumé', icon: <LayoutGrid size={14} /> },
    { key: 'table', label: 'Tableau', icon: <Table2 size={14} /> },
    { key: 'graph', label: 'Graphes', icon: <TrendingUp size={14} /> },
  ];

  const dayLabel = selectedDay === 0
    ? "Aujourd'hui"
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + selectedDay);
        return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      })();

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-3">
        {modes.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === m.key
                ? 'bg-ocean-600/40 text-ocean-300 border border-ocean-500/40'
                : 'bg-navy-900 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {m.icon}
            <span className="hidden sm:inline ml-1">{m.label}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-600">{dayLabel}</span>
      </div>

      {/* SUMMARY mode — WeatherWidget is itself a card */}
      {mode === 'summary' && (
        <WeatherWidget
          weather={weather}
          weatherLoading={weatherLoading}
          weatherError={weatherError}
          onRetry={onRetry}
          selectedDay={selectedDay}
          location={location}
        />
      )}

      {/* TABLE mode */}
      {mode === 'table' && weather && (
        <div className="card">
          <TableMode
            weather={weather}
            dayTides={dayTides}
            selectedDay={selectedDay}
            marineHorizonDate={marineHorizonDate}
          />
        </div>
      )}
      {mode === 'table' && !weather && (
        <div className="card flex items-center justify-center h-32 text-gray-500 animate-pulse">
          Chargement...
        </div>
      )}

      {/* GRAPH mode */}
      {mode === 'graph' && weather && (
        <div className="card">
          <GraphMode
            weather={weather}
            dayTides={dayTides}
            selectedDay={selectedDay}
            marineHorizonDate={marineHorizonDate}
          />
        </div>
      )}
      {mode === 'graph' && !weather && (
        <div className="card flex items-center justify-center h-32 text-gray-500 animate-pulse">
          Chargement...
        </div>
      )}
    </div>
  );
};

export default HourlyDetailView;

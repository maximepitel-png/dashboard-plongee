interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface WeatherData {
  hourly: {
    time: string[];
    windspeed_10m: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
      ocean_current_velocity: number[];
    };
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
}

function getHourlyValue(times: string[], values: number[], target: Date): number {
  const targetHour = target.toISOString().slice(0, 13);
  const idx = times.findIndex((t) => t.slice(0, 13) >= targetHour);
  return idx >= 0 ? (values[idx] ?? 0) : 0;
}

function computeWindScore(kt: number): number {
  if (kt < 8) return 25;
  if (kt < 12) return 20;
  if (kt < 15) return 10;
  if (kt < 20) return 5;
  return 0;
}

function computeWaveScore(m: number): number {
  if (m < 0.3) return 30;
  if (m < 0.5) return 25;
  if (m < 0.8) return 18;
  if (m < 1.2) return 10;
  if (m < 1.5) return 4;
  return 0;
}

export interface DayScore {
  score: number;
  quality: 'excellent' | 'good' | 'average' | 'poor';
}

export function computeDayScore(
  extremes: TideExtreme[],
  weather: WeatherData,
  dayIndex: number,
): DayScore {
  const sunrise = new Date(weather.daily.sunrise[dayIndex] ?? weather.daily.sunrise[0]);
  const sunset = new Date(weather.daily.sunset[dayIndex] ?? weather.daily.sunset[0]);
  const ETALE_MARGIN_MS = 45 * 60 * 1000;

  let best = 0;

  for (const ext of extremes) {
    const t = new Date(ext.time);
    const windowStart = new Date(t.getTime() - ETALE_MARGIN_MS);
    const windowEnd = new Date(t.getTime() + ETALE_MARGIN_MS);
    const wind = getHourlyValue(weather.hourly.time, weather.hourly.windspeed_10m, t);
    const waves = getHourlyValue(weather.marine.hourly.time, weather.marine.hourly.wave_height, t);
    const currentMs = getHourlyValue(weather.marine.hourly.time, weather.marine.hourly.ocean_current_velocity ?? [], t);
    const isDaylight = windowStart >= sunrise && windowEnd <= sunset;
    const currentBonus = currentMs < 0.3 ? 10 : currentMs < 0.6 ? 5 : 0;
    const score = computeWindScore(wind) + computeWaveScore(waves) + (isDaylight ? 10 : 0) + currentBonus;
    if (score > best) best = score;
  }

  return {
    score: best,
    quality: best >= 55 ? 'excellent' : best >= 40 ? 'good' : best >= 25 ? 'average' : 'poor',
  };
}

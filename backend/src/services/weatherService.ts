import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 });

export interface WeatherData {
  current: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    precipitation: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
    winddirection_10m: number[];
    precipitation: number[];
    weathercode: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
      wave_direction: number[];
      wave_period: number[];
      sea_surface_temperature: number[];
    };
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
  location: {
    lat: number;
    lon: number;
    name: string;
  };
  isMock?: boolean;
}

function generateMockData(lat: number, lon: number, locationName: string): WeatherData {
  const now = new Date();
  const times: string[] = [];
  const temp: number[] = [];
  const wind: number[] = [];
  const windDir: number[] = [];
  const precip: number[] = [];
  const wcode: number[] = [];
  const waveH: number[] = [];
  const waveDir: number[] = [];
  const wavePeriod: number[] = [];
  const sst: number[] = [];

  for (let i = 0; i < 168; i++) {
    const t = new Date(now.getTime() + i * 3600000);
    times.push(t.toISOString().slice(0, 16));
    temp.push(+(14 + Math.sin(i / 12) * 3 + Math.random() * 1).toFixed(1));
    wind.push(+(8 + Math.sin(i / 24) * 6 + Math.random() * 3).toFixed(1));
    windDir.push(Math.floor(200 + Math.sin(i / 18) * 60 + Math.random() * 20));
    precip.push(+(Math.random() < 0.2 ? Math.random() * 2 : 0).toFixed(1));
    wcode.push(Math.random() < 0.6 ? 1 : Math.random() < 0.5 ? 3 : 61);
    waveH.push(+(0.4 + Math.sin(i / 20) * 0.3 + Math.random() * 0.2).toFixed(2));
    waveDir.push(Math.floor(220 + Math.random() * 40));
    wavePeriod.push(+(6 + Math.random() * 3).toFixed(1));
    sst.push(+(13 + Math.sin(i / 48) * 1.5).toFixed(1));
  }

  // Generate mock sunrise/sunset for 7 days (Normandy summer: ~6h05 / ~21h55)
  const sunrises: string[] = [];
  const sunsets: string[] = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    const dateStr = day.toISOString().split('T')[0];
    sunrises.push(`${dateStr}T06:05`);
    sunsets.push(`${dateStr}T21:55`);
  }

  return {
    current: {
      temperature: temp[0],
      windspeed: wind[0],
      winddirection: windDir[0],
      weathercode: wcode[0],
      precipitation: precip[0],
      time: times[0],
    },
    hourly: {
      time: times,
      temperature_2m: temp,
      windspeed_10m: wind,
      winddirection_10m: windDir,
      precipitation: precip,
      weathercode: wcode,
    },
    daily: {
      sunrise: sunrises,
      sunset: sunsets,
    },
    marine: {
      hourly: {
        time: times,
        wave_height: waveH,
        wave_direction: waveDir,
        wave_period: wavePeriod,
        sea_surface_temperature: sst,
      },
    },
    location: { lat, lon, name: locationName },
    isMock: true,
  };
}

export async function fetchWeather(lat: number, lon: number, locationName: string): Promise<WeatherData> {
  const cacheKey = `weather_${lat}_${lon}`;
  const cached = cache.get<WeatherData>(cacheKey);
  if (cached) return cached;

  try {
    const [weatherRes, marineRes] = await Promise.all([
      axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: lat,
          longitude: lon,
          current: 'temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation',
          hourly: 'temperature_2m,windspeed_10m,winddirection_10m,precipitation,weathercode',
          daily: 'sunrise,sunset',
          forecast_days: 7,
          wind_speed_unit: 'kn',
          timezone: 'Europe/Paris',
        },
      }),
      axios.get('https://marine-api.open-meteo.com/v1/marine', {
        params: {
          latitude: lat,
          longitude: lon,
          hourly: 'wave_height,wave_direction,wave_period,sea_surface_temperature',
          forecast_days: 7,
          timezone: 'Europe/Paris',
        },
      }),
    ]);

    const data: WeatherData = {
      current: {
        temperature: weatherRes.data.current.temperature_2m,
        windspeed: weatherRes.data.current.windspeed_10m,
        winddirection: weatherRes.data.current.winddirection_10m,
        weathercode: weatherRes.data.current.weathercode,
        precipitation: weatherRes.data.current.precipitation,
        time: weatherRes.data.current.time,
      },
      hourly: weatherRes.data.hourly,
      daily: {
        sunrise: weatherRes.data.daily.sunrise,
        sunset: weatherRes.data.daily.sunset,
      },
      marine: { hourly: marineRes.data.hourly },
      location: { lat, lon, name: locationName },
    };

    cache.set(cacheKey, data);
    return data;
  } catch {
    // External API unavailable — return realistic mock data
    const mock = generateMockData(lat, lon, locationName);
    cache.set(cacheKey, mock);
    return mock;
  }
}

import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 }); // 10 minutes cache

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
  location: {
    lat: number;
    lon: number;
    name: string;
  };
}

export async function fetchWeather(lat: number, lon: number, locationName: string): Promise<WeatherData> {
  const cacheKey = `weather_${lat}_${lon}`;
  const cached = cache.get<WeatherData>(cacheKey);
  if (cached) return cached;

  const [weatherRes, marineRes] = await Promise.all([
    axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation',
        hourly: 'temperature_2m,windspeed_10m,winddirection_10m,precipitation,weathercode',
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
    marine: {
      hourly: marineRes.data.hourly,
    },
    location: { lat, lon, name: locationName },
  };

  cache.set(cacheKey, data);
  return data;
}

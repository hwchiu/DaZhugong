import { useEffect, useState } from 'react';

const FALLBACK_COORDS = { latitude: 25.033, longitude: 121.565 }; // Taipei
const GEOLOCATION_TIMEOUT_MS = 4000;
const WEATHER_FETCH_TIMEOUT_MS = 4000;

const WEATHER_CODE_ICONS = new Map([
  [0, '☀️'],
  [1, '🌤️'],
  [2, '⛅'],
  [3, '☁️'],
  [45, '🌫️'],
  [48, '🌫️'],
  [51, '🌦️'],
  [53, '🌦️'],
  [55, '🌦️'],
  [61, '🌧️'],
  [63, '🌧️'],
  [65, '🌧️'],
  [71, '🌨️'],
  [73, '🌨️'],
  [75, '🌨️'],
  [80, '🌦️'],
  [81, '🌧️'],
  [82, '⛈️'],
  [95, '⛈️'],
  [96, '⛈️'],
  [99, '⛈️'],
]);

const WEATHER_CODE_LABELS = new Map([
  [0, '晴天'],
  [1, '晴時多雲'],
  [2, '多雲轉晴'],
  [3, '多雲'],
  [45, '有霧'],
  [48, '有霧'],
  [51, '小雨'],
  [53, '小雨'],
  [55, '小雨'],
  [61, '陣雨'],
  [63, '陣雨'],
  [65, '大雨'],
  [71, '小雪'],
  [73, '小雪'],
  [75, '大雪'],
  [80, '陣雨'],
  [81, '陣雨'],
  [82, '大雷雨'],
  [95, '雷雨'],
  [96, '雷雨'],
  [99, '雷雨'],
]);

function getWeatherIcon(code) {
  return WEATHER_CODE_ICONS.get(code) ?? '🌡️';
}

function getWeatherLabel(code) {
  return WEATHER_CODE_LABELS.get(code) ?? '天氣多變';
}

function requestCurrentPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) {
      resolve(FALLBACK_COORDS);
      return;
    }

    const timeoutId = setTimeout(() => resolve(FALLBACK_COORDS), GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        clearTimeout(timeoutId);
        resolve(FALLBACK_COORDS);
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function fetchCurrentWeather({ latitude, longitude }, signal) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error('weather request failed');
  }

  const payload = await response.json();
  const temperature = payload?.current?.temperature_2m;
  const weatherCode = payload?.current?.weather_code;

  if (typeof temperature !== 'number') {
    throw new Error('weather payload missing temperature');
  }

  return { temperature, weatherCode };
}

export default function DateWeatherBar() {
  const [weather, setWeather] = useState(null);
  const [weatherFailed, setWeatherFailed] = useState(false);

  useEffect(() => {
    if (typeof fetch !== 'function') {
      setWeatherFailed(true);
      return undefined;
    }

    let cancelled = false;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), WEATHER_FETCH_TIMEOUT_MS);

    requestCurrentPosition()
      .then((coords) => fetchCurrentWeather(coords, controller?.signal))
      .then((result) => {
        if (!cancelled) {
          setWeather(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWeatherFailed(true);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller?.abort();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={weather ? `目前天氣${getWeatherLabel(weather.weatherCode)}，約 ${Math.round(weather.temperature)} 度` : '天氣資訊暫時無法取得'}
      className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm shadow-stone-200"
    >
      {weather ? (
        <>
          <span aria-hidden="true">{getWeatherIcon(weather.weatherCode)}</span>
          <span>{Math.round(weather.temperature)}°C {getWeatherLabel(weather.weatherCode)}</span>
        </>
      ) : weatherFailed ? (
        <>
          <span aria-hidden="true">🌤️</span>
          <span>天氣暫時無法取得</span>
        </>
      ) : (
        <span>天氣讀取中…</span>
      )}
    </div>
  );
}

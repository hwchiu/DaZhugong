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

function getWeatherIcon(code) {
  return WEATHER_CODE_ICONS.get(code) ?? '🌡️';
}

function formatTodayLabel(date) {
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  return formatter.format(date);
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
  const [today] = useState(() => new Date());
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

  const dateLabel = formatTodayLabel(today);

  return (
    <div className="flex items-center justify-between text-amber-100/90">
      <p className="text-sm font-semibold tracking-[0.08em]">{dateLabel}</p>
      <div
        role="status"
        aria-live="polite"
        aria-label={weather ? `目前天氣約 ${Math.round(weather.temperature)} 度` : '天氣資訊暫時無法取得'}
        className="flex items-center gap-1.5 rounded-full border border-amber-200/20 bg-black/20 px-3 py-1 text-xs font-semibold"
      >
        {weather ? (
          <>
            <span aria-hidden="true">{getWeatherIcon(weather.weatherCode)}</span>
            <span>{Math.round(weather.temperature)}°C</span>
          </>
        ) : weatherFailed ? (
          <>
            <span aria-hidden="true">🌤️</span>
            <span>--°C</span>
          </>
        ) : (
          <span>天氣讀取中…</span>
        )}
      </div>
    </div>
  );
}

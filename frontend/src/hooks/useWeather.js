import { useEffect, useState } from 'react';

const FALLBACK_COORDS = { latitude: 25.033, longitude: 121.565 }; // Taipei
const GEOLOCATION_TIMEOUT_MS = 4000;
const WEATHER_FETCH_TIMEOUT_MS = 4000;

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

// 單一天氣抓取邏輯，讓 DateWeatherBar(顯示用chip) 跟 WeatherBackground(背景特效)
// 共用同一次API呼叫結果，不用各自重複打一次open-meteo。
export function useWeather() {
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

  return { weather, weatherFailed };
}

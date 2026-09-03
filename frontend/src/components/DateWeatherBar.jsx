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

// 天氣資料改由父層(Home.jsx)透過 useWeather() 抓一次、往下傳，
// 這樣同一份資料可以同時給這個chip跟WeatherBackground背景特效用，不用各自打兩次API。
export default function DateWeatherBar({ weather, weatherFailed }) {
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

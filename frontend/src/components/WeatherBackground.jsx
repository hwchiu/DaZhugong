const WEATHER_CATEGORY_BY_CODE = new Map([
  [0, 'sunny'],
  [1, 'sunny'],
  [2, 'cloudy'],
  [3, 'cloudy'],
  [45, 'fog'],
  [48, 'fog'],
  [51, 'drizzle'],
  [53, 'drizzle'],
  [55, 'drizzle'],
  [80, 'drizzle'],
  [61, 'rain'],
  [63, 'rain'],
  [65, 'rain'],
  [81, 'rain'],
  [71, 'snow'],
  [73, 'snow'],
  [75, 'snow'],
  [82, 'storm'],
  [95, 'storm'],
  [96, 'storm'],
  [99, 'storm'],
]);

const RAINDROP_COUNT_BY_CATEGORY = {
  drizzle: 16,
  rain: 30,
  storm: 34,
};

export function getWeatherCategory(code) {
  return WEATHER_CATEGORY_BY_CODE.get(code) ?? null;
}

function RainLayer({ category }) {
  const count = RAINDROP_COUNT_BY_CATEGORY[category] ?? 24;
  const drops = Array.from({ length: count }, (_, index) => index);
  const isSlow = category === 'drizzle';

  return (
    <div className={`weather-fx-rain ${isSlow ? 'weather-fx-rain-slow' : 'weather-fx-rain-fast'}`}>
      {drops.map((index) => (
        <span
          key={index}
          className="weather-fx-raindrop"
          style={{
            left: `${(index * 29) % 100}%`,
            animationDelay: `${(index % 12) * 0.15}s`,
            animationDuration: `${isSlow ? 1.7 : 0.75 + (index % 3) * 0.08}s`,
          }}
        />
      ))}
      {category === 'storm' ? <div className="weather-fx-lightning" /> : null}
    </div>
  );
}

function SunLayer() {
  return (
    <div className="weather-fx-sunny">
      <div className="weather-fx-sun-glow" />
      <div className="weather-fx-sun-ray weather-fx-sun-ray-1" />
      <div className="weather-fx-sun-ray weather-fx-sun-ray-2" />
      <div className="weather-fx-sun-ray weather-fx-sun-ray-3" />
    </div>
  );
}

function FogLayer() {
  return (
    <div className="weather-fx-fog">
      <div className="weather-fx-fog-band weather-fx-fog-band-1" />
      <div className="weather-fx-fog-band weather-fx-fog-band-2" />
    </div>
  );
}

function SnowLayer() {
  const flakes = Array.from({ length: 22 }, (_, index) => index);

  return (
    <div className="weather-fx-snow">
      {flakes.map((index) => (
        <span
          key={index}
          className="weather-fx-snowflake"
          style={{
            left: `${(index * 31) % 100}%`,
            animationDelay: `${(index % 9) * 0.55}s`,
            animationDuration: `${6 + (index % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

// 純CSS動畫實作(沒有canvas/JS動畫迴圈)：多雲天氣刻意不做效果，保持畫面乾淨不會太雜。
// 尊重 prefers-reduced-motion 的部分寫在 index.css 裡，不在這個元件內另外判斷。
export default function WeatherBackground({ weatherCode }) {
  const category = getWeatherCategory(weatherCode);

  if (!category || category === 'cloudy') {
    return null;
  }

  return (
    <div aria-hidden="true" className="weather-fx-layer">
      {category === 'sunny' ? <SunLayer /> : null}
      {category === 'fog' ? <FogLayer /> : null}
      {category === 'snow' ? <SnowLayer /> : null}
      {category === 'drizzle' || category === 'rain' || category === 'storm' ? (
        <RainLayer category={category} />
      ) : null}
    </div>
  );
}

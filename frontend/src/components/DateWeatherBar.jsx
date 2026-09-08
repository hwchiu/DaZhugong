import iconSunny from '../assets/lego-icons/weather/sunny.png';
import iconPartlyCloudy from '../assets/lego-icons/weather/partly_cloudy.png';
import iconOvercast from '../assets/lego-icons/weather/overcast.png';
import iconFog from '../assets/lego-icons/weather/fog.png';
import iconDrizzleLight from '../assets/lego-icons/weather/drizzle_light.png';
import iconDrizzle from '../assets/lego-icons/weather/drizzle.png';
import iconDrizzleDense from '../assets/lego-icons/weather/drizzle_dense.png';
import iconRain from '../assets/lego-icons/weather/rain.png';
import iconSnowLight from '../assets/lego-icons/weather/snow_light.png';
import iconSnowHeavy from '../assets/lego-icons/weather/snow_heavy.png';
import iconThunderstorm from '../assets/lego-icons/weather/thunderstorm.png';
import iconThunderstormSevere from '../assets/lego-icons/weather/thunderstorm_severe.png';

// Open-Meteo的weather_code(WMO標準代碼)對應到使用者提供的樂高風格天氣圖示。
// 有些相近代碼(例如1跟2、61/63/81這種同一種天氣不同強度)目前手上只有一張對應的
// 圖，就共用同一張圖示——這是因為切出來的樂高圖示集本身沒有對應到每一個WMO代碼的
// 專屬畫面，共用同一張圖示比硬找一張語意不符的圖更合理。文字說明(WEATHER_CODE_LABELS)
// 維持原本的細分，不受圖示共用影響。
const WEATHER_CODE_ICON_SRC = new Map([
  [0, iconSunny],
  [1, iconPartlyCloudy],
  [2, iconPartlyCloudy],
  [3, iconOvercast],
  [45, iconFog],
  [48, iconFog],
  [51, iconDrizzleLight],
  [53, iconDrizzle],
  [55, iconDrizzleDense],
  [61, iconRain],
  [63, iconRain],
  [65, iconRain],
  [71, iconSnowLight],
  [73, iconSnowLight],
  [75, iconSnowHeavy],
  [80, iconDrizzleDense],
  [81, iconRain],
  [82, iconThunderstormSevere],
  [95, iconThunderstorm],
  [96, iconThunderstormSevere],
  [99, iconThunderstormSevere],
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

function getWeatherIconSrc(code) {
  return WEATHER_CODE_ICON_SRC.get(code) ?? iconPartlyCloudy;
}

function getWeatherLabel(code) {
  return WEATHER_CODE_LABELS.get(code) ?? '天氣多變';
}

// 天氣資料改由父層(Home.jsx)透過 useWeather() 抓一次、往下傳，
// 這樣同一份資料可以同時給這個chip跟WeatherBackground背景特效用，不用各自打兩次API。
export default function DateWeatherBar({ weather, weatherFailed, glass = false }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={weather ? `目前天氣${getWeatherLabel(weather.weatherCode)}，約 ${Math.round(weather.temperature)} 度` : '天氣資訊暫時無法取得'}
      className={
        glass
          ? 'flex items-center gap-1.5 rounded-full bg-white/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md'
          : 'flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm shadow-stone-200'
      }
    >
      {weather ? (
        <>
          <img src={getWeatherIconSrc(weather.weatherCode)} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
          <span>{Math.round(weather.temperature)}°C {getWeatherLabel(weather.weatherCode)}</span>
        </>
      ) : weatherFailed ? (
        <>
          <img src={iconPartlyCloudy} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
          <span>天氣暫時無法取得</span>
        </>
      ) : (
        <span>天氣讀取中…</span>
      )}
    </div>
  );
}

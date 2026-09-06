// 每天固定一張、隔天自動換的背景照片：用Picsum Photos的seed功能，seed吃當天日期字串，
// 同一天大家看到同一張、每天自動輪替下一張。Picsum不用API key、不用申請帳號。
//
// 這支函式故意獨立成一個檔案，不放在 components/PiggyBank3D.jsx 裡：那支檔案的
// 預設匯出含Three.js/GLTFLoader等重量級相依套件，Home.jsx用 lazy(() => import(...))
// 延遲載入它是刻意的效能設計(見 Home.jsx 的 loadPiggyBank3D)。如果Home.jsx為了拿這支
// 純日期字串函式而直接靜態import PiggyBank3D.jsx，會把Three.js一起拉進首頁的主要
// bundle，等於讓那個延遲載入的最佳化完全失效——之前改Stats.jsx時就踩過同一個坑，
// 這次直接把函式移出來，兩邊(Home.jsx的頁面背景、PiggyBank3D.jsx的環境貼圖)各自
// import這個輕量檔案，不會互相拖累。
// 這裡的預設尺寸故意設成直式(portrait, 2:3)而不是橫式：這個背景照片實際顯示的地方
// (首頁的固定背景區塊)本身就是手機直式螢幕比例，如果跟Picsum要一張很寬的橫式照片
// (例如原本的1000x700)，object-cover雖然理論上不會露出空白，但等於要把接近一半的
// 照片寬度裁掉才能填滿直式畫面，裁切幅度過大、照片本身能看到的內容也變得很少。
// 改成直接跟Picsum要一張跟顯示區域比例接近的直式照片，裁切幅度小很多。
export function getDailyBackgroundPhotoUrl(width = 800, height = 1200) {
  const now = new Date();
  const seed = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

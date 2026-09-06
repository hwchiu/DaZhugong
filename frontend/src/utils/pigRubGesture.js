// 「持續摩擦豬公2秒」的手勢判定邏輯，故意獨立成不碰Three.js/DOM的純函式狀態機，
// 這樣可以直接單元測試「長按不動不觸發」「摩擦累積夠久+夠遠才觸發」「中斷太久要重置」
// 這些spec寫死的驗收條件(AC03/AC04)，不需要真的跑WebGL。
//
// 設計對應 spec section 5.1/5.2/31：
// - 不要求畫圓，只要「持續有位移」即可(累積各方向移動量的絕對值，不是位移向量的淨長度，
//   這樣來回摩擦也算數，不會因為手指移回原點而把累積歸零)。
// - 連續動作中斷超過 maxIdleGapMs 視為放棄，重新從0累積(spec 5.2)。
// - 觸發條件為「時間到 且 累積位移量到」同時成立，不是任一個先到就觸發(spec 6)。

export const RUB_REQUIRED_DURATION_MS = 2000;
export const RUB_MIN_DISTANCE_PX = 120;
export const RUB_MAX_IDLE_GAP_MS = 300;

// 回傳一個新的tracker實例；每個tracker只negotiate一次觸發(觸發後locked，需呼叫reset()才能再次使用)，
// 對應 spec section 32「觸發後鎖住偵測，直到流程結束才reset」。
export function createRubTracker({
  requiredDurationMs = RUB_REQUIRED_DURATION_MS,
  minDistancePx = RUB_MIN_DISTANCE_PX,
  maxIdleGapMs = RUB_MAX_IDLE_GAP_MS,
} = {}) {
  let active = false;
  let locked = false;
  let startTime = 0;
  let lastMoveTime = 0;
  let accumulatedDistance = 0;

  function progressRatio(now) {
    if (!active) {
      return 0;
    }
    const durationRatio = Math.min(1, (now - startTime) / requiredDurationMs);
    const distanceRatio = Math.min(1, accumulatedDistance / minDistancePx);
    // 兩個條件都要滿足才算完成，所以進度顯示取「比較慢的那一個」，
    // 避免使用者看到100%卻還沒真的觸發(例如站著不動、時間到了但距離不夠)。
    return Math.min(durationRatio, distanceRatio);
  }

  return {
    // 手指/滑鼠按下：開始一段新的摩擦嘗試(如果已經lock就什麼都不做)。
    onStart(now) {
      if (locked) {
        return { active: false, progress: 0, triggered: false };
      }
      active = true;
      startTime = now;
      lastMoveTime = now;
      accumulatedDistance = 0;
      return { active: true, progress: 0, triggered: false };
    },

    // 移動：累加位移量(取dx/dy各自絕對值相加，不是歐幾里得距離，來回抖動也算摩擦)。
    // 若距離上次move超過maxIdleGapMs，代表中斷太久，整段重新起算(spec 5.2)。
    onMove(now, dx, dy) {
      if (locked || !active) {
        return { active, progress: locked ? 0 : progressRatio(now), triggered: false };
      }

      if (now - lastMoveTime > maxIdleGapMs) {
        startTime = now;
        accumulatedDistance = 0;
      }
      lastMoveTime = now;
      accumulatedDistance += Math.abs(dx) + Math.abs(dy);

      const duration = now - startTime;
      const triggered = duration >= requiredDurationMs && accumulatedDistance >= minDistancePx;
      if (triggered) {
        locked = true;
        active = false;
      }
      return { active: !triggered, progress: triggered ? 1 : progressRatio(now), triggered };
    },

    // 放開：若這次沒有成功觸發，進度歸零(不保留跨越放開/按下之間的累積)，
    // 對應spec 5.1描述的「持續在豬公上面移動即可」，放開等於中斷這一段嘗試。
    onEnd() {
      if (!locked) {
        active = false;
        accumulatedDistance = 0;
      }
      return { active: false, progress: 0, triggered: false };
    },

    // 解除鎖定，讓下一次流程結束後可以重新偵測(spec section 32)。
    reset() {
      locked = false;
      active = false;
      accumulatedDistance = 0;
    },

    isLocked() {
      return locked;
    },
  };
}

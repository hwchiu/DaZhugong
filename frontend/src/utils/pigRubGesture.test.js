import { describe, expect, it } from 'vitest';
import { createRubTracker, RUB_MAX_IDLE_GAP_MS, RUB_MIN_DISTANCE_PX, RUB_REQUIRED_DURATION_MS } from './pigRubGesture.js';

describe('createRubTracker', () => {
  it('AC03: 長按不移動2秒不得觸發(時間到但距離為0)', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    // 完全沒有onMove(等同按住不動)，只在放開時檢查
    const result = tracker.onEnd();
    expect(result.triggered).toBe(false);
    expect(tracker.isLocked()).toBe(false);
  });

  it('AC03變形: 有呼叫onMove但每次dx/dy都是0，時間到也不能觸發', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    let result;
    for (let t = 100; t <= RUB_REQUIRED_DURATION_MS + 500; t += 100) {
      result = tracker.onMove(t, 0, 0);
    }
    expect(result.triggered).toBe(false);
    expect(tracker.isLocked()).toBe(false);
  });

  it('AC04: 累積移動達到門檻且經過時間達到門檻才觸發', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    let result;
    // 每100ms移動6px，20次=2000ms、120px，剛好卡在門檻邊界上
    for (let i = 1; i <= 20; i += 1) {
      result = tracker.onMove(i * 100, 6, 0);
    }
    expect(result.triggered).toBe(true);
    expect(tracker.isLocked()).toBe(true);
  });

  it('距離足夠但時間不夠不觸發', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    // 在很短時間內快速累積很大位移量，但總經過時間 < 2000ms
    const result = tracker.onMove(500, 200, 0);
    expect(result.triggered).toBe(false);
  });

  it('時間夠但距離不夠不觸發', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    let result;
    for (let t = 500; t <= 2500; t += 500) {
      result = tracker.onMove(t, 1, 0); // 5次共5px，遠低於120px門檻
    }
    expect(result.triggered).toBe(false);
  });

  it('中斷超過maxIdleGapMs要重置累積量與起始時間', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    tracker.onMove(100, 100, 0); // 已經有100px
    // 中斷超過300ms才繼續移動 -> 前面的100ms/100px應該被清空重算
    const afterGap = tracker.onMove(100 + RUB_MAX_IDLE_GAP_MS + 50, 6, 0);
    expect(afterGap.triggered).toBe(false);
    // 從gap之後才重新起算時間，即使再過2秒也要重新累積滿120px才會觸發
    let result;
    for (let i = 1; i <= 20; i += 1) {
      result = tracker.onMove(100 + RUB_MAX_IDLE_GAP_MS + 50 + i * 100, 6, 0);
    }
    expect(result.triggered).toBe(true);
  });

  it('放開時尚未觸發，進度應該歸零，下一次重新按下要重新累積', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    tracker.onMove(500, 60, 0);
    tracker.onEnd();

    tracker.onStart(1000);
    // 只補上另外60px，若沒有正確歸零，加起來會誤觸發(60+60=120)；
    // 正確行為是這次要重新累積到120px才行。
    const result = tracker.onMove(1000 + 500, 60, 0);
    expect(result.triggered).toBe(false);
  });

  it('觸發後鎖定(locked)，reset()之前不可再次觸發', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    for (let i = 1; i <= 20; i += 1) {
      tracker.onMove(i * 100, 6, 0);
    }
    expect(tracker.isLocked()).toBe(true);

    tracker.onStart(3000);
    const result = tracker.onMove(3500, 200, 0);
    expect(result.triggered).toBe(false);

    tracker.reset();
    expect(tracker.isLocked()).toBe(false);
    tracker.onStart(4000);
    let afterReset;
    for (let i = 1; i <= 20; i += 1) {
      afterReset = tracker.onMove(4000 + i * 100, 6, 0);
    }
    expect(afterReset.triggered).toBe(true);
  });

  it('累積位移用絕對值相加(來回摩擦)，不是淨位移向量長度', () => {
    const tracker = createRubTracker();
    tracker.onStart(0);
    let result;
    // 來回擺動：+60, -60, +60, -60... 淨位移接近0，但絕對值總和會持續累積
    const deltas = [60, -60, 60, -60, 60, -60, 60, -60, 60, -60, 60, -60, 60, -60, 60, -60, 60, -60, 60, -60];
    for (let i = 0; i < deltas.length; i += 1) {
      result = tracker.onMove((i + 1) * 100, deltas[i], 0);
    }
    expect(result.triggered).toBe(true);
  });

  it('RUB_MIN_DISTANCE_PX/RUB_REQUIRED_DURATION_MS/RUB_MAX_IDLE_GAP_MS對應spec規定的常數值', () => {
    expect(RUB_REQUIRED_DURATION_MS).toBe(2000);
    expect(RUB_MIN_DISTANCE_PX).toBe(120);
    expect(RUB_MAX_IDLE_GAP_MS).toBe(300);
  });
});

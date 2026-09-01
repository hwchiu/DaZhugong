import { useEffect, useState } from 'react';

function getStorageKey(groupId) {
  return `dazhugong:goalToken:${groupId ?? 'default'}`;
}

function readStoredGoal(groupId) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(groupId));
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredGoal(groupId, goal) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    if (goal === null) {
      window.localStorage.removeItem(getStorageKey(groupId));
    } else {
      window.localStorage.setItem(getStorageKey(groupId), String(goal));
    }
  } catch {
    // Ignore storage failures (e.g. private browsing quota errors).
  }
}

export default function GoalTokenControl({ groupId, totalTokens }) {
  const [goal, setGoal] = useState(() => readStoredGoal(groupId));
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState('');

  useEffect(() => {
    setGoal(readStoredGoal(groupId));
  }, [groupId]);

  const remaining = goal !== null ? Math.max(goal - totalTokens, 0) : null;
  const isGoalReached = goal !== null && remaining === 0;

  function openEditor() {
    setDraftValue(goal !== null ? String(goal) : '');
    setIsEditing(true);
  }

  function closeEditor() {
    setIsEditing(false);
  }

  function handleSave(event) {
    event.preventDefault();
    const parsed = Number(draftValue);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    const rounded = Math.round(parsed);
    setGoal(rounded);
    writeStoredGoal(groupId, rounded);
    setIsEditing(false);
  }

  function handleClear() {
    setGoal(null);
    writeStoredGoal(groupId, null);
    setIsEditing(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openEditor}
        aria-haspopup="dialog"
        aria-expanded={isEditing}
        className="flex min-h-9 items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      >
        <span aria-hidden="true">🎯</span>
        <span>{goal !== null ? '目標' : '設定目標'}</span>
      </button>

      {goal !== null && !isEditing ? (
        <p className="mt-1 max-w-[9rem] text-right text-[0.7rem] font-medium leading-4 text-amber-200/80">
          {isGoalReached ? '🎉 已達成目標！' : `距離 ${goal} 還差 ${remaining} Token`}
        </p>
      ) : null}

      {isEditing ? (
        <div
          role="dialog"
          aria-label="設定目標 Token"
          className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-amber-200/30 bg-stone-900 p-4 text-left shadow-xl shadow-black/40"
        >
          <form onSubmit={handleSave}>
            <label htmlFor="goal-token-input" className="text-xs font-semibold text-amber-100">
              目標 Token 數量
            </label>
            <input
              id="goal-token-input"
              type="number"
              inputMode="numeric"
              min="1"
              autoFocus
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              className="mt-2 w-full rounded-xl border border-amber-200/30 bg-stone-950 px-3 py-2 text-sm font-semibold text-amber-50 outline-none focus-visible:border-amber-300"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full px-2 py-1 text-xs font-semibold text-amber-200/70 hover:text-amber-100"
              >
                清除目標
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-amber-200/30 px-3 py-1.5 text-xs font-semibold text-amber-100/80"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold text-stone-950"
                >
                  儲存
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

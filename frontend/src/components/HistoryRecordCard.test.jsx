import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HistoryRecordCard from './HistoryRecordCard.jsx';

afterEach(cleanup);

function buildToken(overrides = {}) {
  return {
    id: 't1',
    reporterId: 'reporter',
    targetId: 'target',
    timestamp: Date.UTC(2026, 8, 7, 4, 0),
    reason: '討論會議',
    ...overrides,
  };
}

const reporter = { id: 'reporter', name: '牛哥', active: true };
const target = { id: 'target', name: '房產大亨', active: true };

describe('HistoryRecordCard', () => {
  it("general perspective shows the target's avatar and the full reporter-to-target sentence", () => {
    render(
      <HistoryRecordCard
        token={buildToken()}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'someone-else' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );

    expect(screen.getByRole('img', { name: '房產大亨' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: '牛哥' })).toBe(null);
    expect(screen.getByText('牛哥')).toBeTruthy();
    expect(screen.getByText('房產大亨')).toBeTruthy();
  });

  it('votedAgainstMe perspective replaces the target name with "我" but still shows the target avatar', () => {
    render(
      <HistoryRecordCard
        token={buildToken()}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'target' }}
        perspective="votedAgainstMe"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );

    expect(screen.getByRole('img', { name: '房產大亨' })).toBeTruthy();
    expect(screen.getByText('我')).toBeTruthy();
    expect(screen.queryByText('房產大亨', { selector: 'span.font-semibold' })).toBe(null);
  });

  it('shows the 申訴 button only when the token targets the current member', () => {
    const { rerender } = render(
      <HistoryRecordCard
        token={buildToken()}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'target' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '申訴' })).toBeTruthy();

    rerender(
      <HistoryRecordCard
        token={buildToken()}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'reporter' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: '申訴' })).toBe(null);
  });

  it('calls onFileAppeal with the token when 申訴 is clicked', async () => {
    const user = userEvent.setup();
    const onFileAppeal = vi.fn();
    render(
      <HistoryRecordCard
        token={buildToken()}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'target' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={onFileAppeal}
        onConfirmAppeal={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: '申訴' }));
    expect(onFileAppeal).toHaveBeenCalledWith(buildToken());
  });

  it('shows the special token badge and +5 value distinctly', () => {
    render(
      <HistoryRecordCard
        token={buildToken({ tokenType: 'SPECIAL_5X', tokenValue: 5, source: 'PIG_RUB_EASTER_EGG' })}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'someone-else' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );

    expect(screen.getByText('特殊 5x')).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
  });

  it('shows an active appeal state with the confirm button for other members, not the record owner', () => {
    const token = buildToken({ appealedAt: Date.UTC(2026, 8, 7, 5, 0), appealConfirmedBy: ['someone'] });

    const { rerender } = render(
      <HistoryRecordCard
        token={token}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'other-member' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );
    expect(screen.getByText('申訴中（1/3 人確認）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認' })).toBeTruthy();

    rerender(
      <HistoryRecordCard
        token={token}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'target' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: '確認' })).toBe(null);
  });

  it('falls back to a legacy-record note when reason is missing', () => {
    render(
      <HistoryRecordCard
        token={buildToken({ reason: '' })}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'someone-else' }}
        perspective="general"
        isBusy={false}
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );

    expect(screen.getByText(/未填寫原因（舊版紀錄）/)).toBeTruthy();
  });

  it('disables the 申訴 button while an action is pending', () => {
    render(
      <HistoryRecordCard
        token={buildToken()}
        reporter={reporter}
        target={target}
        currentMember={{ id: 'target' }}
        perspective="general"
        isBusy
        onFileAppeal={() => {}}
        onConfirmAppeal={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: '處理中…' }).disabled).toBe(true);
  });
});

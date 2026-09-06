import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportSpecialTokenMock = vi.hoisted(() => vi.fn());

vi.mock('../services/tokenService.js', () => ({
  reportSpecialToken: reportSpecialTokenMock,
}));

import SpecialTokenFlow from './SpecialTokenFlow.jsx';

const currentMember = { id: 'me', name: '虎爺' };
const members = [
  { id: 'me', name: '虎爺', active: true },
  { id: 'kevin', name: 'Kevin', active: true },
  { id: 'amy', name: 'Amy', active: true },
  { id: 'inactive-guy', name: '離職的人', active: false },
];

beforeEach(() => {
  reportSpecialTokenMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('SpecialTokenFlow', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <SpecialTokenFlow open={false} groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBe(null);
  });

  it('shows the summon success modal first, mentioning the 5x multiplier', () => {
    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />);
    expect(screen.getByText('成功召喚特殊 Token！')).toBeTruthy();
    expect(screen.getByText('5x 倍大')).toBeTruthy();
  });

  it('member select only lists active members other than the current user (excludes self and inactive)', async () => {
    const user = userEvent.setup();
    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '前往投票' }));

    expect(screen.getByRole('button', { name: /Kevin/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Amy/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /虎爺/ })).not.toBeTruthy();
    expect(screen.queryByRole('button', { name: /離職的人/ })).not.toBeTruthy();
  });

  it('選成員後進入原因畫面，沒有選原因時不能送出', async () => {
    const user = userEvent.setup();
    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '前往投票' }));
    await user.click(screen.getByRole('button', { name: /Kevin/ }));

    expect(screen.getByText('選擇原因')).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認投出' }).disabled).toBe(true);
  });

  it('選preset原因後可以送出，成功後呼叫reportSpecialToken帶正確參數，並依序經過投入動畫到成功畫面', async () => {
    const user = userEvent.setup();
    reportSpecialTokenMock.mockResolvedValue({ id: 'report-1' });
    const onClose = vi.fn();

    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '前往投票' }));
    await user.click(screen.getByRole('button', { name: /Kevin/ }));
    await user.click(screen.getByRole('button', { name: '討論會議' }));
    await user.click(screen.getByRole('button', { name: '確認投出' }));

    await waitFor(() => {
      expect(reportSpecialTokenMock).toHaveBeenCalledWith({
        groupId: 'main',
        targetId: 'kevin',
        targetMember: expect.objectContaining({ id: 'kevin' }),
        currentMember,
        reason: '討論會議',
      });
    });

    // 投入動畫階段：一開始還沒顯示成功畫面
    expect(screen.queryByText('已投出特殊 Token！')).not.toBeTruthy();

    // 動畫結束(DROP_ANIMATION_MS)後自動轉成成功畫面，用真實計時器等待，
    // 避免fake timer跟userEvent/waitFor的內部輪詢互相卡住。
    await waitFor(() => {
      expect(screen.getByText('已投出特殊 Token！')).toBeTruthy();
    }, { timeout: 3000 });

    expect(screen.getByText('你投給了 Kevin')).toBeTruthy();
    expect(screen.getByText('+5 枚 Token')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '太棒了！' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('可以輸入自訂原因(不用preset)', async () => {
    const user = userEvent.setup();
    reportSpecialTokenMock.mockResolvedValue({ id: 'report-1' });

    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '前往投票' }));
    await user.click(screen.getByRole('button', { name: /Amy/ }));
    await user.type(screen.getByPlaceholderText('或自己輸入原因'), '自訂原因文字');
    await user.click(screen.getByRole('button', { name: '確認投出' }));

    await waitFor(() => {
      expect(reportSpecialTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: 'amy', reason: '自訂原因文字' }),
      );
    });
  });

  it('reportSpecialToken失敗時顯示安全錯誤訊息，不外洩原始錯誤內容，並停留在原因畫面', async () => {
    const user = userEvent.setup();
    reportSpecialTokenMock.mockRejectedValue(new Error('internal firestore permission detail'));

    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '前往投票' }));
    await user.click(screen.getByRole('button', { name: /Kevin/ }));
    await user.click(screen.getByRole('button', { name: '討論會議' }));
    await user.click(screen.getByRole('button', { name: '確認投出' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('請稍後再試');
    });
    expect(screen.queryByText('internal firestore permission detail')).not.toBeTruthy();
    // 還在原因畫面，可以重試
    expect(screen.getByRole('button', { name: '確認投出' })).toBeTruthy();
  });

  it('「晚點再說」跟「返回」不會呼叫reportSpecialToken，晚點再說會呼叫onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '前往投票' }));
    await user.click(screen.getByRole('button', { name: '晚點再說' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(reportSpecialTokenMock).not.toHaveBeenCalled();
  });

  it('沒有其他可選成員時顯示提示訊息，而不是空白畫面', async () => {
    const user = userEvent.setup();
    render(
      <SpecialTokenFlow
        open
        groupId="main"
        currentMember={currentMember}
        members={[{ id: 'me', name: '虎爺', active: true }]}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '前往投票' }));
    expect(screen.getByText(/目前沒有其他成員可以投/)).toBeTruthy();
  });

  it('重新打開流程(open從false變true)會重置狀態回到SUMMON_MODAL', () => {
    const { rerender } = render(
      <SpecialTokenFlow open={false} groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />,
    );
    rerender(
      <SpecialTokenFlow open groupId="main" currentMember={currentMember} members={members} onClose={vi.fn()} />,
    );
    expect(screen.getByText('成功召喚特殊 Token！')).toBeTruthy();
  });
});

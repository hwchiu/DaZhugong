import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VoteMemberCard from './VoteMemberCard.jsx';

afterEach(() => {
  cleanup();
});

function buildMember(overrides = {}) {
  return {
    id: 'member-1',
    name: '小華',
    active: true,
    confirmedCount: 3,
    cooldown: { inCooldown: false, remainingMs: 0, expiresAt: null },
    ...overrides,
  };
}

describe('VoteMemberCard', () => {
  it('renders a clickable card showing the confirmed vote count, and calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const member = buildMember();

    render(
      <VoteMemberCard member={member} memberName="小華" selected={false} pending={false} isSelf={false} onSelect={onSelect} />,
    );

    const button = screen.getByRole('button', { name: /小華，已確認 3 票/ });
    expect(button.disabled).toBe(false);
    expect(screen.getByText('已確認 3 票')).toBeTruthy();
    expect(screen.getByText('點一下即可選擇。')).toBeTruthy();

    await user.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reflects the selected state via aria-pressed and updated description', () => {
    const member = buildMember();
    render(
      <VoteMemberCard member={member} memberName="小華" selected pending={false} isSelf={false} onSelect={() => {}} />,
    );

    const button = screen.getByRole('button', { name: /小華/ });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('已選擇，準備填寫原因。')).toBeTruthy();
  });

  it('disables the card and shows the countdown badge + sweep overlay while the member is in cooldown', () => {
    const member = buildMember({
      cooldown: { inCooldown: true, remainingMs: 4 * 60_000, expiresAt: Date.now() + 4 * 60_000 },
    });

    const { container } = render(
      <VoteMemberCard member={member} memberName="小華" selected={false} pending={false} isSelf={false} onSelect={() => {}} />,
    );

    const button = screen.getByRole('button', { name: /小華，冷卻中還剩 4:00，暫時無法再次投票/ });
    expect(button.disabled).toBe(true);
    // 倒數計時文字本身保持原樣不變(role="timer")，這是這次調整明確要求不能動的部分。
    expect(screen.getByRole('timer').textContent).toBe('冷卻中 4:00');
    expect(screen.getByText('剛被投過票，需要等冷卻時間結束。')).toBeTruthy();
    // 冷卻扇形遮罩應該要掛上去；遮罩本身的動畫細節由CooldownSweepOverlay.test.jsx驗證，
    // 這裡只需要確認VoteMemberCard真的有在冷卻中把它疊上去。
    expect(container.querySelector('.cooldown-sweep-mask')).toBeTruthy();
  });

  it('does not render the sweep overlay when the member is not in cooldown', () => {
    const { container } = render(
      <VoteMemberCard member={buildMember()} memberName="小華" selected={false} pending={false} isSelf={false} onSelect={() => {}} />,
    );

    expect(container.querySelector('.cooldown-sweep-mask')).toBe(null);
  });

  it('disables the card while a submission is pending, even without cooldown', () => {
    render(
      <VoteMemberCard member={buildMember()} memberName="小華" selected={false} pending isSelf={false} onSelect={() => {}} />,
    );

    expect(screen.getByRole('button', { name: /小華/ }).disabled).toBe(true);
  });

  it('renders the current user as a permanently disabled, non-selectable card labelled with (你)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const member = buildMember({ id: 'self', name: '自己', confirmedCount: 0 });

    render(
      <VoteMemberCard member={member} memberName="自己" selected={false} pending={false} isSelf onSelect={onSelect} />,
    );

    const button = screen.getByRole('button', { name: /自己（你）|自己.*無法選擇自己/ });
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    expect(screen.getByText('（你）')).toBeTruthy();
    expect(screen.getByText('這是你自己，僅顯示冷卻時間，無法選擇。')).toBeTruthy();

    // disabled按鈕在瀏覽器/jsdom裡本來就不會觸發click，這裡順便確認就算被點了
    // 也完全不會呼叫onSelect——這張卡片存在的目的只是顯示資訊，不是拿來選人的。
    await user.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows the self card's own cooldown countdown when someone has voted against them, still with the self description taking priority", () => {
    const member = buildMember({
      id: 'self',
      name: '自己',
      cooldown: { inCooldown: true, remainingMs: 4 * 60_000, expiresAt: Date.now() + 4 * 60_000 },
    });

    render(
      <VoteMemberCard member={member} memberName="自己" selected={false} pending={false} isSelf onSelect={() => {}} />,
    );

    const button = screen.getByRole('button', { name: /自己.*冷卻中還剩 4:00.*無法選擇自己/ });
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('timer').textContent).toBe('冷卻中 4:00');
    // 就算冷卻中，自己卡片的說明文字仍然是「這是你自己」，不是冷卻中的那句提示——
    // 使用者需要知道「為什麼點不了」的主要原因是這是你自己，冷卻只是附加資訊。
    expect(screen.getByText('這是你自己，僅顯示冷卻時間，無法選擇。')).toBeTruthy();
  });
});

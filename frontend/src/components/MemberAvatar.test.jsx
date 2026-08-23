import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MemberAvatar from './MemberAvatar.jsx';

const member = {
  id: 'member-2',
  name: 'Kevin',
  avatar: 'cat',
  color: '#4A90E2',
};

afterEach(() => {
  cleanup();
});

describe('MemberAvatar', () => {
  it('renders an interactive avatar button when onClick is provided', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<MemberAvatar member={member} onClick={onClick} selected size="lg" />);

    const avatarButton = screen.getByRole('button', { name: 'Kevin' });
    expect(avatarButton.textContent).toContain('🐱');
    expect(avatarButton.getAttribute('aria-pressed')).toBe('true');

    await user.click(avatarButton);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a non-interactive avatar when no click handler is provided', () => {
    render(<MemberAvatar member={member} size="sm" />);

    expect(screen.queryByRole('button', { name: 'Kevin' })).toBe(null);
    expect(screen.getByText('Kevin')).toBeTruthy();
    expect(screen.getByLabelText('Kevin').textContent).toContain('🐱');
  });
});

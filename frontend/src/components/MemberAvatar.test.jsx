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
    expect(avatarButton.getAttribute('title')).toBe('Kevin');
    expect(screen.queryByText('Kevin')).toBe(null);

    await user.click(avatarButton);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a non-interactive avatar when no click handler is provided', () => {
    render(<MemberAvatar member={member} size="sm" />);

    expect(screen.queryByRole('button', { name: 'Kevin' })).toBe(null);
    const avatar = screen.getByRole('img', { name: 'Kevin' });
    expect(avatar.getAttribute('title')).toBe('Kevin');
    expect(avatar.textContent).toContain('🐱');
    expect(screen.queryByText('Kevin')).toBe(null);
  });

  it('renders a circular photo avatar (no emoji) for members with a matching real character card', () => {
    render(<MemberAvatar member={{ id: 'm1', name: '虎爺', color: '#f59e0b' }} size="sm" />);

    const avatar = screen.getByRole('img', { name: '虎爺' });
    expect(avatar.tagName).toBe('IMG');
    expect(avatar.className).toContain('rounded-full');
  });

  it('keeps the photo avatar clickable as a button when onClick is provided', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<MemberAvatar member={{ id: 'm2', name: 'Darren', color: '#0ea5e9' }} onClick={onClick} size="md" />);

    const avatarButton = screen.getByRole('button', { name: 'Darren' });
    expect(avatarButton.querySelector('img')).toBeTruthy();

    await user.click(avatarButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

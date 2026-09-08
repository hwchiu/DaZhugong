import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DateWeatherBar from './DateWeatherBar.jsx';

afterEach(() => {
  cleanup();
});

describe('DateWeatherBar', () => {
  it('shows a loading message before weather data arrives', () => {
    render(<DateWeatherBar weather={null} weatherFailed={false} glass />);
    expect(screen.getByText('天氣讀取中…')).toBeTruthy();
  });

  it('renders the matching lego weather icon and rounded temperature for a known weather code', () => {
    render(<DateWeatherBar weather={{ weatherCode: 0, temperature: 27.4 }} weatherFailed={false} />);

    expect(screen.getByText('27°C 晴天')).toBeTruthy();
    const icon = screen.getByRole('status').querySelector('img');
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('src')).toContain('sunny');
  });

  it('falls back to a default icon for an unrecognized weather code, with a generic label', () => {
    render(<DateWeatherBar weather={{ weatherCode: 12345, temperature: 20 }} weatherFailed={false} />);

    expect(screen.getByText('20°C 天氣多變')).toBeTruthy();
  });

  it('shows a failure message when weather could not be fetched at all', () => {
    render(<DateWeatherBar weather={null} weatherFailed />);
    expect(screen.getByText('天氣暫時無法取得')).toBeTruthy();
  });
});

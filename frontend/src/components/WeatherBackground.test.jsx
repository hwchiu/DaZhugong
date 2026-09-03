import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import WeatherBackground, { getWeatherCategory } from './WeatherBackground.jsx';

afterEach(() => {
  cleanup();
});

describe('getWeatherCategory', () => {
  it('maps known WMO codes to the right category', () => {
    expect(getWeatherCategory(0)).toBe('sunny');
    expect(getWeatherCategory(3)).toBe('cloudy');
    expect(getWeatherCategory(48)).toBe('fog');
    expect(getWeatherCategory(55)).toBe('drizzle');
    expect(getWeatherCategory(65)).toBe('rain');
    expect(getWeatherCategory(75)).toBe('snow');
    expect(getWeatherCategory(95)).toBe('storm');
  });

  it('returns null for an unknown or missing code', () => {
    expect(getWeatherCategory(undefined)).toBe(null);
    expect(getWeatherCategory(12345)).toBe(null);
  });
});

describe('WeatherBackground', () => {
  it('renders nothing when the weather code is unknown or missing', () => {
    const { container } = render(<WeatherBackground weatherCode={undefined} />);
    expect(container.firstChild).toBe(null);
  });

  it('renders nothing for cloudy weather (kept clean on purpose)', () => {
    const { container } = render(<WeatherBackground weatherCode={2} />);
    expect(container.firstChild).toBe(null);
  });

  it('renders a rain layer with raindrops for rain codes', () => {
    const { container } = render(<WeatherBackground weatherCode={63} />);
    expect(container.querySelector('.weather-fx-rain')).toBeTruthy();
    expect(container.querySelectorAll('.weather-fx-raindrop').length).toBeGreaterThan(0);
    expect(container.querySelector('.weather-fx-lightning')).toBe(null);
  });

  it('adds a lightning flash layer only for storm codes', () => {
    const { container } = render(<WeatherBackground weatherCode={95} />);
    expect(container.querySelector('.weather-fx-rain')).toBeTruthy();
    expect(container.querySelector('.weather-fx-lightning')).toBeTruthy();
  });

  it('renders a sun layer for clear codes', () => {
    const { container } = render(<WeatherBackground weatherCode={0} />);
    expect(container.querySelector('.weather-fx-sunny')).toBeTruthy();
    expect(container.querySelector('.weather-fx-sun-glow')).toBeTruthy();
  });

  it('renders a snow layer for snow codes', () => {
    const { container } = render(<WeatherBackground weatherCode={71} />);
    expect(container.querySelectorAll('.weather-fx-snowflake').length).toBeGreaterThan(0);
  });

  it('renders a fog layer for fog codes', () => {
    const { container } = render(<WeatherBackground weatherCode={45} />);
    expect(container.querySelector('.weather-fx-fog')).toBeTruthy();
  });

  it('marks the whole effect layer as decorative for assistive tech', () => {
    const { container } = render(<WeatherBackground weatherCode={61} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App.jsx';

describe('App', () => {
  it('renders the 大豬公 app shell', () => {
    expect(renderToStaticMarkup(<App />)).toContain('大豬公');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import Home from './components/Home';
import { parseSessionInput } from './lib/board';

describe('guest entry', () => {
  test('offers an accessible create and join flow with no login requirement', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Start a fresh canvas' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Your guest display name' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Board ID or invitation URL' })).toBeVisible();
  });
  test('rejects an invalid invitation without navigating', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Home /></MemoryRouter>);
    await user.type(screen.getByRole('textbox', { name: 'Board ID or invitation URL' }), '../not-a-room');
    await user.click(screen.getByRole('button', { name: 'Join board' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid board ID');
  });
  test('accepts room IDs and shared deep links', () => {
    expect(parseSessionInput('demo-interview')).toBe('demo-interview');
    expect(parseSessionInput('https://example.com/session/demo-interview?ref=linkedin')).toBe('demo-interview');
    expect(parseSessionInput('https://example.com/session/%2Fbad')).toBeNull();
    expect(parseSessionInput('https://example.com/elsewhere')).toBeNull();
  });
});

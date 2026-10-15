// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdatePanel } from '../src/renderer/UpdatePanel.js';
import type { UpdateStatus } from '../src/updater.js';
afterEach(cleanup);
it('shows the previous failure independently of a new update check and opens only the log folder', async () => {
  const status: UpdateStatus = { currentVersion: '0.1.6', phase: 'available', message: 'Disponible', logDirectory: 'C:/test/logs',
    lastFailure: { message: 'Mise a jour annulee.', detail: 'Close all DBCodex instances before updating.', stage: 'attente-fermeture', attemptId: 'attempt-1' } };
  const api = { call: vi.fn().mockResolvedValue(status) };
  render(<UpdatePanel api={api} />);
  expect(await screen.findByText('Détails du dernier échec')).toBeTruthy();
  expect(screen.getByText(status.lastFailure!.detail!)).toBeTruthy();
  fireEvent.click(screen.getByText('Mises à jour'));
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les journaux' }));
  expect(api.call).toHaveBeenCalledWith('open_logs');
  expect(api.call).not.toHaveBeenCalledWith('update_restart');
});

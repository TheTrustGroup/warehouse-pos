/**
 * ConflictModal: side-by-side display, resolution options, edge cases (identical, deleted on server, deleted locally).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsProvider } from '../contexts/SettingsContext';
import { ConflictModal } from './ConflictModal';

vi.mock('../db/inventoryDB', () => ({
  getConflictPreference: vi.fn(() => Promise.resolve(null)),
  setConflictPreference: vi.fn(() => Promise.resolve()),
  appendConflictAuditLog: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

import { appendConflictAuditLog } from '../db/inventoryDB';

const localVersion = {
  id: 'local-1',
  name: 'Local Name',
  sku: 'SKU-1',
  category: 'Toys',
  price: 10,
  quantity: 5,
  description: 'Local desc',
  barcode: '123',
  lastModified: 1000000,
};

const serverVersion = {
  id: 'server-1',
  name: 'Server Name',
  sku: 'SKU-1',
  category: 'Toys',
  price: 12,
  quantity: 8,
  description: 'Server desc',
  barcode: '456',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

describe('ConflictModal', () => {
  const onResolve = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.mocked(onResolve).mockReset();
    vi.mocked(onClose).mockReset();
    vi.mocked(appendConflictAuditLog).mockReset();
    vi.mocked(appendConflictAuditLog).mockResolvedValue(undefined);
  });

  const renderWithSettings = (ui: React.ReactElement) =>
    render(<SettingsProvider>{ui}</SettingsProvider>);

  it('renders closed when isOpen is false', () => {
    renderWithSettings(
      <ConflictModal
        isOpen={false}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        onResolve={onResolve}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows side-by-side local vs server with timestamps and diff highlighting', () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        onResolve={onResolve}
      />
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Local version/i)).toBeTruthy();
    expect(screen.getByText(/Server version/i)).toBeTruthy();
    expect(screen.getByText('Local Name')).toBeTruthy();
    expect(screen.getByText('Server Name')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('calls onResolve with keep_local when Keep local is clicked', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        onResolve={onResolve}
      />
    );
    const keepLocal = screen.getAllByRole('button', { name: /Keep local/i })[0];
    fireEvent.click(keepLocal);
    await vi.waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('keep_local', undefined);
    });
    expect(appendConflictAuditLog).toHaveBeenCalled();
  });

  it('calls onResolve with keep_server when Keep server is clicked', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        onResolve={onResolve}
      />
    );
    const keepServer = screen.getAllByRole('button', { name: /Keep server/i })[0];
    fireEvent.click(keepServer);
    await vi.waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('keep_server', undefined);
    });
  });

  it('shows merge form when Merge manually is clicked and saves merged payload on Save merged', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        onResolve={onResolve}
      />
    );
    const mergeBtn = screen.getAllByRole('button', { name: /Merge manually/i })[0];
    fireEvent.click(mergeBtn);
    expect(screen.getAllByRole('button', { name: /Save merged/i })[0]).toBeTruthy();
    const nameInput = screen.getByDisplayValue('Server Name');
    fireEvent.change(nameInput, { target: { value: 'Merged Name' } });
    const saveMerged = screen.getAllByRole('button', { name: /Save merged/i })[0];
    fireEvent.click(saveMerged);
    await vi.waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('merge', expect.objectContaining({ name: 'Merged Name' }));
    });
  });

  it('calls onResolve with last_write_wins when Last write wins is clicked', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        onResolve={onResolve}
      />
    );
    const lww = screen.getAllByRole('button', { name: /Last write wins/i })[0];
    fireEvent.click(lww);
    await vi.waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('last_write_wins', undefined);
    });
  });

  it('shows identical message when both versions are the same', () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={{ ...localVersion }}
        serverVersion={{ ...localVersion, updatedAt: localVersion.lastModified }}
        onResolve={onResolve}
      />
    );
    expect(screen.getByText(/Both versions are identical/i)).toBeTruthy();
  });

  it('shows deleted-on-server UI when serverDeleted is true', () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={null}
        serverDeleted={true}
        onResolve={onResolve}
      />
    );
    expect(screen.getByText(/Item deleted on server/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Keep local copy/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove locally/i })).toBeTruthy();
  });

  it('calls onResolve with keep_local when Keep local copy (server deleted) is clicked', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={null}
        serverDeleted={true}
        onResolve={onResolve}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Keep local copy/i })[0]);
    await vi.waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('keep_local', undefined);
    });
  });

  it('calls onResolve with keep_server when Remove locally (server deleted) is clicked', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={null}
        serverDeleted={true}
        onResolve={onResolve}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Remove locally/i })[0]);
    await vi.waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('keep_server', undefined);
    });
  });

  it('shows delete-confirmed UI when localDeleted is true', () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={serverVersion}
        localDeleted={true}
        onResolve={onResolve}
      />
    );
    expect(screen.getByText(/Delete confirmed/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^OK$/i })).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked (server deleted)', async () => {
    renderWithSettings(
      <ConflictModal
        isOpen={true}
        onClose={onClose}
        localVersion={localVersion}
        serverVersion={null}
        serverDeleted={true}
        onResolve={onResolve}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Cancel/i })[0]);
    expect(onClose).toHaveBeenCalled();
  });
});

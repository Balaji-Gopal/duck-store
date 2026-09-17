import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ducksApi } from './api/ducks';

vi.mock('./api/ducks');

describe('App', () => {
  it('adds a duck through the form and refreshes the table', async () => {
    vi.mocked(ducksApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, color: 'Red', size: 'XLarge', price: '200.00', quantity: 10 }]);
    vi.mocked(ducksApi.add).mockResolvedValue({ id: 1, color: 'Red', size: 'XLarge', price: '200.00', quantity: 10 });

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Add duck'));
    await user.type(screen.getByLabelText('Price'), '200');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByText('Save'));

    expect(await screen.findByText('Red')).toBeInTheDocument();
    expect(ducksApi.add).toHaveBeenCalledWith({ color: 'Red', size: 'XLarge', price: 200, quantity: 10 });
  });

  it('deletes a duck after confirming the dialog', async () => {
    vi.mocked(ducksApi.list)
      .mockResolvedValueOnce([{ id: 1, color: 'Red', size: 'XLarge', price: '200.00', quantity: 10 }])
      .mockResolvedValueOnce([]);
    vi.mocked(ducksApi.remove).mockResolvedValue(undefined);

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('delete'));
    await user.click(screen.getByText('Confirm'));

    expect(ducksApi.remove).toHaveBeenCalledWith(1);
    await screen.findByText(/no ducks/i);
  });

  it('shows an error and keeps the dialog open when adding a duck fails', async () => {
    vi.mocked(ducksApi.list).mockResolvedValue([]);
    vi.mocked(ducksApi.add).mockRejectedValue(new Error('duck already exists'));

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Add duck'));
    await user.type(screen.getByLabelText('Price'), '200');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByText('Save'));

    expect(await screen.findByRole('alert')).toHaveTextContent('duck already exists');
    // the form is still open, so Save is still on screen
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('shows an error and keeps the dialog open when deleting a duck fails', async () => {
    vi.mocked(ducksApi.list).mockResolvedValue([
      { id: 1, color: 'Red', size: 'XLarge', price: '200.00', quantity: 10 },
    ]);
    vi.mocked(ducksApi.remove).mockRejectedValue(new Error('duck not found'));

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('delete'));
    await user.click(screen.getByText('Confirm'));

    expect(await screen.findByRole('alert')).toHaveTextContent('duck not found');
    // the confirm dialog is still open
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });
});

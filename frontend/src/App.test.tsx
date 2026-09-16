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
      .mockResolvedValueOnce([{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 }]);
    vi.mocked(ducksApi.add).mockResolvedValue({ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 });

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
      .mockResolvedValueOnce([{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 }])
      .mockResolvedValueOnce([]);
    vi.mocked(ducksApi.remove).mockResolvedValue(undefined);

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('delete'));
    await user.click(screen.getByText('Confirm'));

    expect(ducksApi.remove).toHaveBeenCalledWith(1);
    await screen.findByText(/no ducks/i);
  });
});

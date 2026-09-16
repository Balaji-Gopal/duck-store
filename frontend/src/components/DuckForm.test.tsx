import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DuckForm } from './DuckForm';

describe('DuckForm', () => {
  it('edit mode disables color and size, and submits price/quantity changes', async () => {
    const onSubmit = vi.fn();
    render(
      <DuckForm
        mode="edit"
        initialDuck={{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10000 }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Color')).toBeDisabled();
    expect(screen.getByLabelText('Size')).toBeDisabled();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '250');
    await user.click(screen.getByText('Save'));

    expect(onSubmit).toHaveBeenCalledWith({ color: 'Red', size: 'XLarge', price: 250, quantity: 10000 });
  });

  it('rejects a non-positive price and does not submit', async () => {
    const onSubmit = vi.fn();
    render(<DuckForm mode="add" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Price'), '-5');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByText('Save'));

    expect(screen.getByRole('alert')).toHaveTextContent('Price must be a positive number');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DuckTable } from './DuckTable';
import type { Duck } from '../types/duck';

const ducks: Duck[] = [
  { id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10000 },
  { id: 2, color: 'Green', size: 'Medium', price: 50, quantity: 5 },
];

describe('DuckTable', () => {
  it('renders a row per duck with its fields', () => {
    render(<DuckTable ducks={ducks} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('200 USD')).toBeInTheDocument();
    expect(screen.getByText('10000')).toBeInTheDocument();
  });

  it('calls onEdit / onDelete with the row duck when clicked', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<DuckTable ducks={ducks} onEdit={onEdit} onDelete={onDelete} />);
    const user = userEvent.setup();

    await user.click(screen.getAllByText('edit')[0]);
    expect(onEdit).toHaveBeenCalledWith(ducks[0]);

    await user.click(screen.getAllByText('delete')[1]);
    expect(onDelete).toHaveBeenCalledWith(ducks[1]);
  });
});

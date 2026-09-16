import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('shows the message and invokes onConfirm / onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog message="Delete duck #1?" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Delete duck #1?')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

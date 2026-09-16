import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDucks } from './useDucks';
import { ducksApi } from '../api/ducks';

vi.mock('../api/ducks');

describe('useDucks', () => {
  it('loads ducks on mount and refreshes after addDuck', async () => {
    const listed = [{ id: 1, color: 'Red' as const, size: 'XLarge' as const, price: 200, quantity: 10 }];
    vi.mocked(ducksApi.list).mockResolvedValue(listed);
    vi.mocked(ducksApi.add).mockResolvedValue(listed[0]);

    const { result } = renderHook(() => useDucks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ducks).toEqual(listed);

    await act(async () => {
      await result.current.addDuck({ color: 'Red', size: 'XLarge', price: 200, quantity: 5 });
    });

    expect(ducksApi.add).toHaveBeenCalledWith({ color: 'Red', size: 'XLarge', price: 200, quantity: 5 });
    expect(ducksApi.list).toHaveBeenCalledTimes(2);
  });

  it('surfaces a load error without throwing', async () => {
    vi.mocked(ducksApi.list).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useDucks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('network down');
    expect(result.current.ducks).toEqual([]);
  });
});

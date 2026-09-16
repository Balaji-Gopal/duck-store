import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ducksApi } from './ducks';

describe('ducksApi', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('lists ducks from GET /ducks', async () => {
    const ducks = [{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 }];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ducks } as Response);

    const result = await ducksApi.list();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/ducks'));
    expect(result).toEqual(ducks);
  });

  it('throws the server message when a request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'conflict' }),
    } as Response);

    await expect(ducksApi.update(1, { price: 5 })).rejects.toThrow('conflict');
  });
});

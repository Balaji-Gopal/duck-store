import type { CreateDuckInput, Duck, UpdateDuckInput } from '../types/duck';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export const ducksApi = {
  list: (): Promise<Duck[]> => fetch(`${BASE_URL}/ducks`).then((r) => handleResponse<Duck[]>(r)),

  add: (input: CreateDuckInput): Promise<Duck> =>
    fetch(`${BASE_URL}/ducks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => handleResponse<Duck>(r)),

  update: (id: number, input: UpdateDuckInput): Promise<Duck> =>
    fetch(`${BASE_URL}/ducks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => handleResponse<Duck>(r)),

  remove: (id: number): Promise<void> =>
    fetch(`${BASE_URL}/ducks/${id}`, { method: 'DELETE' }).then((r) => handleResponse<void>(r)),
};

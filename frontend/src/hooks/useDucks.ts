import { useCallback, useEffect, useState } from 'react';
import { ducksApi } from '../api/ducks';
import { CreateDuckInput, Duck, UpdateDuckInput } from '../types/duck';

export function useDucks() {
  const [ducks, setDucks] = useState<Duck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDucks(await ducksApi.list());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addDuck = useCallback(
    async (input: CreateDuckInput) => {
      await ducksApi.add(input);
      await refresh();
    },
    [refresh],
  );

  const editDuck = useCallback(
    async (id: number, input: UpdateDuckInput) => {
      await ducksApi.update(id, input);
      await refresh();
    },
    [refresh],
  );

  const deleteDuck = useCallback(
    async (id: number) => {
      await ducksApi.remove(id);
      await refresh();
    },
    [refresh],
  );

  return { ducks, loading, error, addDuck, editDuck, deleteDuck };
}

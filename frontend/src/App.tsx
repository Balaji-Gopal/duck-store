import { useState } from 'react';
import { useDucks } from './hooks/useDucks';
import { DuckTable } from './components/DuckTable';
import { DuckForm } from './components/DuckForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import type { Duck } from './types/duck';

type DialogState = { kind: 'add' } | { kind: 'edit'; duck: Duck } | { kind: 'delete'; duck: Duck } | null;

export default function App() {
  const { ducks, loading, error, addDuck, editDuck, deleteDuck } = useDucks();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  function openDialog(next: DialogState) {
    setMutationError(null);
    setDialog(next);
  }

  function closeDialog() {
    setMutationError(null);
    setDialog(null);
  }

  return (
    <main>
      <h1>Duck Warehouse</h1>
      <button onClick={() => openDialog({ kind: 'add' })}>Add duck</button>

      {loading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && ducks.length === 0 && <p>No ducks in the warehouse yet.</p>}

      <DuckTable
        ducks={ducks}
        onEdit={(duck) => openDialog({ kind: 'edit', duck })}
        onDelete={(duck) => openDialog({ kind: 'delete', duck })}
      />

      {dialog?.kind === 'add' && (
        <>
          {mutationError && <p role="alert">{mutationError}</p>}
          <DuckForm
            mode="add"
            onSubmit={async (values) => {
              try {
                await addDuck(values);
                closeDialog();
              } catch (e) {
                setMutationError((e as Error).message);
              }
            }}
            onCancel={closeDialog}
          />
        </>
      )}

      {dialog?.kind === 'edit' && (
        <>
          {mutationError && <p role="alert">{mutationError}</p>}
          <DuckForm
            mode="edit"
            initialDuck={dialog.duck}
            onSubmit={async (values) => {
              try {
                await editDuck(dialog.duck.id, { price: values.price, quantity: values.quantity });
                closeDialog();
              } catch (e) {
                setMutationError((e as Error).message);
              }
            }}
            onCancel={closeDialog}
          />
        </>
      )}

      {dialog?.kind === 'delete' && (
        <>
          {mutationError && <p role="alert">{mutationError}</p>}
          <ConfirmDialog
            message={`Delete duck #${dialog.duck.id}?`}
            onConfirm={async () => {
              try {
                await deleteDuck(dialog.duck.id);
                closeDialog();
              } catch (e) {
                setMutationError((e as Error).message);
              }
            }}
            onCancel={closeDialog}
          />
        </>
      )}
    </main>
  );
}

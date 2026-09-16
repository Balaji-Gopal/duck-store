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

  return (
    <main>
      <h1>Duck Warehouse</h1>
      <button onClick={() => setDialog({ kind: 'add' })}>Add duck</button>

      {loading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && ducks.length === 0 && <p>No ducks in the warehouse yet.</p>}

      <DuckTable
        ducks={ducks}
        onEdit={(duck) => setDialog({ kind: 'edit', duck })}
        onDelete={(duck) => setDialog({ kind: 'delete', duck })}
      />

      {dialog?.kind === 'add' && (
        <DuckForm
          mode="add"
          onSubmit={(values) => {
            addDuck(values);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'edit' && (
        <DuckForm
          mode="edit"
          initialDuck={dialog.duck}
          onSubmit={(values) => {
            editDuck(dialog.duck.id, { price: values.price, quantity: values.quantity });
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          message={`Delete duck #${dialog.duck.id}?`}
          onConfirm={() => {
            deleteDuck(dialog.duck.id);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </main>
  );
}

import { type FormEvent, useId, useState } from 'react';
import type { Duck, DuckColor, DuckSize } from '../types/duck';

const COLORS: DuckColor[] = ['Red', 'Green', 'Yellow', 'Black'];
const SIZES: DuckSize[] = ['XLarge', 'Large', 'Medium', 'Small', 'XSmall'];

interface DuckFormValues {
  color: DuckColor;
  size: DuckSize;
  price: number;
  quantity: number;
}

interface DuckFormProps {
  mode: 'add' | 'edit';
  initialDuck?: Duck;
  onSubmit: (values: DuckFormValues) => void;
  onCancel: () => void;
}

export function DuckForm({ mode, initialDuck, onSubmit, onCancel }: DuckFormProps) {
  const [color, setColor] = useState<DuckColor>(initialDuck?.color ?? COLORS[0]);
  const [size, setSize] = useState<DuckSize>(initialDuck?.size ?? SIZES[0]);
  const [price, setPrice] = useState(String(initialDuck?.price ?? ''));
  const [quantity, setQuantity] = useState(String(initialDuck?.quantity ?? ''));
  const [error, setError] = useState<string | null>(null);
  const colorId = useId();
  const sizeId = useId();
  const priceId = useId();
  const quantityId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const priceValue = Number(price);
    const quantityValue = Number(quantity);

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setError('Price must be a positive number');
      return;
    }
    if (!Number.isInteger(quantityValue) || quantityValue <= 0) {
      setError('Quantity must be a positive whole number');
      return;
    }

    setError(null);
    onSubmit({ color, size, price: priceValue, quantity: quantityValue });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={colorId}>Color</label>
      <select
        id={colorId}
        value={color}
        onChange={(e) => setColor(e.target.value as DuckColor)}
        disabled={mode === 'edit'}
      >
        {COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label htmlFor={sizeId}>Size</label>
      <select id={sizeId} value={size} onChange={(e) => setSize(e.target.value as DuckSize)} disabled={mode === 'edit'}>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label htmlFor={priceId}>Price</label>
      <input id={priceId} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />

      <label htmlFor={quantityId}>Quantity</label>
      <input id={quantityId} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />

      {error && <p role="alert">{error}</p>}

      <button type="submit">Save</button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

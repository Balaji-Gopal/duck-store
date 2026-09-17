import type { Duck } from '../types/duck';

interface DuckTableProps {
  ducks: Duck[];
  onEdit: (duck: Duck) => void;
  onDelete: (duck: Duck) => void;
}

export function DuckTable({ ducks, onEdit, onDelete }: DuckTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>Id</th>
          <th>Color</th>
          <th>Size</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {ducks.map((duck) => (
          <tr key={duck.id}>
            <td>{duck.id}</td>
            <td>{duck.color}</td>
            <td>{duck.size}</td>
            <td>{duck.price} USD</td>
            <td>{duck.quantity}</td>
            <td>
              <button onClick={() => onEdit(duck)}>edit</button>
              <button onClick={() => onDelete(duck)}>delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

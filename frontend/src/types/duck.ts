export type DuckColor = 'Red' | 'Green' | 'Yellow' | 'Black';
export type DuckSize = 'XLarge' | 'Large' | 'Medium' | 'Small' | 'XSmall';

export interface Duck {
  id: number;
  color: DuckColor;
  size: DuckSize;
  // The backend's `price` column is a TypeORM `decimal`, which the mysql2 driver returns as a
  // string (e.g. "200.00"), not a number — so GET /ducks really sends back a decimal string.
  price: string;
  quantity: number;
}

export interface CreateDuckInput {
  color: DuckColor;
  size: DuckSize;
  price: number;
  quantity: number;
}

export interface UpdateDuckInput {
  price?: number;
  quantity?: number;
}

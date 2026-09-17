import Decimal from 'decimal.js';

export interface PriceLineItem {
  label: string;
  amount: string;
}

export class PriceBreakdown {
  private total: Decimal;
  private readonly items: PriceLineItem[] = [];

  constructor(initialTotal: Decimal) {
    this.total = initialTotal;
  }

  applyPercentage(label: string, percentage: number): void {
    const delta = this.total.times(percentage).dividedBy(100);
    this.total = this.total.plus(delta);
    this.items.push({ label, amount: this.formatSigned(delta) });
  }

  applyFlatAmount(label: string, amount: Decimal): void {
    this.total = this.total.plus(amount);
    this.items.push({ label, amount: this.formatSigned(amount) });
  }

  toResult(): { totalToPay: number; breakdown: PriceLineItem[] } {
    return {
      totalToPay: Number(this.total.toFixed(2)),
      breakdown: this.items,
    };
  }

  private formatSigned(amount: Decimal): string {
    const rounded = amount.toFixed(2);
    return amount.isNegative() ? rounded : `+${rounded}`;
  }
}

/**
 * POSProductCard: image display and placeholder; no crash when images missing.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import POSProductCard from './POSProductCard';
import type { POSProduct } from './SizePickerSheet';

const baseProduct: POSProduct = {
  id: 'p1',
  name: 'Test Product',
  sku: 'SKU-001',
  quantity: 5,
  sellingPrice: 100,
  category: 'Shoes',
};

describe('POSProductCard', () => {
  it('renders product name and price', () => {
    const onSelect = vi.fn();
    render(<POSProductCard product={baseProduct} onSelect={onSelect} />);
    expect(screen.getByText('Test Product')).toBeTruthy();
    expect(screen.getByText(/GH₵100\.00/)).toBeTruthy();
  });

  it('shows image when product has valid data URL', () => {
    const product: POSProduct = {
      ...baseProduct,
      images: ['data:image/png;base64,iVBORw0KGgo='],
    };
    const onSelect = vi.fn();
    const { container } = render(<POSProductCard product={product} onSelect={onSelect} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('alt')).toBe('Test Product');
  });

  it('shows placeholder when product has no images', () => {
    const product: POSProduct = { ...baseProduct, images: [] };
    const onSelect = vi.fn();
    const { container } = render(<POSProductCard product={product} onSelect={onSelect} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('shows placeholder when product.images is undefined', () => {
    const product: POSProduct = { ...baseProduct };
    const onSelect = vi.fn();
    const { container } = render(<POSProductCard product={product} onSelect={onSelect} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(<POSProductCard product={baseProduct} onSelect={onSelect} />);
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(baseProduct);
  });

  it('disables button when product is out of stock', () => {
    const product: POSProduct = { ...baseProduct, quantity: 0 };
    const onSelect = vi.fn();
    const { container } = render(<POSProductCard product={product} onSelect={onSelect} />);
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

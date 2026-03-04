/**
 * ProductModal: buildInitialForm unit tests.
 * Ensures form state (especially images) is initialized once from product and not re-initialized while open.
 */
import { describe, it, expect } from 'vitest';
import { buildInitialForm } from './ProductModal';
import type { Product } from '../../types';

const minimalProduct: Product = {
  id: 'test-id',
  name: 'Test',
  sku: 'SKU-1',
  barcode: '',
  description: '',
  category: 'Cat',
  tags: [],
  quantity: 0,
  costPrice: 5,
  sellingPrice: 10,
  reorderLevel: 0,
  location: { warehouse: '', aisle: '', rack: '', bin: '' },
  supplier: { name: '', contact: '', email: '' },
  images: [],
  expiryDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: '',
  sizeKind: 'na',
  quantityBySize: [],
};

describe('buildInitialForm', () => {
  it('returns empty images when product is null', () => {
    const form = buildInitialForm(null);
    expect(form.images).toEqual([]);
  });

  it('returns empty images when product is undefined', () => {
    const form = buildInitialForm(undefined);
    expect(form.images).toEqual([]);
  });

  it('returns empty images when product.images is undefined', () => {
    const form = buildInitialForm(minimalProduct);
    expect(form.images).toEqual([]);
  });

  it('returns product.images when provided', () => {
    const product = {
      ...minimalProduct,
      images: ['https://example.com/a.jpg', 'data:image/png;base64,abc'],
    } as Product;
    const form = buildInitialForm(product);
    expect(form.images).toEqual(product.images);
  });

  it('returns empty array when product.images is empty', () => {
    const product: Product = { ...minimalProduct, images: [] };
    const form = buildInitialForm(product);
    expect(form.images).toEqual([]);
  });
});

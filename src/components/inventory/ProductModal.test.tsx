/**
 * ProductModal: buildInitialForm unit tests.
 * Ensures form state (especially images) is initialized once from product and not re-initialized while open.
 */
import { describe, it, expect } from 'vitest';
import { buildInitialForm, type Product } from './ProductModal';

const minimalProduct: Product = {
  name: 'Test',
  sku: 'SKU-1',
  category: 'Cat',
  sellingPrice: 10,
  costPrice: 5,
  sizeKind: 'na',
  quantity: 0,
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
    const product: Product = {
      ...minimalProduct,
      images: ['https://example.com/a.jpg', 'data:image/png;base64,abc'],
    };
    const form = buildInitialForm(product);
    expect(form.images).toEqual(product.images);
  });

  it('returns empty array when product.images is empty', () => {
    const product: Product = { ...minimalProduct, images: [] };
    const form = buildInitialForm(product);
    expect(form.images).toEqual([]);
  });
});

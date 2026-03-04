/**
 * Single source for stock status thresholds. Used by ProductCard, POSProductCard,
 * and any UI that derives "low stock" vs "in stock" from quantity.
 * Backend RPC uses warehouse_products.reorder_level per product; this constant
 * is the fallback when reorder_level is unset or for display logic.
 */
export const LOW_STOCK_THRESHOLD = 3;

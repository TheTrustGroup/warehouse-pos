-- RPC: atomically receive inbound delivery — add quantities to warehouse_inventory_by_size
-- for each item. Trigger sync_warehouse_inventory_from_by_size keeps warehouse_inventory in sync.
-- Use from POST /api/deliveries/receive or similar when receiving stock into the warehouse.
-- p_items: JSONB array of { "product_id": "uuid", "size_code": "EU42", "quantity": 10 }

CREATE OR REPLACE FUNCTION receive_delivery(
  p_warehouse_id uuid,
  p_received_by uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item     jsonb;
  v_product  uuid;
  v_size     text;
  v_qty      int;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', true, 'rows_affected', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product := (v_item->>'product_id')::uuid;
    v_size    := nullif(trim(v_item->>'size_code'), '');
    v_qty     := greatest(0, (v_item->>'quantity')::int);
    IF v_size IS NULL THEN
      v_size := 'NA';
    END IF;

    INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
    VALUES (p_warehouse_id, v_product, v_size, v_qty, now())
    ON CONFLICT (warehouse_id, product_id, size_code)
    DO UPDATE SET
      quantity   = warehouse_inventory_by_size.quantity + v_qty,
      updated_at = now();
  END LOOP;

  RETURN jsonb_build_object('success', true, 'rows_affected', jsonb_array_length(p_items));
END;
$$;

COMMENT ON FUNCTION receive_delivery(uuid, uuid, jsonb) IS 'Atomically add inbound delivery items to warehouse_inventory_by_size for a warehouse. Trigger syncs warehouse_inventory. p_items: [{ product_id, size_code, quantity }].';

REVOKE ALL ON FUNCTION receive_delivery(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_delivery(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION receive_delivery(uuid, uuid, jsonb) TO authenticated;

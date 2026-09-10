# BE-06 — Substitution Receiving Design Note

This note records the accepted implementation direction for the next executable slice after ordinary ReceiptItem materialization.

Substitution and over-receipt remain separate workflows.

- Substitution means the received Product differs from the requested PurchaseItem Product.
- A valid substitution consumes the same PurchaseItem physical receiving pool as ordinary receiving.
- Substitution alone does not imply over-receipt.
- Over-receipt exists only when ordinary + substitution allocations would exceed the purchased quantity after exact conversion.

The first substitution slice must atomically materialize one immutable ReceiptItemIntent into:

1. ReceiptItem carrying the received Product and exact quantity/unit from the intent;
2. purchase_item_substitution_allocation preserving requested Product, received Product, exact quantity/unit, optional conversion evidence, reason, optional approver and provenance;
3. one new placed StockItem for the received Product;
4. one positive RECEIPT_INGRESS InventoryMovement;
5. one receipt_item_inventory_effect;
6. one immutable intent-to-substitution-materialization bridge.

The transaction must serialize against the same PurchaseItem receiving pool used by ordinary receiving. If the proposed substitution exceeds remaining allowance, this boundary must return a deterministic receiving conflict and commit no physical artifacts. The separate over-receipt exception workflow will govern excess acceptance/correction; this substitution boundary must not silently create an exception, enlarge the PurchaseItem, truncate quantity, or commit unallocated residual stock.

Approval remains optional in this slice because the canonical schema and BE-06 decision B6-014 require approval only when policy requires it; no mandatory substitution-approval policy has yet been accepted.

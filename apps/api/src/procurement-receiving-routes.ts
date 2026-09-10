import type { FastifyInstance } from 'fastify';
import {
  CommandId,
  CompartmentId,
  HouseholdId,
  InvalidInputError,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  ProductId,
  PurchaseId,
  PurchaseItemId,
  ReceiptId,
  ReceiptItemIntentId,
  StorageLocationId,
  instant,
  type CreatePurchaseInput,
  type CreatePurchaseOutput,
  type CreateReceiptInput,
  type CreateReceiptItemIntentInput,
  type CreateReceiptItemIntentOutput,
  type CreateReceiptOutput,
  type GetHouseholdPurchaseInput,
  type HouseholdPurchaseObservation,
  type HouseholdPurchasePageCursor,
  type HouseholdPurchaseSummary,
  type ListHouseholdPurchasesInput,
  type ListHouseholdPurchasesOutput,
  type MaterializeOrdinaryReceiptItemInput,
  type MaterializeOrdinaryReceiptItemOutput,
  type UseCase,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';
import { parseCanonicalExactRationalWire } from './exact-rational-wire.js';

export interface ProcurementReceivingRouteDependencies {
  readonly listHouseholdPurchases: UseCase<ListHouseholdPurchasesInput, ListHouseholdPurchasesOutput>;
  readonly getHouseholdPurchase: UseCase<GetHouseholdPurchaseInput, { readonly purchase: HouseholdPurchaseObservation }>;
  readonly createPurchase: UseCase<CreatePurchaseInput, CreatePurchaseOutput>;
  readonly createReceipt: UseCase<CreateReceiptInput, CreateReceiptOutput>;
  readonly createReceiptItemIntent: UseCase<CreateReceiptItemIntentInput, CreateReceiptItemIntentOutput>;
  readonly materializeOrdinaryReceiptItem: UseCase<MaterializeOrdinaryReceiptItemInput, MaterializeOrdinaryReceiptItemOutput>;
}

function parseHouseholdId(value: string) {
  try { return HouseholdId(value); } catch (error) { throw new InvalidInputError('Household identifier is invalid', error); }
}
function parseCommandId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Command identifier is invalid');
  try { return CommandId(value); } catch (error) { throw new InvalidInputError('Command identifier is invalid', error); }
}
function parsePurchaseId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Purchase identifier is invalid');
  try { return PurchaseId(value); } catch (error) { throw new InvalidInputError('Purchase identifier is invalid', error); }
}
function parseOptionalPurchaseId(value: unknown) {
  return value === undefined || value === null ? undefined : parsePurchaseId(value);
}
function parseReceiptId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Receipt identifier is invalid');
  try { return ReceiptId(value); } catch (error) { throw new InvalidInputError('Receipt identifier is invalid', error); }
}
function parseReceiptItemIntentId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Receipt item intent identifier is invalid');
  try { return ReceiptItemIntentId(value); } catch (error) { throw new InvalidInputError('Receipt item intent identifier is invalid', error); }
}
function parsePurchaseItemId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Purchase item identifier is invalid');
  try { return PurchaseItemId(value); } catch (error) { throw new InvalidInputError('Purchase item identifier is invalid', error); }
}
function parseProductId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Product identifier is invalid');
  try { return ProductId(value); } catch (error) { throw new InvalidInputError('Product identifier is invalid', error); }
}
function parseMeasurementUnitId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Measurement unit identifier is invalid');
  try { return MeasurementUnitId(value); } catch (error) { throw new InvalidInputError('Measurement unit identifier is invalid', error); }
}
function parseOptionalConversionEvidenceId(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new InvalidInputError('Measurement conversion evidence identifier is invalid');
  try { return MeasurementConversionEvidenceId(value); } catch (error) { throw new InvalidInputError('Measurement conversion evidence identifier is invalid', error); }
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new InvalidInputError(`${label} is invalid`);
  return value;
}
function parsePageSize(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new InvalidInputError('pageSize is invalid');
  return Number(value);
}
function parseCursor(occurredAt: unknown, purchaseId: unknown): HouseholdPurchasePageCursor | null {
  if (occurredAt === undefined && purchaseId === undefined) return null;
  if (typeof occurredAt !== 'string' || typeof purchaseId !== 'string') throw new InvalidInputError('Purchase page cursor is invalid');
  try { return { occurredAt: instant(occurredAt), purchaseId: PurchaseId(purchaseId) }; } catch (error) { throw new InvalidInputError('Purchase page cursor is invalid', error); }
}
function serializePurchaseSummary(purchase: HouseholdPurchaseSummary) {
  return {
    purchaseId: String(purchase.purchaseId),
    transactionCurrencyCode: purchase.transactionCurrencyCode,
    occurredAt: String(purchase.occurredAt),
    recordedAt: String(purchase.recordedAt),
    itemCount: purchase.itemCount,
  };
}
function serializePurchase(purchase: HouseholdPurchaseObservation) {
  return {
    ...serializePurchaseSummary(purchase),
    items: purchase.items.map((item) => ({
      purchaseItemId: String(item.purchaseItemId),
      productId: String(item.productId),
      quantity: { numerator: item.quantity.numerator.toString(), denominator: item.quantity.denominator.toString() },
      measurementUnitId: String(item.measurementUnitId),
      recordedAt: String(item.recordedAt),
    })),
  };
}
function parsePlacement(value: unknown): MaterializeOrdinaryReceiptItemInput['placement'] {
  if (typeof value !== 'object' || value === null) throw new InvalidInputError('Receipt placement is invalid');
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'LOCATION') {
    const id = (value as { storageLocationId?: unknown }).storageLocationId;
    if (typeof id !== 'string') throw new InvalidInputError('Storage location placement is invalid');
    try { return { kind: 'LOCATION', storageLocationId: StorageLocationId(id) }; } catch (error) { throw new InvalidInputError('Storage location placement is invalid', error); }
  }
  if (kind === 'COMPARTMENT') {
    const id = (value as { compartmentId?: unknown }).compartmentId;
    if (typeof id !== 'string') throw new InvalidInputError('Compartment placement is invalid');
    try { return { kind: 'COMPARTMENT', compartmentId: CompartmentId(id) }; } catch (error) { throw new InvalidInputError('Compartment placement is invalid', error); }
  }
  throw new InvalidInputError('Receipt placement kind is invalid');
}

export function registerProcurementReceivingRoutes(
  server: FastifyInstance,
  authenticatedPrincipal: AuthenticatedPrincipalResolver,
  dependencies: ProcurementReceivingRouteDependencies,
): void {
  server.get<{
    Params: { householdId: string };
    Querystring: { pageSize?: string; cursorOccurredAt?: string; cursorPurchaseId?: string };
  }>('/households/:householdId/purchases', async (request) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const householdId = parseHouseholdId(request.params.householdId);
    const pageSize = parsePageSize(request.query.pageSize);
    const output = await dependencies.listHouseholdPurchases.execute({
      actorPrincipalId,
      householdId,
      ...(pageSize === undefined ? {} : { pageSize }),
      cursor: parseCursor(request.query.cursorOccurredAt, request.query.cursorPurchaseId),
    });
    return {
      purchases: output.purchases.map(serializePurchaseSummary),
      nextCursor: output.nextCursor === null ? null : {
        occurredAt: String(output.nextCursor.occurredAt),
        purchaseId: String(output.nextCursor.purchaseId),
      },
    };
  });

  server.get<{ Params: { householdId: string; purchaseId: string } }>(
    '/households/:householdId/purchases/:purchaseId',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.getHouseholdPurchase.execute({
        actorPrincipalId,
        householdId,
        purchaseId: parsePurchaseId(request.params.purchaseId),
      });
      return { purchase: serializePurchase(output.purchase) };
    },
  );

  server.post<{
    Params: { householdId: string };
    Body: { commandId?: unknown; transactionCurrencyCode?: unknown; items?: unknown };
  }>('/households/:householdId/purchases', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const householdId = parseHouseholdId(request.params.householdId);
    if (!Array.isArray(request.body?.items)) throw new InvalidInputError('Purchase items are invalid');
    const output = await dependencies.createPurchase.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId,
      transactionCurrencyCode: requireString(request.body?.transactionCurrencyCode, 'Transaction currency code'),
      items: request.body.items.map((item) => {
        if (typeof item !== 'object' || item === null) throw new InvalidInputError('Purchase item is invalid');
        return {
          productId: parseProductId((item as { productId?: unknown }).productId),
          quantity: parseCanonicalExactRationalWire((item as { quantity?: unknown }).quantity),
          measurementUnitId: parseMeasurementUnitId((item as { measurementUnitId?: unknown }).measurementUnitId),
        };
      }),
    });
    return reply.code(201).send({ purchaseId: String(output.purchaseId), purchaseItemIds: output.purchaseItemIds.map(String) });
  });

  server.post<{
    Params: { householdId: string };
    Body: { commandId?: unknown; purchaseId?: unknown; provenance?: unknown };
  }>('/households/:householdId/receipts', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const householdId = parseHouseholdId(request.params.householdId);
    const purchaseId = parseOptionalPurchaseId(request.body?.purchaseId);
    const output = await dependencies.createReceipt.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId,
      ...(purchaseId === undefined ? {} : { purchaseId }),
      provenance: requireString(request.body?.provenance, 'Receipt provenance'),
    });
    return reply.code(201).send({ receiptId: String(output.receiptId) });
  });

  server.post<{
    Params: { householdId: string; receiptId: string };
    Body: { commandId?: unknown; productId?: unknown; quantity?: unknown; measurementUnitId?: unknown; provenance?: unknown };
  }>('/households/:householdId/receipts/:receiptId/item-intents', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const householdId = parseHouseholdId(request.params.householdId);
    const output = await dependencies.createReceiptItemIntent.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId,
      receiptId: parseReceiptId(request.params.receiptId),
      productId: parseProductId(request.body?.productId),
      quantity: parseCanonicalExactRationalWire(request.body?.quantity),
      measurementUnitId: parseMeasurementUnitId(request.body?.measurementUnitId),
      provenance: requireString(request.body?.provenance, 'Receipt item intent provenance'),
    });
    return reply.code(201).send({ receiptItemIntentId: String(output.receiptItemIntentId) });
  });

  server.post<{
    Params: { householdId: string; receiptItemIntentId: string };
    Body: { commandId?: unknown; purchaseItemId?: unknown; allocationConversionEvidenceId?: unknown; placement?: unknown; provenance?: unknown };
  }>(
    '/households/:householdId/receipt-item-intents/:receiptItemIntentId/materialize-ordinary',
    async (request, reply) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const allocationConversionEvidenceId = parseOptionalConversionEvidenceId(request.body?.allocationConversionEvidenceId);
      const output = await dependencies.materializeOrdinaryReceiptItem.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        receiptItemIntentId: parseReceiptItemIntentId(request.params.receiptItemIntentId),
        purchaseItemId: parsePurchaseItemId(request.body?.purchaseItemId),
        ...(allocationConversionEvidenceId === undefined ? {} : { allocationConversionEvidenceId }),
        placement: parsePlacement(request.body?.placement),
        provenance: requireString(request.body?.provenance, 'Receipt materialization provenance'),
      });
      return reply.code(201).send({
        receiptItemId: String(output.receiptItemId),
        purchaseItemReceiptAllocationId: String(output.purchaseItemReceiptAllocationId),
        stockItemId: String(output.stockItemId),
        inventoryMovementId: String(output.inventoryMovementId),
        receiptItemInventoryEffectId: String(output.receiptItemInventoryEffectId),
      });
    },
  );
}

import type { FastifyInstance } from 'fastify';
import {
  CommandId,
  CompartmentId,
  HouseholdId,
  InvalidInputError,
  MeasurementConversionEvidenceId,
  PurchaseItemId,
  PurchaseReceivingExceptionId,
  ReceiptItemIntentId,
  StorageLocationId,
  type AcceptOrdinaryOverReceiptInput,
  type AcceptOrdinaryOverReceiptOutput,
  type AcceptSubstitutionOverReceiptInput,
  type AcceptSubstitutionOverReceiptOutput,
  type MaterializeSubstitutionReceiptItemInput,
  type MaterializeSubstitutionReceiptItemOutput,
  type RegisterOverReceiptExceptionInput,
  type RegisterOverReceiptExceptionOutput,
  type ResolveOverReceiptWithoutIngressInput,
  type ResolveOverReceiptWithoutIngressOutput,
  type UseCase,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';

export interface ProcurementReceivingExceptionRouteDependencies {
  readonly materializeSubstitutionReceiptItem: UseCase<
    MaterializeSubstitutionReceiptItemInput,
    MaterializeSubstitutionReceiptItemOutput
  >;
  readonly registerOverReceiptException: UseCase<
    RegisterOverReceiptExceptionInput,
    RegisterOverReceiptExceptionOutput
  >;
  readonly acceptOrdinaryOverReceipt: UseCase<
    AcceptOrdinaryOverReceiptInput,
    AcceptOrdinaryOverReceiptOutput
  >;
  readonly acceptSubstitutionOverReceipt: UseCase<
    AcceptSubstitutionOverReceiptInput,
    AcceptSubstitutionOverReceiptOutput
  >;
  readonly resolveOverReceiptWithoutIngress: UseCase<
    ResolveOverReceiptWithoutIngressInput,
    ResolveOverReceiptWithoutIngressOutput
  >;
}

function parseHouseholdId(value: string) {
  try { return HouseholdId(value); } catch (error) { throw new InvalidInputError('Household identifier is invalid', error); }
}
function parseCommandId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Command identifier is invalid');
  try { return CommandId(value); } catch (error) { throw new InvalidInputError('Command identifier is invalid', error); }
}
function parseIntentId(value: string) {
  try { return ReceiptItemIntentId(value); } catch (error) { throw new InvalidInputError('Receipt item intent identifier is invalid', error); }
}
function parsePurchaseItemId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Purchase item identifier is invalid');
  try { return PurchaseItemId(value); } catch (error) { throw new InvalidInputError('Purchase item identifier is invalid', error); }
}
function parseExceptionId(value: string) {
  try { return PurchaseReceivingExceptionId(value); } catch (error) { throw new InvalidInputError('Purchase receiving exception identifier is invalid', error); }
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
function parsePlacement(value: unknown): MaterializeSubstitutionReceiptItemInput['placement'] {
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
function serializeRational(value: { readonly numerator: bigint; readonly denominator: bigint }) {
  return { numerator: value.numerator.toString(), denominator: value.denominator.toString() };
}

export function registerProcurementReceivingExceptionRoutes(
  server: FastifyInstance,
  authenticatedPrincipal: AuthenticatedPrincipalResolver,
  dependencies: ProcurementReceivingExceptionRouteDependencies,
): void {
  server.post<{
    Params: { householdId: string; receiptItemIntentId: string };
    Body: { commandId?: unknown; purchaseItemId?: unknown; allocationConversionEvidenceId?: unknown; reason?: unknown; placement?: unknown; provenance?: unknown };
  }>('/households/:householdId/receipt-item-intents/:receiptItemIntentId/materialize-substitution', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const allocationConversionEvidenceId = parseOptionalConversionEvidenceId(request.body?.allocationConversionEvidenceId);
    const output = await dependencies.materializeSubstitutionReceiptItem.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      receiptItemIntentId: parseIntentId(request.params.receiptItemIntentId),
      purchaseItemId: parsePurchaseItemId(request.body?.purchaseItemId),
      ...(allocationConversionEvidenceId === undefined ? {} : { allocationConversionEvidenceId }),
      reason: requireString(request.body?.reason, 'Substitution reason'),
      placement: parsePlacement(request.body?.placement),
      provenance: requireString(request.body?.provenance, 'Substitution provenance'),
    });
    return reply.code(201).send({
      receiptItemId: String(output.receiptItemId),
      purchaseItemSubstitutionAllocationId: String(output.purchaseItemSubstitutionAllocationId),
      stockItemId: String(output.stockItemId),
      inventoryMovementId: String(output.inventoryMovementId),
      receiptItemInventoryEffectId: String(output.receiptItemInventoryEffectId),
    });
  });

  server.post<{
    Params: { householdId: string; receiptItemIntentId: string };
    Body: { commandId?: unknown; purchaseItemId?: unknown; allocationConversionEvidenceId?: unknown; reason?: unknown; provenance?: unknown };
  }>('/households/:householdId/receipt-item-intents/:receiptItemIntentId/over-receipt-exceptions', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const allocationConversionEvidenceId = parseOptionalConversionEvidenceId(request.body?.allocationConversionEvidenceId);
    const output = await dependencies.registerOverReceiptException.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      receiptItemIntentId: parseIntentId(request.params.receiptItemIntentId),
      purchaseItemId: parsePurchaseItemId(request.body?.purchaseItemId),
      ...(allocationConversionEvidenceId === undefined ? {} : { allocationConversionEvidenceId }),
      reason: requireString(request.body?.reason, 'Over-receipt reason'),
      provenance: requireString(request.body?.provenance, 'Over-receipt provenance'),
    });
    return reply.code(201).send({
      purchaseReceivingExceptionId: String(output.purchaseReceivingExceptionId),
      discrepantQuantity: serializeRational(output.discrepantQuantity),
      discrepantUnitId: String(output.discrepantUnitId),
    });
  });

  server.post<{
    Params: { householdId: string; purchaseReceivingExceptionId: string };
    Body: { commandId?: unknown; placement?: unknown; provenance?: unknown };
  }>('/households/:householdId/over-receipt-exceptions/:purchaseReceivingExceptionId/accept-ordinary', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const output = await dependencies.acceptOrdinaryOverReceipt.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      purchaseReceivingExceptionId: parseExceptionId(request.params.purchaseReceivingExceptionId),
      placement: parsePlacement(request.body?.placement),
      provenance: requireString(request.body?.provenance, 'Over-receipt acceptance provenance'),
    });
    return reply.code(201).send({
      purchaseReceivingExceptionResolutionId: String(output.purchaseReceivingExceptionResolutionId),
      receiptItemId: String(output.receiptItemId),
      purchaseItemReceiptAllocationId: String(output.purchaseItemReceiptAllocationId),
      stockItemId: String(output.stockItemId),
      inventoryMovementId: String(output.inventoryMovementId),
      receiptItemInventoryEffectId: String(output.receiptItemInventoryEffectId),
      acceptedExcessQuantity: serializeRational(output.acceptedExcessQuantity),
      acceptedExcessUnitId: String(output.acceptedExcessUnitId),
    });
  });

  server.post<{
    Params: { householdId: string; purchaseReceivingExceptionId: string };
    Body: { commandId?: unknown; reason?: unknown; placement?: unknown; provenance?: unknown };
  }>('/households/:householdId/over-receipt-exceptions/:purchaseReceivingExceptionId/accept-substitution', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const output = await dependencies.acceptSubstitutionOverReceipt.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      purchaseReceivingExceptionId: parseExceptionId(request.params.purchaseReceivingExceptionId),
      reason: requireString(request.body?.reason, 'Substitution reason'),
      placement: parsePlacement(request.body?.placement),
      provenance: requireString(request.body?.provenance, 'Substitution over-receipt provenance'),
    });
    return reply.code(201).send({
      purchaseReceivingExceptionResolutionId: String(output.purchaseReceivingExceptionResolutionId),
      receiptItemId: String(output.receiptItemId),
      purchaseItemSubstitutionAllocationId: String(output.purchaseItemSubstitutionAllocationId),
      stockItemId: String(output.stockItemId),
      inventoryMovementId: String(output.inventoryMovementId),
      receiptItemInventoryEffectId: String(output.receiptItemInventoryEffectId),
      acceptedExcessQuantity: serializeRational(output.acceptedExcessQuantity),
      acceptedExcessUnitId: String(output.acceptedExcessUnitId),
    });
  });

  server.post<{
    Params: { householdId: string; purchaseReceivingExceptionId: string };
    Body: { commandId?: unknown; resolutionKind?: unknown; reason?: unknown; provenance?: unknown };
  }>('/households/:householdId/over-receipt-exceptions/:purchaseReceivingExceptionId/resolve-without-ingress', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const resolutionKind = request.body?.resolutionKind;
    if (resolutionKind !== 'REJECTED_NO_INGRESS' && resolutionKind !== 'SUPERSEDED_DETECTION') {
      throw new InvalidInputError('Nonphysical over-receipt resolution kind is invalid');
    }
    const output = await dependencies.resolveOverReceiptWithoutIngress.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      purchaseReceivingExceptionId: parseExceptionId(request.params.purchaseReceivingExceptionId),
      resolutionKind,
      reason: requireString(request.body?.reason, 'Over-receipt resolution reason'),
      provenance: requireString(request.body?.provenance, 'Over-receipt resolution provenance'),
    });
    return reply.code(201).send({
      purchaseReceivingExceptionResolutionId: String(output.purchaseReceivingExceptionResolutionId),
      resolutionKind: output.resolutionKind,
    });
  });
}

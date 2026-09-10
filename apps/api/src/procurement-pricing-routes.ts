import type { FastifyInstance } from 'fastify';
import {
  CommandId,
  HouseholdId,
  InvalidInputError,
  MeasurementConversionEvidenceId,
  MeasurementUnitId,
  MoneyRoundingPolicyId,
  PurchaseId,
  PurchaseItemId,
  exactRational,
  type CommitPurchaseItemPricingBasisInput,
  type CommitPurchaseItemPricingBasisOutput,
  type CommitPurchaseItemPricingExtensionInput,
  type CommitPurchaseItemPricingExtensionOutput,
  type CommitPurchaseItemSourceMoneyFactsInput,
  type CommitPurchaseItemSourceMoneyFactsOutput,
  type PurchaseItemSourceMoneySemanticRole,
  type UseCase,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';

export interface ProcurementPricingRouteDependencies {
  readonly commitSourceMoneyFacts: UseCase<CommitPurchaseItemSourceMoneyFactsInput, CommitPurchaseItemSourceMoneyFactsOutput>;
  readonly commitPricingBasis: UseCase<CommitPurchaseItemPricingBasisInput, CommitPurchaseItemPricingBasisOutput>;
  readonly commitPricingExtension: UseCase<CommitPurchaseItemPricingExtensionInput, CommitPurchaseItemPricingExtensionOutput>;
}

const SOURCE_ROLES = new Set<PurchaseItemSourceMoneySemanticRole>([
  'LINE_GROSS', 'LINE_DISCOUNT', 'LINE_TAX', 'LINE_CHARGE', 'LINE_NET',
]);

function parseHouseholdId(value: string) {
  try { return HouseholdId(value); } catch (error) { throw new InvalidInputError('Household identifier is invalid', error); }
}
function parsePurchaseId(value: string) {
  try { return PurchaseId(value); } catch (error) { throw new InvalidInputError('Purchase identifier is invalid', error); }
}
function parsePurchaseItemId(value: string) {
  try { return PurchaseItemId(value); } catch (error) { throw new InvalidInputError('Purchase item identifier is invalid', error); }
}
function parseCommandId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Command identifier is invalid');
  try { return CommandId(value); } catch (error) { throw new InvalidInputError('Command identifier is invalid', error); }
}
function parseUnitId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Measurement unit identifier is invalid');
  try { return MeasurementUnitId(value); } catch (error) { throw new InvalidInputError('Measurement unit identifier is invalid', error); }
}
function parseOptionalConversionEvidenceId(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new InvalidInputError('Measurement conversion evidence identifier is invalid');
  try { return MeasurementConversionEvidenceId(value); } catch (error) { throw new InvalidInputError('Measurement conversion evidence identifier is invalid', error); }
}
function parseRoundingPolicyId(value: unknown) {
  if (typeof value !== 'string') throw new InvalidInputError('Money rounding policy identifier is invalid');
  try { return MoneyRoundingPolicyId(value); } catch (error) { throw new InvalidInputError('Money rounding policy identifier is invalid', error); }
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new InvalidInputError(`${label} is invalid`);
  return value;
}
function parseQuantity(value: unknown) {
  if (typeof value !== 'object' || value === null) throw new InvalidInputError('Pricing basis quantity is invalid');
  const numerator = (value as { numerator?: unknown }).numerator;
  const denominator = (value as { denominator?: unknown }).denominator;
  if (typeof numerator !== 'string' || typeof denominator !== 'string') throw new InvalidInputError('Pricing basis quantity is invalid');
  try { return exactRational(BigInt(numerator), BigInt(denominator)); } catch (error) { throw new InvalidInputError('Pricing basis quantity is invalid', error); }
}

export function registerProcurementPricingRoutes(
  server: FastifyInstance,
  authenticatedPrincipal: AuthenticatedPrincipalResolver,
  dependencies: ProcurementPricingRouteDependencies,
): void {
  server.post<{
    Params: { householdId: string; purchaseId: string; purchaseItemId: string };
    Body: { commandId?: unknown; facts?: unknown };
  }>('/households/:householdId/purchases/:purchaseId/items/:purchaseItemId/source-money-facts', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    if (!Array.isArray(request.body?.facts)) throw new InvalidInputError('Source money facts are invalid');
    const facts = request.body.facts.map((fact) => {
      if (typeof fact !== 'object' || fact === null) throw new InvalidInputError('Source money fact is invalid');
      const semanticRole = (fact as { semanticRole?: unknown }).semanticRole;
      if (typeof semanticRole !== 'string' || !SOURCE_ROLES.has(semanticRole as PurchaseItemSourceMoneySemanticRole)) {
        throw new InvalidInputError('Source money semantic role is invalid');
      }
      return {
        semanticRole: semanticRole as PurchaseItemSourceMoneySemanticRole,
        amount: requireString((fact as { amount?: unknown }).amount, 'Source money amount'),
        provenance: requireString((fact as { provenance?: unknown }).provenance, 'Source money provenance'),
      };
    });
    const output = await dependencies.commitSourceMoneyFacts.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      purchaseId: parsePurchaseId(request.params.purchaseId),
      purchaseItemId: parsePurchaseItemId(request.params.purchaseItemId),
      facts,
    });
    return reply.code(201).send({ purchaseItemMoneyFactIds: output.purchaseItemMoneyFactIds.map(String) });
  });

  server.post<{
    Params: { householdId: string; purchaseId: string; purchaseItemId: string };
    Body: { commandId?: unknown; pricingBasisQuantity?: unknown; pricingBasisUnitId?: unknown; pricingConversionEvidenceId?: unknown; basisAmount?: unknown; provenance?: unknown };
  }>('/households/:householdId/purchases/:purchaseId/items/:purchaseItemId/pricing-basis', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const pricingConversionEvidenceId = parseOptionalConversionEvidenceId(request.body?.pricingConversionEvidenceId);
    const output = await dependencies.commitPricingBasis.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      purchaseId: parsePurchaseId(request.params.purchaseId),
      purchaseItemId: parsePurchaseItemId(request.params.purchaseItemId),
      pricingBasisQuantity: parseQuantity(request.body?.pricingBasisQuantity),
      pricingBasisUnitId: parseUnitId(request.body?.pricingBasisUnitId),
      ...(pricingConversionEvidenceId === undefined ? {} : { pricingConversionEvidenceId }),
      basisAmount: requireString(request.body?.basisAmount, 'Pricing basis amount'),
      provenance: requireString(request.body?.provenance, 'Pricing basis provenance'),
    });
    return reply.code(201).send({ purchaseItemMoneyFactId: String(output.purchaseItemMoneyFactId) });
  });

  server.post<{
    Params: { householdId: string; purchaseId: string; purchaseItemId: string };
    Body: { commandId?: unknown; moneyRoundingPolicyId?: unknown; provenance?: unknown };
  }>('/households/:householdId/purchases/:purchaseId/items/:purchaseItemId/pricing-extension', async (request, reply) => {
    const actorPrincipalId = await authenticatedPrincipal.resolve(request);
    const output = await dependencies.commitPricingExtension.execute({
      commandId: parseCommandId(request.body?.commandId),
      actorPrincipalId,
      householdId: parseHouseholdId(request.params.householdId),
      purchaseId: parsePurchaseId(request.params.purchaseId),
      purchaseItemId: parsePurchaseItemId(request.params.purchaseItemId),
      moneyRoundingPolicyId: parseRoundingPolicyId(request.body?.moneyRoundingPolicyId),
      provenance: requireString(request.body?.provenance, 'Pricing extension provenance'),
    });
    return reply.code(201).send({
      purchaseItemMoneyFactId: String(output.purchaseItemMoneyFactId),
      pricingDiscrepancyId: output.pricingDiscrepancyId === null ? null : String(output.pricingDiscrepancyId),
    });
  });
}

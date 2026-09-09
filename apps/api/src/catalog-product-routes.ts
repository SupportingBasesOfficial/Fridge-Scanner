import type { FastifyInstance } from 'fastify';
import {
  CommandId,
  HouseholdId,
  InvalidInputError,
  ProductId,
  type CreateHouseholdProductInput,
  type CreateHouseholdProductOutput,
  type CurrentProduct,
  type GetCurrentProductInput,
  type ListCurrentProductsInput,
  type UseCase,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';

export interface CatalogProductRouteDependencies {
  readonly listCurrentProducts: UseCase<
    ListCurrentProductsInput,
    { readonly products: readonly CurrentProduct[] }
  >;
  readonly getCurrentProduct: UseCase<
    GetCurrentProductInput,
    { readonly product: CurrentProduct }
  >;
  readonly createHouseholdProduct: UseCase<
    CreateHouseholdProductInput,
    CreateHouseholdProductOutput
  >;
}

function parseHouseholdId(value: string) {
  try {
    return HouseholdId(value);
  } catch (error) {
    throw new InvalidInputError('Household identifier is invalid', error);
  }
}

function parseProductId(value: string) {
  try {
    return ProductId(value);
  } catch (error) {
    throw new InvalidInputError('Product identifier is invalid', error);
  }
}

function parseCommandId(value: unknown) {
  if (typeof value !== 'string') {
    throw new InvalidInputError('Command identifier is invalid');
  }
  try {
    return CommandId(value);
  } catch (error) {
    throw new InvalidInputError('Command identifier is invalid', error);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new InvalidInputError(`${label} is invalid`);
  }
  return value;
}

function serializeProduct(product: CurrentProduct) {
  return {
    productId: String(product.productId),
    catalogScope: product.catalogScope,
    ownerHouseholdId: product.ownerHouseholdId === null ? null : String(product.ownerHouseholdId),
    canonicalName: product.canonicalName,
    brandId: product.brandId === null ? null : String(product.brandId),
    manufacturerId: product.manufacturerId === null ? null : String(product.manufacturerId),
    productCategoryId: product.productCategoryId === null ? null : String(product.productCategoryId),
    createdAt: String(product.createdAt),
  };
}

export function registerCatalogProductRoutes(
  server: FastifyInstance,
  authenticatedPrincipal: AuthenticatedPrincipalResolver,
  dependencies: CatalogProductRouteDependencies,
): void {
  server.get<{ Params: { householdId: string } }>(
    '/households/:householdId/products',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.listCurrentProducts.execute({ actorPrincipalId, householdId });
      return { products: output.products.map(serializeProduct) };
    },
  );

  server.get<{ Params: { householdId: string; productId: string } }>(
    '/households/:householdId/products/:productId',
    async (request) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const productId = parseProductId(request.params.productId);
      const output = await dependencies.getCurrentProduct.execute({
        actorPrincipalId,
        householdId,
        productId,
      });
      return { product: serializeProduct(output.product) };
    },
  );

  server.post<{
    Params: { householdId: string };
    Body: { commandId?: unknown; canonicalName?: unknown };
  }>(
    '/households/:householdId/products',
    async (request, reply) => {
      const actorPrincipalId = await authenticatedPrincipal.resolve(request);
      const householdId = parseHouseholdId(request.params.householdId);
      const output = await dependencies.createHouseholdProduct.execute({
        commandId: parseCommandId(request.body?.commandId),
        actorPrincipalId,
        householdId,
        canonicalName: requireString(request.body?.canonicalName, 'Product canonical name'),
      });
      return reply.code(201).send({ productId: String(output.productId) });
    },
  );
}

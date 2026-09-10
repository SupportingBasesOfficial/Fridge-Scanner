import { randomUUID } from 'node:crypto';
import {
  AcceptOrdinaryOverReceiptUseCase,
  AcceptSubstitutionOverReceiptUseCase,
  AddHouseholdMemberUseCase,
  ChangeCompartmentMetadataUseCase,
  ChangeStorageLocationMetadataUseCase,
  CompartmentId,
  CreateCompartmentUseCase,
  CreateHouseholdProductUseCase,
  CreatePurchaseUseCase,
  CreateReceiptItemIntentUseCase,
  CreateReceiptUseCase,
  CreateStorageLocationUseCase,
  GetCurrentCompartmentUseCase,
  GetCurrentProductUseCase,
  GetCurrentStorageLocationUseCase,
  GetHouseholdPurchaseUseCase,
  HouseholdMembershipId,
  InventoryMovementId,
  ListCurrentCompartmentsUseCase,
  ListCurrentProductsUseCase,
  ListCurrentStorageLocationsUseCase,
  ListHouseholdPurchasesUseCase,
  MaterializeOrdinaryReceiptItemUseCase,
  MaterializeSubstitutionReceiptItemUseCase,
  ProductId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
  PurchaseItemSubstitutionAllocationId,
  PurchaseReceivingExceptionId,
  PurchaseReceivingExceptionResolutionId,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
  ReceiptId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  RegisterOverReceiptExceptionUseCase,
  ResolveOverReceiptWithoutIngressUseCase,
  RetireCompartmentUseCase,
  RetireStorageLocationUseCase,
  StockItemId,
  StorageLocationId,
} from '@fridge/application';
import { parseRuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgHouseholdOrdinaryOverReceiptAcceptor } from '@fridge/database/accept-ordinary-over-receipt';
import { PgHouseholdSubstitutionOverReceiptAcceptor } from '@fridge/database/accept-substitution-over-receipt';
import { PgHouseholdCatalogAdministrationTransactionManager } from '@fridge/database/catalog-administration';
import { PgCompartmentMetadataChanger } from '@fridge/database/change-compartment-metadata';
import { PgStorageLocationMetadataChanger } from '@fridge/database/change-storage-location-metadata';
import { PgCompartmentWriter } from '@fridge/database/compartment';
import { PgCurrentCompartmentReader } from '@fridge/database/compartment-read';
import { PgHouseholdProductWriter } from '@fridge/database/create-household-product';
import { PgHouseholdPurchaseWriter } from '@fridge/database/create-purchase';
import { PgHouseholdReceiptWriter } from '@fridge/database/create-receipt';
import { PgHouseholdReceiptItemIntentWriter } from '@fridge/database/create-receipt-item-intent';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from '@fridge/database/materialize-ordinary-receipt-item';
import { PgHouseholdSubstitutionReceiptItemMaterializer } from '@fridge/database/materialize-substitution-receipt-item';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import { PgHouseholdProcurementAdministrationTransactionManager } from '@fridge/database/procurement-administration';
import { PgCurrentProductReader } from '@fridge/database/product-read';
import { PgHouseholdPurchaseReader } from '@fridge/database/purchase-read';
import { PgHouseholdOverReceiptExceptionRegistrar } from '@fridge/database/register-over-receipt-exception';
import { PgHouseholdOverReceiptNonphysicalResolver } from '@fridge/database/resolve-over-receipt-without-ingress';
import { PgCompartmentRetirer } from '@fridge/database/retire-compartment';
import { PgStorageLocationRetirer } from '@fridge/database/retire-storage-location';
import { PgHouseholdStorageAdministrationTransactionManager } from '@fridge/database/storage-administration';
import { PgStorageLocationWriter } from '@fridge/database/storage-location';
import { PgCurrentStorageLocationReader } from '@fridge/database/storage-location-read';
import { registerProcurementReceivingExceptionRoutes } from './procurement-receiving-exception-routes.js';
import { buildRuntimeAuthenticatedPrincipalResolver } from './runtime-auth.js';
import { buildApiServer } from './server.js';

const config = parseRuntimeConfig(process.env);
const database = new PgDatabase({
  connectionString: config.databaseUrl,
  capabilityRole: config.databaseCapabilityRole,
});
const householdProfiles = new PgHouseholdProfileReader();
const readAuthorizedHouseholdContext = new ReadAuthorizedHouseholdContext(database, householdProfiles);
const readCurrentHouseholdMembers = new ReadCurrentHouseholdMembersUseCase(
  database,
  new PgCurrentHouseholdMembershipReader(),
);
const addHouseholdMember = new AddHouseholdMemberUseCase(
  database,
  database,
  { generate: () => HouseholdMembershipId(randomUUID()) },
);

const storageAdministration = new PgHouseholdStorageAdministrationTransactionManager(database);
const currentStorageLocations = new PgCurrentStorageLocationReader();
const currentCompartments = new PgCurrentCompartmentReader();
const storageTopology = {
  listCurrentStorageLocations: new ListCurrentStorageLocationsUseCase(database, currentStorageLocations),
  getCurrentStorageLocation: new GetCurrentStorageLocationUseCase(database, currentStorageLocations),
  createStorageLocation: new CreateStorageLocationUseCase(
    storageAdministration,
    new PgStorageLocationWriter(),
    { generate: () => StorageLocationId(randomUUID()) },
  ),
  changeStorageLocationMetadata: new ChangeStorageLocationMetadataUseCase(
    storageAdministration,
    new PgStorageLocationMetadataChanger(),
  ),
  retireStorageLocation: new RetireStorageLocationUseCase(
    storageAdministration,
    new PgStorageLocationRetirer(),
  ),
  listCurrentCompartments: new ListCurrentCompartmentsUseCase(database, currentCompartments),
  getCurrentCompartment: new GetCurrentCompartmentUseCase(database, currentCompartments),
  createCompartment: new CreateCompartmentUseCase(
    storageAdministration,
    new PgCompartmentWriter(),
    { generate: () => CompartmentId(randomUUID()) },
  ),
  changeCompartmentMetadata: new ChangeCompartmentMetadataUseCase(
    storageAdministration,
    new PgCompartmentMetadataChanger(),
  ),
  retireCompartment: new RetireCompartmentUseCase(
    storageAdministration,
    new PgCompartmentRetirer(),
  ),
};

const catalogAdministration = new PgHouseholdCatalogAdministrationTransactionManager(database);
const currentProducts = new PgCurrentProductReader();
const catalogProducts = {
  listCurrentProducts: new ListCurrentProductsUseCase(database, currentProducts),
  getCurrentProduct: new GetCurrentProductUseCase(database, currentProducts),
  createHouseholdProduct: new CreateHouseholdProductUseCase(
    catalogAdministration,
    new PgHouseholdProductWriter(),
    { generate: () => ProductId(randomUUID()) },
  ),
};

const procurementAdministration = new PgHouseholdProcurementAdministrationTransactionManager(database);
const purchaseReader = new PgHouseholdPurchaseReader();
const procurementReceiving = {
  listHouseholdPurchases: new ListHouseholdPurchasesUseCase(database, purchaseReader),
  getHouseholdPurchase: new GetHouseholdPurchaseUseCase(database, purchaseReader),
  createPurchase: new CreatePurchaseUseCase(
    procurementAdministration,
    new PgHouseholdPurchaseWriter(),
    { generate: () => PurchaseId(randomUUID()) },
    { generate: () => PurchaseItemId(randomUUID()) },
  ),
  createReceipt: new CreateReceiptUseCase(
    procurementAdministration,
    new PgHouseholdReceiptWriter(),
    { generate: () => ReceiptId(randomUUID()) },
  ),
  createReceiptItemIntent: new CreateReceiptItemIntentUseCase(
    procurementAdministration,
    new PgHouseholdReceiptItemIntentWriter(),
    { generate: () => ReceiptItemIntentId(randomUUID()) },
  ),
  materializeOrdinaryReceiptItem: new MaterializeOrdinaryReceiptItemUseCase(
    procurementAdministration,
    new PgHouseholdOrdinaryReceiptItemMaterializer(),
    { generate: () => ReceiptItemId(randomUUID()) },
    { generate: () => PurchaseItemReceiptAllocationId(randomUUID()) },
    { generate: () => StockItemId(randomUUID()) },
    { generate: () => InventoryMovementId(randomUUID()) },
    { generate: () => ReceiptItemInventoryEffectId(randomUUID()) },
  ),
};

const procurementReceivingExceptions = {
  materializeSubstitutionReceiptItem: new MaterializeSubstitutionReceiptItemUseCase(
    procurementAdministration,
    new PgHouseholdSubstitutionReceiptItemMaterializer(),
    { generate: () => ReceiptItemId(randomUUID()) },
    { generate: () => PurchaseItemSubstitutionAllocationId(randomUUID()) },
    { generate: () => StockItemId(randomUUID()) },
    { generate: () => InventoryMovementId(randomUUID()) },
    { generate: () => ReceiptItemInventoryEffectId(randomUUID()) },
  ),
  registerOverReceiptException: new RegisterOverReceiptExceptionUseCase(
    procurementAdministration,
    new PgHouseholdOverReceiptExceptionRegistrar(),
    { generate: () => PurchaseReceivingExceptionId(randomUUID()) },
  ),
  acceptOrdinaryOverReceipt: new AcceptOrdinaryOverReceiptUseCase(
    procurementAdministration,
    new PgHouseholdOrdinaryOverReceiptAcceptor(),
    { generate: () => PurchaseReceivingExceptionResolutionId(randomUUID()) },
    { generate: () => ReceiptItemId(randomUUID()) },
    { generate: () => PurchaseItemReceiptAllocationId(randomUUID()) },
    { generate: () => StockItemId(randomUUID()) },
    { generate: () => InventoryMovementId(randomUUID()) },
    { generate: () => ReceiptItemInventoryEffectId(randomUUID()) },
  ),
  acceptSubstitutionOverReceipt: new AcceptSubstitutionOverReceiptUseCase(
    procurementAdministration,
    new PgHouseholdSubstitutionOverReceiptAcceptor(),
    { generate: () => PurchaseReceivingExceptionResolutionId(randomUUID()) },
    { generate: () => ReceiptItemId(randomUUID()) },
    { generate: () => PurchaseItemSubstitutionAllocationId(randomUUID()) },
    { generate: () => StockItemId(randomUUID()) },
    { generate: () => InventoryMovementId(randomUUID()) },
    { generate: () => ReceiptItemInventoryEffectId(randomUUID()) },
  ),
  resolveOverReceiptWithoutIngress: new ResolveOverReceiptWithoutIngressUseCase(
    procurementAdministration,
    new PgHouseholdOverReceiptNonphysicalResolver(),
    { generate: () => PurchaseReceivingExceptionResolutionId(randomUUID()) },
  ),
};

const authenticatedPrincipal = buildRuntimeAuthenticatedPrincipalResolver(config, database);
const server = buildApiServer({
  config,
  readiness: database,
  authenticatedPrincipal,
  readAuthorizedHouseholdContext,
  readCurrentHouseholdMembers,
  addHouseholdMember,
  storageTopology,
  catalogProducts,
  procurementReceiving,
});
registerProcurementReceivingExceptionRoutes(
  server,
  authenticatedPrincipal,
  procurementReceivingExceptions,
);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  server.log.info({ signal }, 'shutdown requested');

  const forceExitTimer = setTimeout(() => {
    server.log.fatal({ signal }, 'graceful shutdown deadline exceeded');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  forceExitTimer.unref();

  try {
    await server.close();
    await database.close();
    clearTimeout(forceExitTimer);
    server.log.info({ signal }, 'shutdown complete');
  } catch (error) {
    clearTimeout(forceExitTimer);
    server.log.error({ err: error, signal }, 'shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

try {
  await server.listen({ host: config.httpHost, port: config.httpPort });
} catch (error) {
  server.log.fatal({ err: error }, 'API startup failed');
  await database.close().catch(() => undefined);
  process.exitCode = 1;
}

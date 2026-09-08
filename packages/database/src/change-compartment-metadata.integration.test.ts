import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ChangeCompartmentMetadataUseCase,
  CommandId,
  CompartmentId,
  HouseholdId,
  IdempotencyConflictError,
  InvalidInputError,
  NotFoundError,
  PrincipalId,
  StorageLocationId,
} from '@fridge/application';
import { PgCompartmentMetadataChanger } from './change-compartment-metadata.js';
import { PgDatabase } from './index.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for ChangeCompartmentMetadata tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for ChangeCompartmentMetadata tests');

const HOUSEHOLD = HouseholdId('c9f10101-0b04-4f01-8b04-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('c9f10202-0b04-4f02-8b04-000000000002');
const ADMIN = PrincipalId('c9f10303-0b04-4f03-8b04-000000000003');
const ORDINARY = PrincipalId('c9f10404-0b04-4f04-8b04-000000000004');
const ADMIN_MEMBERSHIP = 'c9f10505-0b04-4f05-8b04-000000000005';
const ORDINARY_MEMBERSHIP = 'c9f10606-0b04-4f06-8b04-000000000006';
const PARENT = StorageLocationId('c9f11111-0b04-4f11-8b04-000000000011');
const RETIRED_PARENT = StorageLocationId('c9f11212-0b04-4f12-8b04-000000000012');
const FOREIGN_PARENT = StorageLocationId('c9f11313-0b04-4f13-8b04-000000000013');
const TARGET = CompartmentId('c9f12121-0b04-4f21-8b04-000000000021');
const RETIRED_CHILD = CompartmentId('c9f12222-0b04-4f22-8b04-000000000022');
const CHILD_UNDER_RETIRED_PARENT = CompartmentId('c9f12323-0b04-4f23-8b04-000000000023');
const FOREIGN_CHILD = CompartmentId('c9f12424-0b04-4f24-8b04-000000000024');
const REPLAY_TARGET = CompartmentId('c9f12525-0b04-4f25-8b04-000000000025');
const STORAGE_KIND = 'BE04_CCM_STORAGE';
const ACTIVE_KIND = 'BE04_CCM_SHELF';
const RETIRED_KIND = 'BE04_CCM_RETIRED';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Change Compartment Admin'), ($2::uuid, 'BE04 Change Compartment Member')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Change Compartment Household'), ($2::uuid, 'BE04 Change Compartment Foreign')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_CCM_ADMIN', 'BE04 ChangeCompartment admin'), ('BE04_CCM_MEMBER', 'BE04 ChangeCompartment member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_CCM_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_CCM_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_CCM_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 ChangeCompartment storage', 'ACTIVE')`,
      [STORAGE_KIND],
    );
    await pool.query(
      `insert into fridge.compartment_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 active shelf', 'ACTIVE'), ($2, 'BE04 retired shelf', 'RETIRED')`,
      [ACTIVE_KIND, RETIRED_KIND],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name, lifecycle_status, sort_order, created_at, retired_at
       ) values
         ($1::uuid, $4::uuid, $6, 'Current parent', 'ACTIVE', 1, clock_timestamp() - interval '2 hours', null),
         ($2::uuid, $4::uuid, $6, 'Retired parent', 'RETIRED', 2, clock_timestamp() - interval '3 hours', clock_timestamp() - interval '1 hour'),
         ($3::uuid, $5::uuid, $6, 'Foreign parent', 'ACTIVE', 1, clock_timestamp() - interval '2 hours', null)`,
      [PARENT, RETIRED_PARENT, FOREIGN_PARENT, HOUSEHOLD, OTHER_HOUSEHOLD, STORAGE_KIND],
    );
    await pool.query(
      `insert into fridge.compartment (
         compartment_id, household_id, storage_location_id, kind_code, display_name,
         sort_order, lifecycle_status, created_at, retired_at
       ) values
         ($1::uuid, $6::uuid, $7::uuid, null, 'Target', 1, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $6::uuid, $7::uuid, null, 'Retired child', 2, 'RETIRED', clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour'),
         ($3::uuid, $6::uuid, $8::uuid, null, 'Child under retired parent', 3, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($4::uuid, $9::uuid, $10::uuid, null, 'Foreign child', 1, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($5::uuid, $6::uuid, $7::uuid, $11, 'Replay target', 4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [TARGET, RETIRED_CHILD, CHILD_UNDER_RETIRED_PARENT, FOREIGN_CHILD, REPLAY_TARGET,
       HOUSEHOLD, PARENT, RETIRED_PARENT, OTHER_HOUSEHOLD, FOREIGN_PARENT, ACTIVE_KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function useCase(database: PgDatabase): ChangeCompartmentMetadataUseCase {
  return new ChangeCompartmentMetadataUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgCompartmentMetadataChanger(),
  );
}

test('storage administrator changes only current Compartment metadata and preserves parent identity', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const result = await useCase(database).execute({
      commandId: CommandId('c9f13131-0b04-4f31-8b04-000000000031'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      compartmentId: TARGET,
      kindCode: ACTIVE_KIND,
      displayName: 'Renamed target',
      sortOrder: 9,
    });
    assert.equal(result.compartmentId, TARGET);

    const observed = await adminPool.query<{
      household_id: string;
      storage_location_id: string;
      kind_code: string | null;
      display_name: string;
      sort_order: number | null;
      intent_code: string;
    }>(
      `select c.household_id::text,
              c.storage_location_id::text,
              c.kind_code,
              c.display_name,
              c.sort_order,
              r.intent_code
         from fridge.compartment c
         join fridge.compartment_metadata_change_command cmd
           on cmd.compartment_id = c.compartment_id
         join fridge.storage_topology_command_registry r
           on r.household_id = cmd.household_id and r.command_id = cmd.command_id
        where c.compartment_id = $1::uuid`,
      [TARGET],
    );
    assert.deepEqual(observed.rows[0], {
      household_id: HOUSEHOLD,
      storage_location_id: PARENT,
      kind_code: ACTIVE_KIND,
      display_name: 'Renamed target',
      sort_order: 9,
      intent_code: 'CHANGE_COMPARTMENT_METADATA',
    });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('nullable kind is accepted while inactive governed kind is rejected', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await useCase(database).execute({
      commandId: CommandId('c9f14141-0b04-4f41-8b04-000000000041'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      compartmentId: TARGET,
      kindCode: null,
      displayName: 'No semantic kind',
      sortOrder: null,
    });

    await assert.rejects(
      useCase(database).execute({
        commandId: CommandId('c9f14242-0b04-4f42-8b04-000000000042'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        compartmentId: TARGET,
        kindCode: RETIRED_KIND,
        displayName: 'Invalid semantic kind',
        sortOrder: null,
      }),
      InvalidInputError,
    );
  } finally {
    await database.close();
  }
});

test('committed replay after later retirement is non-restoring', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('c9f15151-0b04-4f51-8b04-000000000051');
  const input = {
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    compartmentId: REPLAY_TARGET,
    kindCode: null,
    displayName: 'Changed once',
    sortOrder: 7,
  } as const;
  try {
    await useCase(database).execute(input);
    await adminPool.query(
      `update fridge.compartment
          set lifecycle_status = 'RETIRED', retired_at = clock_timestamp(), display_name = 'Later state'
        where compartment_id = $1::uuid`,
      [REPLAY_TARGET],
    );

    const replay = await useCase(database).execute(input);
    assert.equal(replay.compartmentId, REPLAY_TARGET);
    const observed = await adminPool.query<{ lifecycle_status: string; display_name: string; retired: boolean }>(
      `select lifecycle_status, display_name, retired_at is not null as retired
         from fridge.compartment where compartment_id = $1::uuid`,
      [REPLAY_TARGET],
    );
    assert.deepEqual(observed.rows[0], {
      lifecycle_status: 'RETIRED',
      display_name: 'Later state',
      retired: true,
    });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('retired child, child under retired parent, foreign child and missing child collapse to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const targets = [
    RETIRED_CHILD,
    CHILD_UNDER_RETIRED_PARENT,
    FOREIGN_CHILD,
    CompartmentId('c9f16161-0b04-4f61-8b04-000000000061'),
  ];
  try {
    for (let index = 0; index < targets.length; index += 1) {
      await assert.rejects(
        useCase(database).execute({
          commandId: CommandId(`c9f17${index + 1}${index + 1}-0b04-4f7${index + 1}-8b04-00000000007${index + 1}`),
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          compartmentId: targets[index]!,
          kindCode: null,
          displayName: 'Hidden target',
          sortOrder: null,
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('same CommandId cannot cross from CreateCompartment intent to ChangeCompartmentMetadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('c9f18181-0b04-4f81-8b04-000000000081');
  const candidate = CompartmentId('c9f18282-0b04-4f82-8b04-000000000082');
  try {
    await adminPool.query(
      `set local role fridge_app`,
    ).catch(() => undefined);
    const transactions = new PgHouseholdStorageAdministrationTransactionManager(database);
    const { CreateCompartmentUseCase } = await import('@fridge/application');
    const { PgCompartmentWriter } = await import('./compartment.js');
    await new CreateCompartmentUseCase(
      transactions,
      new PgCompartmentWriter(),
      { generate: () => candidate },
    ).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: PARENT,
      kindCode: null,
      displayName: 'Registry seed',
      sortOrder: null,
    });

    await assert.rejects(
      useCase(database).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        compartmentId: TARGET,
        kindCode: null,
        displayName: 'Registry collision',
        sortOrder: null,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('ordinary current member cannot change Compartment metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database).execute({
        commandId: CommandId('c9f19191-0b04-4f91-8b04-000000000091'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        compartmentId: TARGET,
        kindCode: null,
        displayName: 'Forbidden',
        sortOrder: null,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'HOUSEHOLD_UNAUTHORIZED');
        return true;
      },
    );
  } finally {
    await database.close();
  }
});

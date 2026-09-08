import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ChangeStorageLocationMetadataUseCase,
  CommandId,
  CreateStorageLocationUseCase,
  HouseholdId,
  IdempotencyConflictError,
  PrincipalId,
  RetireStorageLocationUseCase,
  StorageLocationId,
} from '@fridge/application';
import { PgStorageLocationMetadataChanger } from './change-storage-location-metadata.js';
import { PgDatabase } from './index.js';
import { PgStorageLocationRetirer } from './retire-storage-location.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';
import { PgStorageLocationWriter } from './storage-location.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('9a6c0101-0b04-4c01-8b04-000000000001');
const ADMIN = PrincipalId('9a6c0202-0b04-4c02-8b04-000000000002');
const ORDINARY = PrincipalId('9a6c0303-0b04-4c03-8b04-000000000003');
const ADMIN_MEMBERSHIP = '9a6c0404-0b04-4c04-8b04-000000000004';
const ORDINARY_MEMBERSHIP = '9a6c0505-0b04-4c05-8b04-000000000005';
const KIND = 'BE04_COMMAND_REGISTRY_FRIDGE';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Registry Admin'), ($2::uuid, 'BE04 Registry Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Registry Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_REGISTRY_ADMIN', 'BE04 registry administrator'),
              ('BE04_REGISTRY_MEMBER', 'BE04 registry ordinary member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_REGISTRY_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_REGISTRY_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_REGISTRY_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 registry fridge', 'ACTIVE')`,
      [KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

async function seedLocation(pool: Pool, id: StorageLocationId, name: string): Promise<void> {
  await pool.query(
    `insert into fridge.storage_location (
       storage_location_id, household_id, kind_code, display_name,
       lifecycle_status, created_at, retired_at
     ) values ($1::uuid, $2::uuid, $3, $4, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
    [id, HOUSEHOLD, KIND, name],
  );
}

function transactions(database: PgDatabase): PgHouseholdStorageAdministrationTransactionManager {
  return new PgHouseholdStorageAdministrationTransactionManager(database);
}

test('one Household-scoped CommandId is bound to exactly one topology intent', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 2 });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const createCommand = CommandId('9a6c1111-0b04-4c11-8b04-000000000011');
  const createCandidate = StorageLocationId('9a6c1212-0b04-4c12-8b04-000000000012');
  const changeCommand = CommandId('9a6c1313-0b04-4c13-8b04-000000000013');
  const changeTarget = StorageLocationId('9a6c1414-0b04-4c14-8b04-000000000014');
  const retireCommand = CommandId('9a6c1515-0b04-4c15-8b04-000000000015');
  const retireTarget = StorageLocationId('9a6c1616-0b04-4c16-8b04-000000000016');
  const createAfterRetireCandidate = StorageLocationId('9a6c1717-0b04-4c17-8b04-000000000017');

  try {
    await seedLocation(adminPool, changeTarget, 'Change target');
    await seedLocation(adminPool, retireTarget, 'Retire target');

    const create = new CreateStorageLocationUseCase(
      transactions(database),
      new PgStorageLocationWriter(),
      { generate: () => createCandidate },
    );
    const change = new ChangeStorageLocationMetadataUseCase(
      transactions(database),
      new PgStorageLocationMetadataChanger(),
    );
    const retire = new RetireStorageLocationUseCase(
      transactions(database),
      new PgStorageLocationRetirer(),
    );

    await create.execute({
      commandId: createCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      kindCode: KIND,
      displayName: 'Created by registry test',
      sortOrder: null,
    });
    await assert.rejects(
      change.execute({
        commandId: createCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: createCandidate,
        kindCode: KIND,
        displayName: 'Must not change',
        sortOrder: null,
      }),
      IdempotencyConflictError,
    );

    await change.execute({
      commandId: changeCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: changeTarget,
      kindCode: KIND,
      displayName: 'Changed once',
      sortOrder: 4,
    });
    await assert.rejects(
      retire.execute({
        commandId: changeCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: changeTarget,
      }),
      IdempotencyConflictError,
    );

    await retire.execute({
      commandId: retireCommand,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: retireTarget,
    });
    const createAfterRetire = new CreateStorageLocationUseCase(
      transactions(database),
      new PgStorageLocationWriter(),
      { generate: () => createAfterRetireCandidate },
    );
    await assert.rejects(
      createAfterRetire.execute({
        commandId: retireCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        kindCode: KIND,
        displayName: 'Must not create',
        sortOrder: null,
      }),
      IdempotencyConflictError,
    );

    const registry = await adminPool.query<{ command_id: string; intent_code: string }>(
      `select command_id::text, intent_code
         from fridge.storage_topology_command_registry
        where household_id = $1::uuid
        order by command_id`,
      [HOUSEHOLD],
    );
    assert.deepEqual(registry.rows, [
      { command_id: createCommand, intent_code: 'CREATE_STORAGE_LOCATION' },
      { command_id: changeCommand, intent_code: 'CHANGE_STORAGE_LOCATION_METADATA' },
      { command_id: retireCommand, intent_code: 'RETIRE_STORAGE_LOCATION' },
    ]);
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('topology CommandId registry is not an authority oracle', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const target = StorageLocationId('9a6c2121-0b04-4c21-8b04-000000000021');
  const command = CommandId('9a6c2222-0b04-4c22-8b04-000000000022');
  try {
    await seedLocation(adminPool, target, 'Authority oracle target');
    const retire = new RetireStorageLocationUseCase(
      transactions(database),
      new PgStorageLocationRetirer(),
    );
    await retire.execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: target,
    });

    const change = new ChangeStorageLocationMetadataUseCase(
      transactions(database),
      new PgStorageLocationMetadataChanger(),
    );
    await assert.rejects(
      change.execute({
        commandId: command,
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        storageLocationId: target,
        kindCode: KIND,
        displayName: 'Unauthorized probe',
        sortOrder: null,
      }),
      (error: unknown) => (error as { code?: string }).code === 'HOUSEHOLD_UNAUTHORIZED',
    );
  } finally {
    await adminPool.end();
    await database.close();
  }
});

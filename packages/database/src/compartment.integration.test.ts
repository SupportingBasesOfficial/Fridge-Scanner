import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompartmentId,
  ConflictError,
  CreateCompartmentUseCase,
  CreateStorageLocationUseCase,
  HouseholdId,
  IdempotencyConflictError,
  InvalidInputError,
  NotFoundError,
  PrincipalId,
  RetireStorageLocationUseCase,
  StorageLocationId,
} from '@fridge/application';
import { PgCompartmentWriter } from './compartment.js';
import { PgDatabase } from './index.js';
import { PgStorageLocationRetirer } from './retire-storage-location.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';
import { PgStorageLocationWriter } from './storage-location.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for CreateCompartment tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for CreateCompartment tests');

const HOUSEHOLD = HouseholdId('a7d60101-0b04-4d01-8b04-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('a7d60202-0b04-4d02-8b04-000000000002');
const ADMIN = PrincipalId('a7d60303-0b04-4d03-8b04-000000000003');
const ORDINARY = PrincipalId('a7d60404-0b04-4d04-8b04-000000000004');
const ADMIN_MEMBERSHIP = 'a7d60505-0b04-4d05-8b04-000000000005';
const ORDINARY_MEMBERSHIP = 'a7d60606-0b04-4d06-8b04-000000000006';
const PARENT = StorageLocationId('a7d61111-0b04-4d11-8b04-000000000011');
const SECOND_PARENT = StorageLocationId('a7d61212-0b04-4d12-8b04-000000000012');
const RETIRED_PARENT = StorageLocationId('a7d61313-0b04-4d13-8b04-000000000013');
const FOREIGN_PARENT = StorageLocationId('a7d61414-0b04-4d14-8b04-000000000014');
const RACE_PARENT = StorageLocationId('a7d61515-0b04-4d15-8b04-000000000015');
const STORAGE_KIND = 'BE04_CC_STORAGE';
const ACTIVE_KIND = 'BE04_CC_SHELF';
const RETIRED_KIND = 'BE04_CC_RETIRED_KIND';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Compartment Admin'), ($2::uuid, 'BE04 Compartment Member')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Compartment Household'), ($2::uuid, 'BE04 Compartment Foreign')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_CC_ADMIN', 'BE04 CreateCompartment admin'), ('BE04_CC_MEMBER', 'BE04 CreateCompartment member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_CC_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_CC_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_CC_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 CreateCompartment storage', 'ACTIVE')`,
      [STORAGE_KIND],
    );
    await pool.query(
      `insert into fridge.compartment_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 shelf', 'ACTIVE'), ($2, 'BE04 retired shelf', 'RETIRED')`,
      [ACTIVE_KIND, RETIRED_KIND],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name, lifecycle_status, sort_order, created_at, retired_at
       ) values
         ($1::uuid, $6::uuid, $8, 'Parent A', 'ACTIVE', 1, clock_timestamp() - interval '2 hours', null),
         ($2::uuid, $6::uuid, $8, 'Parent B', 'ACTIVE', 2, clock_timestamp() - interval '2 hours', null),
         ($3::uuid, $6::uuid, $8, 'Retired parent', 'RETIRED', 3, clock_timestamp() - interval '3 hours', clock_timestamp() - interval '1 hour'),
         ($4::uuid, $7::uuid, $8, 'Foreign parent', 'ACTIVE', 1, clock_timestamp() - interval '2 hours', null),
         ($5::uuid, $6::uuid, $8, 'Race parent', 'ACTIVE', 4, clock_timestamp() - interval '2 hours', null)`,
      [PARENT, SECOND_PARENT, RETIRED_PARENT, FOREIGN_PARENT, RACE_PARENT, HOUSEHOLD, OTHER_HOUSEHOLD, STORAGE_KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function createCompartmentUseCase(database: PgDatabase, candidate: CompartmentId): CreateCompartmentUseCase {
  return new CreateCompartmentUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgCompartmentWriter(),
    { generate: () => candidate },
  );
}

function retireStorageLocationUseCase(database: PgDatabase): RetireStorageLocationUseCase {
  return new RetireStorageLocationUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgStorageLocationRetirer(),
  );
}

test('storage administrator creates same-Household Compartment and preserves nullable kind', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('a7d62121-0b04-4d21-8b04-000000000021');
  const candidate = CompartmentId('a7d62222-0b04-4d22-8b04-000000000022');
  try {
    const result = await createCompartmentUseCase(database, candidate).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: PARENT,
      kindCode: null,
      displayName: 'Upper shelf',
      sortOrder: 5,
    });
    assert.equal(result.compartmentId, candidate);

    const observed = await adminPool.query<{
      household_id: string;
      storage_location_id: string;
      kind_code: string | null;
      display_name: string;
      lifecycle_status: string;
      actor_user_id: string;
      candidate_compartment_id: string;
      intent_code: string;
    }>(
      `select c.household_id::text,
              c.storage_location_id::text,
              c.kind_code,
              c.display_name,
              c.lifecycle_status,
              cmd.actor_user_id::text,
              cmd.candidate_compartment_id::text,
              r.intent_code
         from fridge.compartment c
         join fridge.compartment_create_command cmd on cmd.result_compartment_id = c.compartment_id
         join fridge.storage_topology_command_registry r
           on r.household_id = cmd.household_id and r.command_id = cmd.command_id
        where c.compartment_id = $1::uuid`,
      [candidate],
    );
    assert.deepEqual(observed.rows[0], {
      household_id: HOUSEHOLD,
      storage_location_id: PARENT,
      kind_code: null,
      display_name: 'Upper shelf',
      lifecycle_status: 'ACTIVE',
      actor_user_id: ADMIN,
      candidate_compartment_id: candidate,
      intent_code: 'CREATE_COMPARTMENT',
    });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('active optional kind is accepted and inactive kind is rejected without durable command', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const accepted = CompartmentId('a7d63232-0b04-4d32-8b04-000000000032');
    await createCompartmentUseCase(database, accepted).execute({
      commandId: CommandId('a7d63131-0b04-4d31-8b04-000000000031'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: SECOND_PARENT,
      kindCode: ACTIVE_KIND,
      displayName: 'Drawer',
      sortOrder: null,
    });

    const rejectedCommand = CommandId('a7d63333-0b04-4d33-8b04-000000000033');
    const rejectedCandidate = CompartmentId('a7d63434-0b04-4d34-8b04-000000000034');
    await assert.rejects(
      createCompartmentUseCase(database, rejectedCandidate).execute({
        commandId: rejectedCommand,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: SECOND_PARENT,
        kindCode: RETIRED_KIND,
        displayName: 'Invalid drawer',
        sortOrder: null,
      }),
      InvalidInputError,
    );

    const count = await adminPool.query<{ commands: string; compartments: string }>(
      `select
         (select count(*) from fridge.compartment_create_command where household_id = $1::uuid and command_id = $2::uuid)::text as commands,
         (select count(*) from fridge.compartment where compartment_id = $3::uuid)::text as compartments`,
      [HOUSEHOLD, rejectedCommand, rejectedCandidate],
    );
    assert.deepEqual(count.rows[0], { commands: '0', compartments: '0' });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('lost-response replay returns first committed Compartment and does not allocate retry candidate', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('a7d64141-0b04-4d41-8b04-000000000041');
  const firstCandidate = CompartmentId('a7d64242-0b04-4d42-8b04-000000000042');
  const retryCandidate = CompartmentId('a7d64343-0b04-4d43-8b04-000000000043');
  const input = {
    commandId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    storageLocationId: SECOND_PARENT,
    kindCode: null,
    displayName: 'Replay shelf',
    sortOrder: 8,
  } as const;
  try {
    const first = await createCompartmentUseCase(database, firstCandidate).execute(input);
    const replay = await createCompartmentUseCase(database, retryCandidate).execute(input);
    assert.equal(first.compartmentId, firstCandidate);
    assert.equal(replay.compartmentId, firstCandidate);
    const count = await adminPool.query<{ retry_count: string }>(
      `select count(*)::text as retry_count from fridge.compartment where compartment_id = $1::uuid`,
      [retryCandidate],
    );
    assert.equal(count.rows[0]?.retry_count, '0');
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('CommandId binds immutable parent and cross-intent reuse is rejected', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('a7d65151-0b04-4d51-8b04-000000000051');
  try {
    await createCompartmentUseCase(database, CompartmentId('a7d65252-0b04-4d52-8b04-000000000052')).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: SECOND_PARENT,
      kindCode: null,
      displayName: 'Bound parent shelf',
      sortOrder: null,
    });
    await assert.rejects(
      createCompartmentUseCase(database, CompartmentId('a7d65353-0b04-4d53-8b04-000000000053')).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: PARENT,
        kindCode: null,
        displayName: 'Bound parent shelf',
        sortOrder: null,
      }),
      IdempotencyConflictError,
    );

    const crossIntent = CommandId('a7d65454-0b04-4d54-8b04-000000000054');
    await new CreateStorageLocationUseCase(
      new PgHouseholdStorageAdministrationTransactionManager(database),
      new PgStorageLocationWriter(),
      { generate: () => StorageLocationId('a7d65555-0b04-4d55-8b04-000000000055') },
    ).execute({
      commandId: crossIntent,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      kindCode: STORAGE_KIND,
      displayName: 'Registry location',
      sortOrder: null,
    });

    await assert.rejects(
      createCompartmentUseCase(database, CompartmentId('a7d65656-0b04-4d56-8b04-000000000056')).execute({
        commandId: crossIntent,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: SECOND_PARENT,
        kindCode: null,
        displayName: 'Registry collision',
        sortOrder: null,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('missing, foreign or retired parent is nondisclosure-safe NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const cases = [
    {
      target: RETIRED_PARENT,
      candidate: CompartmentId('a7d66262-0b04-4d62-8b04-000000000062'),
      command: CommandId('a7d66565-0b04-4d65-8b04-000000000065'),
    },
    {
      target: FOREIGN_PARENT,
      candidate: CompartmentId('a7d66363-0b04-4d63-8b04-000000000063'),
      command: CommandId('a7d66666-0b04-4d66-8b04-000000000066'),
    },
    {
      target: StorageLocationId('a7d66161-0b04-4d61-8b04-000000000061'),
      candidate: CompartmentId('a7d66464-0b04-4d64-8b04-000000000064'),
      command: CommandId('a7d66767-0b04-4d67-8b04-000000000067'),
    },
  ];
  try {
    for (const entry of cases) {
      await assert.rejects(
        createCompartmentUseCase(database, entry.candidate).execute({
          commandId: entry.command,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          storageLocationId: entry.target,
          kindCode: null,
          displayName: 'Hidden parent child',
          sortOrder: null,
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('ordinary member cannot create Compartment', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      createCompartmentUseCase(database, CompartmentId('a7d67171-0b04-4d71-8b04-000000000071')).execute({
        commandId: CommandId('a7d67272-0b04-4d72-8b04-000000000072'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        storageLocationId: SECOND_PARENT,
        kindCode: null,
        displayName: 'Forbidden child',
        sortOrder: null,
      }),
      (error: unknown) => (error as { code?: string }).code === 'HOUSEHOLD_UNAUTHORIZED',
    );
  } finally {
    await database.close();
  }
});

test('concurrent CreateCompartment and RetireStorageLocation cannot both commit against one current parent', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 2 });
  try {
    const results = await Promise.allSettled([
      createCompartmentUseCase(database, CompartmentId('a7d68181-0b04-4d81-8b04-000000000081')).execute({
        commandId: CommandId('a7d68282-0b04-4d82-8b04-000000000082'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: RACE_PARENT,
        kindCode: null,
        displayName: 'Race child',
        sortOrder: null,
      }),
      retireStorageLocationUseCase(database).execute({
        commandId: CommandId('a7d68383-0b04-4d83-8b04-000000000083'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: RACE_PARENT,
      }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected');
    assert.ok(rejected.reason instanceof ConflictError || rejected.reason instanceof NotFoundError);
  } finally {
    await database.close();
  }
});

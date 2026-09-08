import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ChangeCompartmentMetadataUseCase,
  CommandId,
  CompartmentId,
  ConflictError,
  HouseholdId,
  IdempotencyConflictError,
  NotFoundError,
  PrincipalId,
  RetireCompartmentUseCase,
  StorageLocationId,
} from '@fridge/application';
import { PgCompartmentMetadataChanger } from './change-compartment-metadata.js';
import { PgDatabase } from './index.js';
import { PgCompartmentRetirer } from './retire-compartment.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for RetireCompartment tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for RetireCompartment tests');

const HOUSEHOLD = HouseholdId('e6c70101-0b04-4f01-8b04-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('e6c70202-0b04-4f02-8b04-000000000002');
const ADMIN = PrincipalId('e6c70303-0b04-4f03-8b04-000000000003');
const ORDINARY = PrincipalId('e6c70404-0b04-4f04-8b04-000000000004');
const ADMIN_MEMBERSHIP = 'e6c70505-0b04-4f05-8b04-000000000005';
const ORDINARY_MEMBERSHIP = 'e6c70606-0b04-4f06-8b04-000000000006';
const STORAGE_KIND = 'BE04_RC_STORAGE';
const COMPARTMENT_KIND = 'BE04_RC_SHELF';
const PRODUCT = 'e6c70707-0b04-4f07-8b04-000000000007';
const PARENT = StorageLocationId('e6c71111-0b04-4f11-8b04-000000000011');
const RETIRED_PARENT = StorageLocationId('e6c71212-0b04-4f12-8b04-000000000012');
const FOREIGN_PARENT = StorageLocationId('e6c71313-0b04-4f13-8b04-000000000013');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 RetireCompartment Admin'), ($2::uuid, 'BE04 RetireCompartment Member')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 RetireCompartment Household'), ($2::uuid, 'BE04 RetireCompartment Foreign')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_RC_ADMIN', 'BE04 RetireCompartment admin'),
              ('BE04_RC_MEMBER', 'BE04 RetireCompartment member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_RC_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_RC_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_RC_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 RetireCompartment storage', 'ACTIVE')`,
      [STORAGE_KIND],
    );
    await pool.query(
      `insert into fridge.compartment_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 RetireCompartment shelf', 'ACTIVE')`,
      [COMPARTMENT_KIND],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', null, 'BE04 RetireCompartment stock fixture', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, created_at, retired_at
       ) values
         ($1::uuid, $4::uuid, $6, 'Current parent', 'ACTIVE', clock_timestamp() - interval '2 hours', null),
         ($2::uuid, $4::uuid, $6, 'Retired parent', 'RETIRED', clock_timestamp() - interval '3 hours', clock_timestamp() - interval '1 hour'),
         ($3::uuid, $5::uuid, $6, 'Foreign parent', 'ACTIVE', clock_timestamp() - interval '2 hours', null)`,
      [PARENT, RETIRED_PARENT, FOREIGN_PARENT, HOUSEHOLD, FOREIGN_HOUSEHOLD, STORAGE_KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

async function seedCompartment(
  pool: Pool,
  id: CompartmentId,
  parent: StorageLocationId = PARENT,
  household: HouseholdId = HOUSEHOLD,
  lifecycleStatus = 'ACTIVE',
): Promise<void> {
  await pool.query(
    `insert into fridge.compartment (
       compartment_id, household_id, storage_location_id, kind_code, display_name,
       lifecycle_status, created_at, retired_at
     ) values (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
       clock_timestamp() - interval '1 hour',
       case when $6 = 'RETIRED' then clock_timestamp() - interval '1 minute' else null end
     )`,
    [id, household, parent, COMPARTMENT_KIND, `Compartment ${id}`, lifecycleStatus],
  );
}

function retireUseCase(database: PgDatabase): RetireCompartmentUseCase {
  return new RetireCompartmentUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgCompartmentRetirer(),
  );
}

function changeUseCase(database: PgDatabase): ChangeCompartmentMetadataUseCase {
  return new ChangeCompartmentMetadataUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgCompartmentMetadataChanger(),
  );
}

test('governed Compartment retirement preserves parent and records post-lock actor provenance', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const target = CompartmentId('e6c72121-0b04-4f21-8b04-000000000021');
  const command = CommandId('e6c72222-0b04-4f22-8b04-000000000022');
  try {
    await seedCompartment(admin, target);
    const result = await retireUseCase(database).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      compartmentId: target,
    });
    assert.equal(result.compartmentId, target);

    const observed = await admin.query<{
      lifecycle_status: string;
      retired: boolean;
      same_retired_at: boolean;
      storage_location_id: string;
      parent_lifecycle: string;
      actor_user_id: string;
      intent_code: string;
    }>(
      `select c.lifecycle_status,
              c.retired_at is not null as retired,
              c.retired_at = cmd.retired_at as same_retired_at,
              c.storage_location_id::text,
              sl.lifecycle_status as parent_lifecycle,
              cmd.actor_user_id::text,
              r.intent_code
         from fridge.compartment c
         join fridge.storage_location sl
           on sl.household_id = c.household_id and sl.storage_location_id = c.storage_location_id
         join fridge.compartment_retire_command cmd
           on cmd.household_id = c.household_id and cmd.compartment_id = c.compartment_id
         join fridge.storage_topology_command_registry r
           on r.household_id = cmd.household_id and r.command_id = cmd.command_id
        where c.compartment_id = $1::uuid and cmd.command_id = $2::uuid`,
      [target, command],
    );
    assert.deepEqual(observed.rows[0], {
      lifecycle_status: 'RETIRED',
      retired: true,
      same_retired_at: true,
      storage_location_id: PARENT,
      parent_lifecycle: 'ACTIVE',
      actor_user_id: ADMIN,
      intent_code: 'RETIRE_COMPARTMENT',
    });
  } finally {
    await admin.end();
    await database.close();
  }
});

test('committed replay succeeds without restoring later Compartment state', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const target = CompartmentId('e6c73131-0b04-4f31-8b04-000000000031');
  const command = CommandId('e6c73232-0b04-4f32-8b04-000000000032');
  const input = { commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, compartmentId: target } as const;
  try {
    await seedCompartment(admin, target);
    await retireUseCase(database).execute(input);
    await admin.query(
      `update fridge.compartment set display_name = 'Later historical marker' where compartment_id = $1::uuid`,
      [target],
    );
    const replay = await retireUseCase(database).execute(input);
    assert.equal(replay.compartmentId, target);
    const observed = await admin.query<{ display_name: string; lifecycle_status: string }>(
      `select display_name, lifecycle_status from fridge.compartment where compartment_id = $1::uuid`,
      [target],
    );
    assert.deepEqual(observed.rows[0], {
      display_name: 'Later historical marker',
      lifecycle_status: 'RETIRED',
    });
  } finally {
    await admin.end();
    await database.close();
  }
});

test('current stock anchored to the Compartment blocks retirement without cascade or relocation', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const target = CompartmentId('e6c74141-0b04-4f41-8b04-000000000041');
  const stock = 'e6c74242-0b04-4f42-8b04-000000000042';
  try {
    await seedCompartment(admin, target);
    await admin.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status,
         placement_anchor_kind, storage_location_id, compartment_id
       ) values ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', 'COMPARTMENT', null, $4::uuid)`,
      [stock, HOUSEHOLD, PRODUCT, target],
    );

    await assert.rejects(
      retireUseCase(database).execute({
        commandId: CommandId('e6c74343-0b04-4f43-8b04-000000000043'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        compartmentId: target,
      }),
      ConflictError,
    );

    const observed = await admin.query<{
      compartment_lifecycle: string;
      stock_lifecycle: string;
      stock_compartment_id: string;
    }>(
      `select c.lifecycle_status as compartment_lifecycle,
              si.lifecycle_status as stock_lifecycle,
              si.compartment_id::text as stock_compartment_id
         from fridge.compartment c
         join fridge.stock_item si on si.compartment_id = c.compartment_id
        where c.compartment_id = $1::uuid`,
      [target],
    );
    assert.deepEqual(observed.rows[0], {
      compartment_lifecycle: 'ACTIVE',
      stock_lifecycle: 'ACTIVE',
      stock_compartment_id: target,
    });
  } finally {
    await admin.end();
    await database.close();
  }
});

test('retired stock is historical and does not block current Compartment retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const target = CompartmentId('e6c75151-0b04-4f51-8b04-000000000051');
  try {
    await seedCompartment(admin, target);
    await admin.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status,
         placement_anchor_kind, storage_location_id, compartment_id,
         created_at, retired_at
       ) values (
         'e6c75252-0b04-4f52-8b04-000000000052'::uuid,
         $1::uuid, $2::uuid, 'RETIRED', 'COMPARTMENT', null, $3::uuid,
         clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour'
       )`,
      [HOUSEHOLD, PRODUCT, target],
    );
    const result = await retireUseCase(database).execute({
      commandId: CommandId('e6c75353-0b04-4f53-8b04-000000000053'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      compartmentId: target,
    });
    assert.equal(result.compartmentId, target);
  } finally {
    await admin.end();
    await database.close();
  }
});

test('hidden Compartment states collapse to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const retired = CompartmentId('e6c76161-0b04-4f61-8b04-000000000061');
  const underRetiredParent = CompartmentId('e6c76262-0b04-4f62-8b04-000000000062');
  const foreign = CompartmentId('e6c76363-0b04-4f63-8b04-000000000063');
  const missing = CompartmentId('e6c76464-0b04-4f64-8b04-000000000064');
  const commands = [
    CommandId('e6c76565-0b04-4f65-8b04-000000000065'),
    CommandId('e6c76666-0b04-4f66-8b04-000000000066'),
    CommandId('e6c76767-0b04-4f67-8b04-000000000067'),
    CommandId('e6c76868-0b04-4f68-8b04-000000000068'),
  ];
  try {
    await seedCompartment(admin, retired, PARENT, HOUSEHOLD, 'RETIRED');
    await seedCompartment(admin, underRetiredParent, RETIRED_PARENT);
    await seedCompartment(admin, foreign, FOREIGN_PARENT, FOREIGN_HOUSEHOLD);
    const targets = [retired, underRetiredParent, foreign, missing];
    for (let index = 0; index < targets.length; index += 1) {
      await assert.rejects(
        retireUseCase(database).execute({
          commandId: commands[index]!,
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          compartmentId: targets[index]!,
        }),
        NotFoundError,
      );
    }
  } finally {
    await admin.end();
    await database.close();
  }
});

test('same CommandId cannot cross from ChangeCompartmentMetadata to RetireCompartment', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const target = CompartmentId('e6c77171-0b04-4f71-8b04-000000000071');
  const command = CommandId('e6c77272-0b04-4f72-8b04-000000000072');
  try {
    await seedCompartment(admin, target);
    await changeUseCase(database).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      compartmentId: target,
      kindCode: null,
      displayName: 'Registry seed',
      sortOrder: null,
    });
    await assert.rejects(
      retireUseCase(database).execute({
        commandId: command,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        compartmentId: target,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await admin.end();
    await database.close();
  }
});

test('ordinary member is denied and identical concurrent retries converge', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 2 });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const denied = CompartmentId('e6c78181-0b04-4f81-8b04-000000000081');
  const concurrent = CompartmentId('e6c78282-0b04-4f82-8b04-000000000082');
  const command = CommandId('e6c78383-0b04-4f83-8b04-000000000083');
  try {
    await seedCompartment(admin, denied);
    await seedCompartment(admin, concurrent);
    await assert.rejects(
      retireUseCase(database).execute({
        commandId: CommandId('e6c78484-0b04-4f84-8b04-000000000084'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        compartmentId: denied,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'HOUSEHOLD_UNAUTHORIZED');
        return true;
      },
    );

    const input = { commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, compartmentId: concurrent } as const;
    const [left, right] = await Promise.all([
      retireUseCase(database).execute(input),
      retireUseCase(database).execute(input),
    ]);
    assert.equal(left.compartmentId, concurrent);
    assert.equal(right.compartmentId, concurrent);

    const count = await admin.query<{ commands: string }>(
      `select count(*)::text as commands
         from fridge.compartment_retire_command
        where household_id = $1::uuid and command_id = $2::uuid`,
      [HOUSEHOLD, command],
    );
    assert.equal(count.rows[0]?.commands, '1');
  } finally {
    await admin.end();
    await database.close();
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  DependencyUnavailableError,
  HOUSEHOLD_MEMBERSHIP_ADMINISTRATION_CAPABILITY,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  type HouseholdId as HouseholdIdType,
  type PrincipalId as PrincipalIdType,
} from '@fridge/application';
import {
  ExternalIdentityMappingError,
  HouseholdAuthorizationError,
  PgDatabase,
  PgExternalIdentityPrincipalMapper,
  PgHouseholdProfileReader,
  requirePgClient,
} from './index.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
const HOUSEHOLD_A = HouseholdId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const HOUSEHOLD_B = HouseholdId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const PRINCIPAL_A = PrincipalId('11111111-1111-4111-8111-111111111111');
const PRINCIPAL_B = PrincipalId('22222222-2222-4222-8222-222222222222');
const PRINCIPAL_BE03_ADMIN = PrincipalId('33333333-3333-4333-8333-333333333333');
const MEMBERSHIP_A = HouseholdMembershipId('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
const MEMBERSHIP_BE03_ADMIN = HouseholdMembershipId('33333333-aaaa-4333-8333-333333333333');

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for database integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for database concurrency integration tests');
}

async function visibleHouseholds(
  database: PgDatabase,
  principalId: PrincipalIdType,
  householdId: HouseholdIdType,
): Promise<string[]> {
  return database.withAuthorizedHouseholdTransaction(
    principalId,
    householdId,
    async (transaction) => {
      const client = requirePgClient(transaction);
      const result = await client.query<{ household_id: string }>(
        'select household_id::text from fridge.household order by household_id',
      );
      return result.rows.map((row) => row.household_id);
    },
  );
}

test('runtime capability without Household context fails closed', async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query('set local role fridge_app');
    const result = await client.query<{ count: string }>(
      'select count(*)::text as count from fridge.household',
    );
    assert.equal(result.rows[0]?.count, '0');
    await client.query('rollback');
  } finally {
    client.release();
    await pool.end();
  }
});

test('verified external identity maps to exactly one platform PrincipalId', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const mapper = new PgExternalIdentityPrincipalMapper(database);

  try {
    assert.equal(
      await mapper.resolve({
        authority: 'https://issuer-a.example.test',
        subject: 'shared-subject',
      }),
      PRINCIPAL_A,
    );
  } finally {
    await database.close();
  }
});

test('external identity authority scopes equal provider subject strings', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const mapper = new PgExternalIdentityPrincipalMapper(database);

  try {
    assert.equal(
      await mapper.resolve({
        authority: 'https://issuer-b.example.test',
        subject: 'shared-subject',
      }),
      PRINCIPAL_B,
    );
  } finally {
    await database.close();
  }
});

test('unknown or revoked external identity fails closed without guessing a principal', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const mapper = new PgExternalIdentityPrincipalMapper(database);

  try {
    await assert.rejects(
      mapper.resolve({
        authority: 'https://issuer-a.example.test',
        subject: 'unknown-subject',
      }),
      ExternalIdentityMappingError,
    );
    await assert.rejects(
      mapper.resolve({
        authority: 'https://issuer-a.example.test',
        subject: 'revoked-subject',
      }),
      ExternalIdentityMappingError,
    );
  } finally {
    await database.close();
  }
});

test('external identity lookup rejects whitespace confusion and unbounded values', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    await assert.rejects(
      database.resolvePrincipalForExternalIdentity(
        ' https://issuer-a.example.test',
        'shared-subject',
      ),
      /surrounding whitespace/,
    );
    await assert.rejects(
      database.resolvePrincipalForExternalIdentity(
        'https://issuer-a.example.test',
        'shared-subject ',
      ),
      /surrounding whitespace/,
    );
    await assert.rejects(
      database.resolvePrincipalForExternalIdentity('a'.repeat(513), 'subject'),
      /maximum length/,
    );
    await assert.rejects(
      database.resolvePrincipalForExternalIdentity('authority', 's'.repeat(1025)),
      /maximum length/,
    );
  } finally {
    await database.close();
  }
});

test('external identity mapping preserves dependency-unavailable semantics', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const mapper = new PgExternalIdentityPrincipalMapper(database);

  await database.close();

  await assert.rejects(
    mapper.resolve({
      authority: 'https://issuer-a.example.test',
      subject: 'shared-subject',
    }),
    (error: unknown) => {
      assert.ok(error instanceof DependencyUnavailableError);
      assert.equal(error.message, 'required dependency is unavailable');
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test('authenticated principal still requires current Household authorization', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const mapper = new PgExternalIdentityPrincipalMapper(database);
  let callbackRan = false;

  try {
    const principal = await mapper.resolve({
      authority: 'https://issuer-a.example.test',
      subject: 'shared-subject',
    });
    assert.equal(principal, PRINCIPAL_A);

    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        principal,
        HOUSEHOLD_B,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
  } finally {
    await database.close();
  }
});

test('authorized membership installs tenant context without leaking across reuse', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });

  try {
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_A, HOUSEHOLD_A), [HOUSEHOLD_A]);
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_B, HOUSEHOLD_B), [HOUSEHOLD_B]);
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_A, HOUSEHOLD_A), [HOUSEHOLD_A]);
  } finally {
    await database.close();
  }
});

test('candidate Household context never reaches tenant work without current membership', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });
  let callbackRan = false;

  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        PRINCIPAL_A,
        HOUSEHOLD_B,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
    assert.deepEqual(await visibleHouseholds(database, PRINCIPAL_A, HOUSEHOLD_A), [HOUSEHOLD_A]);
  } finally {
    await database.close();
  }
});

test('authorization context exposes verified principal Household membership and role', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    const context = await database.withAuthorizedHouseholdTransaction(
      PRINCIPAL_A,
      HOUSEHOLD_A,
      async (transaction) => ({
        principalId: transaction.principalId,
        householdId: transaction.householdId,
        membershipId: transaction.membershipId,
        householdRoleCode: transaction.householdRoleCode,
      }),
    );
    assert.deepEqual(context, {
      principalId: PRINCIPAL_A,
      householdId: HOUSEHOLD_A,
      membershipId: MEMBERSHIP_A,
      householdRoleCode: 'MEMBER',
    });
  } finally {
    await database.close();
  }
});

test('governed role capability upgrades current authority to membership administration', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    const authority = await database.withHouseholdMembershipAdministrationTransaction(
      PRINCIPAL_BE03_ADMIN,
      HOUSEHOLD_A,
      async (transaction) => ({
        principalId: transaction.principalId,
        householdId: transaction.householdId,
        householdRoleCode: transaction.householdRoleCode,
        capability: transaction.membershipAdministrationCapability,
      }),
    );

    assert.deepEqual(authority, {
      principalId: PRINCIPAL_BE03_ADMIN,
      householdId: HOUSEHOLD_A,
      householdRoleCode: 'BE03_ADMIN',
      capability: HOUSEHOLD_MEMBERSHIP_ADMINISTRATION_CAPABILITY,
    });
  } finally {
    await database.close();
  }
});

test('membership administration authority locks the actor membership against concurrent revocation', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
    maxConnections: 1,
  });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  let markAuthorityReady!: () => void;
  let releaseAuthority!: () => void;
  const authorityReady = new Promise<void>((resolve) => {
    markAuthorityReady = resolve;
  });
  const authorityRelease = new Promise<void>((resolve) => {
    releaseAuthority = resolve;
  });

  const authorityOperation = database.withHouseholdMembershipAdministrationTransaction(
    PRINCIPAL_BE03_ADMIN,
    HOUSEHOLD_A,
    async () => {
      markAuthorityReady();
      await authorityRelease;
    },
  );

  await authorityReady;
  const adminClient = await adminPool.connect();

  try {
    await adminClient.query('begin');
    await adminClient.query("set local lock_timeout = '200ms'");
    await assert.rejects(
      adminClient.query(
        `update fridge.household_membership
            set effective_to = clock_timestamp()
          where membership_id = $1::uuid`,
        [MEMBERSHIP_BE03_ADMIN],
      ),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, '55P03');
        return true;
      },
    );
    await adminClient.query('rollback');
  } finally {
    releaseAuthority();
    await authorityOperation;
    adminClient.release();
    await adminPool.end();
    await database.close();
  }
});

test('current Household membership without governed capability cannot administer members', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  let callbackRan = false;

  try {
    await assert.rejects(
      database.withHouseholdMembershipAdministrationTransaction(
        PRINCIPAL_A,
        HOUSEHOLD_A,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
  } finally {
    await database.close();
  }
});

test('membership administration still requires current membership in the requested Household', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  let callbackRan = false;

  try {
    await assert.rejects(
      database.withHouseholdMembershipAdministrationTransaction(
        PRINCIPAL_BE03_ADMIN,
        HOUSEHOLD_B,
        async () => {
          callbackRan = true;
        },
      ),
      HouseholdAuthorizationError,
    );
    assert.equal(callbackRan, false);
  } finally {
    await database.close();
  }
});

test('intent-specific Household profile reader executes only with a verified transaction capability', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });
  const reader = new PgHouseholdProfileReader();

  try {
    const displayName = await database.withAuthorizedHouseholdTransaction(
      PRINCIPAL_A,
      HOUSEHOLD_A,
      (transaction) => reader.readDisplayName(transaction),
    );
    assert.equal(typeof displayName, 'string');
    assert.ok((displayName ?? '').length > 0);
  } finally {
    await database.close();
  }
});

test('PgDatabase rejects forged malformed authorization identifiers before tenant work', async () => {
  const database = new PgDatabase({
    connectionString: DATABASE_URL,
    capabilityRole: 'fridge_app',
  });

  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        'not-a-uuid' as PrincipalIdType,
        HOUSEHOLD_A,
        async () => undefined,
      ),
      /Invalid PrincipalId/,
    );
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(
        PRINCIPAL_A,
        'not-a-uuid' as HouseholdIdType,
        async () => undefined,
      ),
      /Invalid HouseholdId/,
    );
  } finally {
    await database.close();
  }
});

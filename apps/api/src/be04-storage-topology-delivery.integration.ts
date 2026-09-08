import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Pool } from 'pg';
import {
  AddHouseholdMemberUseCase,
  ChangeCompartmentMetadataUseCase,
  ChangeStorageLocationMetadataUseCase,
  CompartmentId,
  CreateCompartmentUseCase,
  CreateStorageLocationUseCase,
  GetCurrentCompartmentUseCase,
  GetCurrentStorageLocationUseCase,
  HouseholdMembershipId,
  ListCurrentCompartmentsUseCase,
  ListCurrentStorageLocationsUseCase,
  PrincipalId,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
  RetireCompartmentUseCase,
  RetireStorageLocationUseCase,
  StorageLocationId,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgCompartmentMetadataChanger } from '@fridge/database/change-compartment-metadata';
import { PgStorageLocationMetadataChanger } from '@fridge/database/change-storage-location-metadata';
import { PgCompartmentWriter } from '@fridge/database/compartment';
import { PgCurrentCompartmentReader } from '@fridge/database/compartment-read';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import { PgCompartmentRetirer } from '@fridge/database/retire-compartment';
import { PgStorageLocationRetirer } from '@fridge/database/retire-storage-location';
import { PgHouseholdStorageAdministrationTransactionManager } from '@fridge/database/storage-administration';
import { PgStorageLocationWriter } from '@fridge/database/storage-location';
import { PgCurrentStorageLocationReader } from '@fridge/database/storage-location-read';
import {
  BearerAuthenticatedPrincipalResolver,
  type PlatformPrincipalMapper,
} from './auth.js';
import { JwtJwksAuthenticationEvidenceVerifier } from './jwt-jwks-verifier.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
const adminDatabaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('BE00_TEST_DATABASE_URL is required for BE-04 delivery integration tests');
if (!adminDatabaseUrl) throw new Error('DATABASE_URL is required for BE-04 delivery integration tests');

const issuer = 'https://be04-issuer.example.test';
const audience = 'fridge-api';
const nowMs = Date.UTC(2026, 8, 8, 15, 0, 0);
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = {
  ...keyPair.publicKey.export({ format: 'jwk' }),
  kid: 'be04-delivery-key',
  alg: 'ES256',
  use: 'sig',
  key_ops: ['verify'],
};

const HOUSEHOLD = 'b4000000-0000-4000-8000-000000000001';
const FOREIGN_HOUSEHOLD = 'b4000000-0000-4000-8000-000000000002';
const ADMIN = PrincipalId('b4000000-0000-4000-8000-000000000101');
const ORDINARY = PrincipalId('b4000000-0000-4000-8000-000000000102');
const ADMIN_MEMBERSHIP = 'b4000000-0000-4000-8000-000000000201';
const ORDINARY_MEMBERSHIP = 'b4000000-0000-4000-8000-000000000202';
const STORAGE_KIND = 'BE04_HTTP_FRIDGE';
const COMPARTMENT_KIND = 'BE04_HTTP_SHELF';
const FOREIGN_LOCATION = 'b4000000-0000-4000-8000-000000000301';
const FIRST_STORAGE_LOCATION = StorageLocationId('b4000000-0000-4000-8000-000000000401');
const SECOND_STORAGE_CANDIDATE = StorageLocationId('b4000000-0000-4000-8000-000000000402');
const THIRD_STORAGE_CANDIDATE = StorageLocationId('b4000000-0000-4000-8000-000000000403');
const FIRST_COMPARTMENT = CompartmentId('b4000000-0000-4000-8000-000000000501');
const SECOND_COMPARTMENT_CANDIDATE = CompartmentId('b4000000-0000-4000-8000-000000000502');
const ADMIN_SUBJECT = 'be04-storage-admin-subject';
const ORDINARY_SUBJECT = 'be04-ordinary-subject';

const config: RuntimeConfig = {
  nodeEnv: 'test',
  databaseUrl,
  databaseCapabilityRole: 'fridge_app',
  httpHost: '127.0.0.1',
  httpPort: 3000,
  logLevel: 'fatal',
  shutdownTimeoutMs: 1_000,
  authentication: Object.freeze({
    issuer,
    audience,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
    algorithms: Object.freeze(['ES256'] as const),
  }),
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function issueToken(subject: string): string {
  const header = encodeJson({ alg: 'ES256', typ: 'JWT', kid: 'be04-delivery-key' });
  const payload = encodeJson({
    iss: issuer,
    sub: subject,
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 300,
    role: 'provider-super-admin',
    household_id: FOREIGN_HOUSEHOLD,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' },
  );
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 HTTP Admin'), ($2::uuid, 'BE04 HTTP Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 HTTP Household'), ($2::uuid, 'BE04 HTTP Foreign')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_HTTP_STORAGE_ADMIN', 'BE04 HTTP storage administrator'),
              ('BE04_HTTP_ORDINARY', 'BE04 HTTP ordinary member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_HTTP_STORAGE_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_HTTP_STORAGE_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_HTTP_ORDINARY', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 HTTP fridge', 'ACTIVE')`,
      [STORAGE_KIND],
    );
    await pool.query(
      `insert into fridge.compartment_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 HTTP shelf', 'ACTIVE')`,
      [COMPARTMENT_KIND],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name, lifecycle_status
       ) values ($1::uuid, $2::uuid, $3, 'Foreign topology target', 'ACTIVE')`,
      [FOREIGN_LOCATION, FOREIGN_HOUSEHOLD, STORAGE_KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function buildIntegrationServer(database: PgDatabase) {
  const verifier = new JwtJwksAuthenticationEvidenceVerifier({
    trust: config.authentication!,
    now: () => nowMs,
    fetch: async () => new Response(
      JSON.stringify({ keys: [publicJwk] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  });
  const principalMapper: PlatformPrincipalMapper = {
    async resolve(identity) {
      if (identity.authority !== issuer) throw new Error('unexpected identity authority');
      if (identity.subject === ADMIN_SUBJECT) return ADMIN;
      if (identity.subject === ORDINARY_SUBJECT) return ORDINARY;
      throw new Error('unexpected identity subject');
    },
  };
  const authenticatedPrincipal = new BearerAuthenticatedPrincipalResolver(verifier, principalMapper);
  const readAuthorizedHouseholdContext = new ReadAuthorizedHouseholdContext(
    database,
    new PgHouseholdProfileReader(),
  );
  const readCurrentHouseholdMembers = new ReadCurrentHouseholdMembersUseCase(
    database,
    new PgCurrentHouseholdMembershipReader(),
  );
  const addHouseholdMember = new AddHouseholdMemberUseCase(
    database,
    database,
    { generate: () => HouseholdMembershipId('b4000000-0000-4000-8000-000000000901') },
  );

  const storageAdministration = new PgHouseholdStorageAdministrationTransactionManager(database);
  const currentStorageLocations = new PgCurrentStorageLocationReader();
  const currentCompartments = new PgCurrentCompartmentReader();
  const storageCandidates = [FIRST_STORAGE_LOCATION, SECOND_STORAGE_CANDIDATE, THIRD_STORAGE_CANDIDATE];
  const compartmentCandidates = [FIRST_COMPARTMENT, SECOND_COMPARTMENT_CANDIDATE];
  let storageCandidateIndex = 0;
  let compartmentCandidateIndex = 0;

  return buildApiServer({
    config,
    readiness: database,
    authenticatedPrincipal,
    readAuthorizedHouseholdContext,
    readCurrentHouseholdMembers,
    addHouseholdMember,
    storageTopology: {
      listCurrentStorageLocations: new ListCurrentStorageLocationsUseCase(database, currentStorageLocations),
      getCurrentStorageLocation: new GetCurrentStorageLocationUseCase(database, currentStorageLocations),
      createStorageLocation: new CreateStorageLocationUseCase(
        storageAdministration,
        new PgStorageLocationWriter(),
        {
          generate() {
            const candidate = storageCandidates[storageCandidateIndex++];
            if (candidate === undefined) throw new Error('unexpected StorageLocation candidate exhaustion');
            return candidate;
          },
        },
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
        {
          generate() {
            const candidate = compartmentCandidates[compartmentCandidateIndex++];
            if (candidate === undefined) throw new Error('unexpected Compartment candidate exhaustion');
            return candidate;
          },
        },
      ),
      changeCompartmentMetadata: new ChangeCompartmentMetadataUseCase(
        storageAdministration,
        new PgCompartmentMetadataChanger(),
      ),
      retireCompartment: new RetireCompartmentUseCase(
        storageAdministration,
        new PgCompartmentRetirer(),
      ),
    },
  });
}

test('B4-030 authenticated HTTP delivery crosses identity, Household authority, storage capability and durable topology mutation', async () => {
  const database = new PgDatabase({ connectionString: databaseUrl, capabilityRole: 'fridge_app', maxConnections: 4 });
  const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  const server = buildIntegrationServer(database);

  const adminToken = issueToken(ADMIN_SUBJECT);
  const ordinaryToken = issueToken(ORDINARY_SUBJECT);
  const storageCreateCommand = 'b4000000-0000-4000-8000-000000001001';
  const storageChangeCommand = 'b4000000-0000-4000-8000-000000001002';
  const compartmentCreateCommand = 'b4000000-0000-4000-8000-000000001003';
  const compartmentChangeCommand = 'b4000000-0000-4000-8000-000000001004';
  const compartmentRetireCommand = 'b4000000-0000-4000-8000-000000001005';
  const storageRetireCommand = 'b4000000-0000-4000-8000-000000001006';

  try {
    const createStorage = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-principal-id': String(ORDINARY),
      },
      payload: {
        commandId: storageCreateCommand,
        kindCode: STORAGE_KIND,
        displayName: 'Kitchen Fridge',
        sortOrder: 10,
      },
    });
    assert.equal(createStorage.statusCode, 201);
    assert.deepEqual(createStorage.json(), { storageLocationId: String(FIRST_STORAGE_LOCATION) });

    const replayStorage = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: storageCreateCommand,
        kindCode: STORAGE_KIND,
        displayName: 'Kitchen Fridge',
        sortOrder: 10,
      },
    });
    assert.equal(replayStorage.statusCode, 201);
    assert.deepEqual(replayStorage.json(), { storageLocationId: String(FIRST_STORAGE_LOCATION) });

    const observeStorage = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/storage-locations/${FIRST_STORAGE_LOCATION}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(observeStorage.statusCode, 200);
    assert.equal(observeStorage.json().storageLocation.displayName, 'Kitchen Fridge');

    const ordinaryRead = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/storage-locations`,
      headers: { authorization: `Bearer ${ordinaryToken}` },
    });
    assert.equal(ordinaryRead.statusCode, 200);
    assert.ok(
      ordinaryRead.json().storageLocations.some(
        (location: { storageLocationId: string }) => location.storageLocationId === String(FIRST_STORAGE_LOCATION),
      ),
    );

    const ordinaryMutation = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations`,
      headers: { authorization: `Bearer ${ordinaryToken}` },
      payload: {
        commandId: 'b4000000-0000-4000-8000-000000001101',
        kindCode: STORAGE_KIND,
        displayName: 'Provider claim must not grant authority',
        sortOrder: null,
      },
    });
    assert.equal(ordinaryMutation.statusCode, 404);
    assert.equal(ordinaryMutation.json().error.code, 'NOT_FOUND');

    const foreignObservation = await server.inject({
      method: 'GET',
      url: `/households/${FOREIGN_HOUSEHOLD}/storage-locations`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(foreignObservation.statusCode, 404);
    assert.equal(foreignObservation.json().error.code, 'NOT_FOUND');

    const changeStorage = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations/${FIRST_STORAGE_LOCATION}/metadata-changes`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: storageChangeCommand,
        kindCode: STORAGE_KIND,
        displayName: 'Kitchen Fridge Updated',
        sortOrder: 20,
      },
    });
    assert.equal(changeStorage.statusCode, 200);
    assert.deepEqual(changeStorage.json(), { storageLocationId: String(FIRST_STORAGE_LOCATION) });

    const createCompartment = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations/${FIRST_STORAGE_LOCATION}/compartments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: compartmentCreateCommand,
        kindCode: COMPARTMENT_KIND,
        displayName: 'Upper Shelf',
        sortOrder: 1,
      },
    });
    assert.equal(createCompartment.statusCode, 201);
    assert.deepEqual(createCompartment.json(), { compartmentId: String(FIRST_COMPARTMENT) });

    const foreignParentCreate = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations/${FOREIGN_LOCATION}/compartments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'b4000000-0000-4000-8000-000000001102',
        kindCode: null,
        displayName: 'Must remain hidden',
        sortOrder: null,
      },
    });
    assert.equal(foreignParentCreate.statusCode, 404);
    assert.equal(foreignParentCreate.json().error.code, 'NOT_FOUND');

    const compartmentObservation = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/compartments/${FIRST_COMPARTMENT}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(compartmentObservation.statusCode, 200);
    assert.equal(compartmentObservation.json().compartment.displayName, 'Upper Shelf');
    assert.equal(
      compartmentObservation.json().compartment.storageLocationId,
      String(FIRST_STORAGE_LOCATION),
    );

    const crossIntentReuse = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/compartments/${FIRST_COMPARTMENT}/metadata-changes`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: compartmentCreateCommand,
        kindCode: COMPARTMENT_KIND,
        displayName: 'Must conflict',
        sortOrder: 2,
      },
    });
    assert.equal(crossIntentReuse.statusCode, 409);
    assert.equal(crossIntentReuse.json().error.code, 'IDEMPOTENCY_CONFLICT');

    const changeCompartment = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/compartments/${FIRST_COMPARTMENT}/metadata-changes`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: compartmentChangeCommand,
        kindCode: null,
        displayName: 'Upper Shelf Updated',
        sortOrder: 3,
      },
    });
    assert.equal(changeCompartment.statusCode, 200);

    const retireCompartment = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/compartments/${FIRST_COMPARTMENT}/retirements`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { commandId: compartmentRetireCommand },
    });
    assert.equal(retireCompartment.statusCode, 200);
    assert.deepEqual(retireCompartment.json(), { compartmentId: String(FIRST_COMPARTMENT) });

    const hiddenRetiredCompartment = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/compartments/${FIRST_COMPARTMENT}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(hiddenRetiredCompartment.statusCode, 404);

    const retireStorage = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations/${FIRST_STORAGE_LOCATION}/retirements`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { commandId: storageRetireCommand },
    });
    assert.equal(retireStorage.statusCode, 200);
    assert.deepEqual(retireStorage.json(), { storageLocationId: String(FIRST_STORAGE_LOCATION) });

    const hiddenRetiredStorage = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/storage-locations/${FIRST_STORAGE_LOCATION}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(hiddenRetiredStorage.statusCode, 404);

    const malformedCommand = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/storage-locations`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'not-a-command-id',
        kindCode: STORAGE_KIND,
        displayName: 'Malformed request',
        sortOrder: null,
      },
    });
    assert.equal(malformedCommand.statusCode, 400);

    const history = await adminPool.query<{
      storage_lifecycle: string;
      compartment_lifecycle: string;
      storage_retire_commands: string;
      compartment_retire_commands: string;
    }>(
      `select
         (select lifecycle_status from fridge.storage_location where storage_location_id = $1::uuid) as storage_lifecycle,
         (select lifecycle_status from fridge.compartment where compartment_id = $2::uuid) as compartment_lifecycle,
         (select count(*)::text from fridge.storage_location_retire_command where household_id = $3::uuid and storage_location_id = $1::uuid) as storage_retire_commands,
         (select count(*)::text from fridge.compartment_retire_command where household_id = $3::uuid and compartment_id = $2::uuid) as compartment_retire_commands`,
      [FIRST_STORAGE_LOCATION, FIRST_COMPARTMENT, HOUSEHOLD],
    );
    assert.deepEqual(history.rows[0], {
      storage_lifecycle: 'RETIRED',
      compartment_lifecycle: 'RETIRED',
      storage_retire_commands: '1',
      compartment_retire_commands: '1',
    });
  } finally {
    await server.close();
    await database.close();
    await adminPool.end();
  }
});

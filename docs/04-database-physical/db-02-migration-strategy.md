# FridgeScanner — DB-02 Migration & Deployment Strategy

## Purpose

Defines how the physical PostgreSQL contract evolves safely from empty database through production changes. Migration mechanics must preserve DB-00/DB-01 invariants at every committed state, not only at the end of a deployment.

## 1. Canonical migration source

Ordered SQL migration files are the canonical schema-change source. ORM schema generation, dashboard clicks and provider UI changes are not canonical migrations.

Every accepted migration is immutable. A correction after acceptance is a new migration.

### 1.1 Deterministic filename ordering

Filesystem or raw lexicographic order is never authoritative. Canonical SQL order is the parsed tuple `(major_sequence, substep)`:

- `NNNNNN__name.sql` means substep `00`;
- `NNNNNN_01__name.sql` means substep `01`;
- `NNNNNN_02__name.sql` means substep `02`;
- and so on.

Therefore `000009__recipes_preparation.sql` executes before `000009_01__preparation_allocation_scope.sql`, even though a naive lexical sort could produce the opposite result.

`database/scripts/run_db02_gate.py` is the current reference implementation of this ordering contract. It rejects invalid filenames and duplicate `(major_sequence, substep)` slots before executing SQL. Future orchestration tooling may replace the script only if it implements the same canonical order and checksum/drift contract.

## 2. Directory contract

Initial target layout:

```text
database/
  migrations/
    000001__bootstrap.sql
    000002__identity_tenancy.sql
    ...
  scripts/
    run_db02_gate.py
  tests/
    integrity/
    rls/
    migrations/
  seeds/
    reference/
  README.md
```

The final migration split is reviewed with the SQL baseline. Sequence numbers are monotonic and filenames describe intent, not ticket IDs alone.

## 3. Transaction policy

A migration runs inside one transaction whenever PostgreSQL permits it and the operation can complete within a safe lock window.

Operations that cannot safely be transactional or require online phased rollout are explicitly marked and follow expand/backfill/validate/contract steps. A migration file must not silently mix transactional and non-transactional assumptions.

## 4. Expand → verify → contract

For production-compatible schema evolution:

1. **Expand:** add nullable/new structures, new routines/policies, compatibility paths.
2. **Backfill:** populate in bounded batches where necessary.
3. **Verify:** prove row counts, constraints, invariants and reader/writer compatibility.
4. **Switch:** deploy readers/writers to the new contract.
5. **Validate:** validate deferred/not-valid constraints after data is compliant.
6. **Contract:** remove legacy structure only after old writers/readers are fenced.

Destructive single-step migrations are not the default.

## 5. Constraint introduction

For large populated tables, PostgreSQL `NOT VALID` FK/CHECK plus later `VALIDATE CONSTRAINT` may be used when semantics permit, reducing blocking while still converging to enforced integrity.

A constraint is not considered complete until validation succeeds. Deployment tooling must distinguish "installed but not validated" from accepted state.

## 6. Index creation

On empty/early databases, ordinary CREATE INDEX is acceptable. On large production tables, `CREATE INDEX CONCURRENTLY` may be required and therefore lives outside a surrounding transaction.

Failed concurrent indexes are detected and cleaned/rebuilt explicitly; migration tooling must not treat an invalid index as success.

## 7. RLS rollout

RLS migration order:

1. create trusted context helpers;
2. revoke unsafe public/default grants;
3. create policies;
4. test owner/service/client role behavior;
5. enable RLS;
6. force RLS where appropriate for application-owned tables/roles after validating maintenance paths.

No deployment may enable a client-facing table before its intended RLS/privilege posture exists.

## 8. Function security

All functions use schema-qualified object references. `SECURITY DEFINER` functions explicitly set a safe `search_path`, revoke PUBLIC EXECUTE and grant only the intended execution role.

Function changes are version-compatible during rolling application deployments. Signature replacement that can break old callers follows expand/contract.

## 9. Historical immutability rollout

Append-only guards and privilege revocations are installed before application writers are allowed to create authoritative history. There is no migration phase where normal application roles can freely UPDATE/DELETE ledger/evidence history.

## 10. Seed/reference data

Governed static/reference data required for constraints or initial operation is versioned separately from demo/test fixtures. Seeds are idempotent and use stable identities/codes.

Reference data changes that alter historical interpretation require versioning rather than in-place semantic rewrite.

## 11. Rollback philosophy

Rollback is not assumed to mean reversing SQL.

- Pure additive, lossless changes may have a safe down operation.
- Data-destructive or semantic migrations use forward-fix.
- Application rollback is supported by compatibility windows during expand/contract.
- Database disaster recovery relies on tested backups/PITR plus migration replay, not a fictional reversible migration for every change.

## 12. Backup/recovery gate

Before production schema mutation:

- backup/PITR capability is verified;
- restore procedure is tested in a non-production environment;
- migration version and application version are recorded;
- irreversible steps have explicit restore/forward-fix plans.

## 13. Migration metadata

Deployment records migration identity, checksum, applied timestamp and execution result. The migration runner must reject checksum drift for already applied migrations.

## 14. Environment parity

The same canonical SQL migration lineage runs in local Docker, CI/test and hosted PostgreSQL/Supabase environments. Provider bootstrap differences are isolated outside canonical business-schema migrations where unavoidable.

## 15. Empty-database reproducibility

CI must create a fresh PostgreSQL 17 database and apply all migrations from zero. A schema dump alone is not sufficient evidence.

The DB-02 branch also runs the same lineage on PostgreSQL 18 as a forward-compatibility lane. Both lanes execute the same canonical migration order, integrity suite and RLS suite through `database/scripts/run_db02_gate.py`.

## 16. Upgrade compatibility

A second CI lane exercises the migration lineage and database integrity tests on PostgreSQL 18. Failure there is a forward-compatibility finding, not permission to weaken PostgreSQL 17 correctness.

## 17. Migration acceptance gate

A migration set is acceptable only when:

- canonical ordering validation succeeds;
- fresh install succeeds;
- repeat/metadata checksum behavior is deterministic;
- integrity tests pass;
- RLS negative tests pass;
- PostgreSQL 17 lane is green;
- PostgreSQL 18 compatibility lane is green;
- schema contains no unexpected provider/UI drift;
- downgrade/forward-fix classification is documented;
- exact migration HEAD has been reviewed.

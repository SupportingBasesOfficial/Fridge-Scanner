# FridgeScanner Database

This directory contains the canonical PostgreSQL migration lineage and database-level validation tests for DB-02 and later implementation.

## Baseline

- Minimum target: PostgreSQL 17.x.
- Forward-compatibility lane: PostgreSQL 18.
- Canonical business schema: `fridge`.
- Privileged/internal helper schema: `fridge_internal`.
- Core PostgreSQL first; extensions require explicit reviewed decisions.

## Canonical directories

```text
database/
  migrations/   # immutable ordered SQL migrations after acceptance
  tests/
    integrity/  # structural/domain invariant negative + positive tests
    rls/        # tenant/security policy tests
    migrations/ # fresh-install/evolution/checksum tests
  seeds/
    reference/  # governed stable reference data only
```

## Planned DB-02 migration decomposition

The sequence below is a design plan, not permission to merge partially implemented schema as a production baseline.

1. `000001__bootstrap.sql` — schemas and core exact-rational primitives.
2. `000002__identity_tenancy.sql` — User profile, Household, membership, timezone history.
3. `000003__storage_catalog.sql` — storage topology and catalog reference identities.
4. `000004__product_identifiers.sql` — normalization versions, canonical identifiers, staged claims.
5. `000005__measurement_money.sql` — units, conversion rules/evidence, currencies/monetary facts.
6. `000006__procurement_receiving.sql` — Purchase/Receipt and explicit allocation pools.
7. `000007__inventory_ledger.sql` — StockItem, Batch, immutable movements, transfers and lineage.
8. `000008__inventory_count.sql` — ledger basis, counts, allocation and reconciliation outcomes.
9. `000009__recipes_preparation.sql` — Recipe versions, inputs/outputs, allocations and deviations.
10. `000010__shelf_life.sql` — expiration facts, lifecycle, rules, activations and derived expiration.
11. `000011__shopping_policy.sql` — household product policies, shopping intent and fulfillment.
12. `000012__alerts_integrations.sql` — alert ownership/subjects, delivery, integrations/import provenance.
13. `000013__governance_async.sql` — audit, idempotency and outbox.
14. `000014__rls_privileges.sql` — fail-closed tenant policies and provider-neutral privilege classes.
15. `000015__mutation_routines.sql` — authoritative multi-row transactional command boundaries.
16. `000016__projections.sql` — initial balance/effective-expiration projection implementation.
17. `000017__integrity_guards.sql` — deferred postconditions/immutability guards not naturally local to one domain migration.
18. `000018__reference_seed_contract.sql` — required governed baseline reference data.

Migration decomposition may be refined during DB-02 review, but accepted DB-01 concepts may not disappear into generic JSON, provider metadata or application-only validation.

## Rules

- Applied migrations are immutable.
- All authoritative quantity/money storage is exact; no float types.
- Household isolation is structural plus RLS defense in depth.
- History/evidence rows are append-only.
- Cross-row conservation commits through trusted transaction boundaries.
- A fresh empty database must be reproducible solely from this lineage plus governed reference seeds.
- ORM/database dashboards are consumers of this contract, not schema authorities.

# BE-05 — ObserveProductIdentifier Acceptance

## Status

Candidate executable slice on actual `main @ 482bee20664308c6b0499c0c7e49adeef8a6b0e8`.

The accepted product/schema tree at that base is unchanged from the prior accepted squash state. This document is not acceptance evidence until one exact final PR HEAD passes all required CI and independent review gates.

## Purpose

Introduce the observation-first entry point for Product identifiers without allowing scanner/import evidence to become canonical catalog truth.

## Contract

`ObserveProductIdentifier`:

- requires an exact current Household membership and active role, but does **not** require `HOUSEHOLD_CATALOG_ADMINISTER`;
- records a server-identified `staged_identifier_claim` only;
- preserves `sourceValue` exactly as observed, including otherwise meaningful surrounding characters/whitespace;
- accepts an exact nonblank `schemeCode` and optional exact nonblank `issuerNamespace`;
- performs no generic trim/lowercase or deployment-local normalization;
- writes `normalized_value = NULL` and `normalization_rule_id = NULL` until a governed normalization/resolution workflow exists;
- creates no canonical `product_identifier` and consumes no canonical namespace uniqueness;
- may attach an optional candidate Product only when it is current, `HOUSEHOLD`, and private to the same Household;
- collapses foreign, GLOBAL, retired and missing candidate Products to nondisclosure-safe `NotFound`;
- uses a stable caller `CommandId` in a command scope distinct from Household catalog mutation authority;
- binds replay semantics to actor, candidate Product, scheme, issuer namespace, exact source value and observed instant;
- deliberately excludes the server-generated candidate staged-claim ID from the semantic fingerprint;
- returns the first committed staged-claim identity on replay without reapplying or restoring later staged/candidate state.

## Authority and concurrency

Observation authority is membership-based. The database boundary verifies the current Household context, then follows `Household FOR SHARE -> exact membership FOR UPDATE -> role FOR SHARE`, samples fresh database time only after lock waits, and validates the membership temporal interval. This allows concurrent observations while remaining ordered compatibly with Household membership governance.

Observation authority is intentionally separate from `HOUSEHOLD_CATALOG_ADMINISTER`: observing a barcode/import identifier does not confer authority to create, rebind, normalize or promote a canonical ProductIdentifier.

An absent command row cannot be locked directly. On first use, the boundary therefore performs a fast replay lookup, validates the optional current candidate, reserves and locks the Household observation `CommandId` in the dedicated registry, then re-checks the durable command before creating any staged evidence. Concurrent first writers for the same `CommandId` can therefore produce at most one staged claim; waiters deterministically replay or return `IdempotencyConflictError` instead of surfacing a uniqueness violation.

The existing deferred staged-claim contract assertion remains internal. A dedicated trigger-only `SECURITY DEFINER` guard allows governed `fridge_app` writes to pass the deferred COMMIT check without granting application roles EXECUTE on the assertion helper or the trigger function.

## Command scope

Identifier observation has its own Household-scoped command registry. This prevents accidental coupling to catalog mutation command authority. No fictitious second intent is introduced merely to manufacture a cross-intent test; if another mutation enters this command scope later, the registry constraint and executable collision proof must be extended in that slice.

## Least privilege

`fridge_app` receives only EXECUTE on the intent-specific SECURITY DEFINER observation function. Direct INSERT/UPDATE/DELETE on `staged_identifier_claim` and `product_identifier` remains absent. `fridge_worker` and `fridge_readonly` do not receive observation execution authority. The staged assertion helper and deferred trigger guard remain non-executable by application roles.

## Non-goals

This slice does not normalize identifiers, resolve canonical ProductIdentifier matches, promote staged evidence, create/retire/rebind canonical identifiers, mutate Products, implement GLOBAL authority, expose HTTP delivery, add frontend scanning UI or change deployment.

## Acceptance gate

Before squash merge, one exact final HEAD must demonstrate:

- domain/application build and unit success;
- DB-02 PostgreSQL 17/18 success;
- BE-00 regression success;
- ordinary current Household member can observe without catalog-admin capability;
- retired/invalid role is denied by the database observation boundary;
- exact raw evidence is preserved;
- normalization and canonical binding remain absent;
- optional current same-Household private candidate works;
- foreign/GLOBAL/retired/missing candidate nondisclosure;
- same raw evidence under different CommandIds may coexist as independent staged observations;
- committed replay returns the original staged identity without duplication or candidate revalidation;
- divergent actor, candidate, scheme, issuer, source and observed-time facts conflict;
- concurrent first use of one CommandId is serialized to one durable staged claim with deterministic replay/conflict semantics;
- deferred staged contract enforcement succeeds for governed app writes without exposing internal assertion/trigger helpers;
- no direct identifier DML privilege widening;
- independent panoramic/adversarial review with zero unresolved material findings;
- external automated review, when available, is additional evidence and not an acceptance dependency;
- explicit owner authorization for squash merge;
- branch preservation after merge.

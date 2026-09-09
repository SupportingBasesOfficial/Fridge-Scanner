# BE-05 — Authenticated Product HTTP Delivery and Phase Exit

## Status

Candidate phase-exit slice on accepted `main @ 589bf28f6547d384f524f08190c91d07aba76fd4`.

This document is not acceptance evidence until one exact final PR HEAD passes DB-02, BE-00 and independent panoramic/adversarial review with zero unresolved material findings.

## Purpose

Expose the minimum provider-neutral authenticated HTTP surface required to prove the accepted BE-05 Product Catalog Governance chain end to end without inventing GLOBAL mutation authority or reopening catalog semantics.

## HTTP surface

- `GET /households/:householdId/products`
- `GET /households/:householdId/products/:productId`
- `POST /households/:householdId/products`

The POST body is:

```json
{
  "commandId": "uuid",
  "canonicalName": "exact nonblank Product name"
}
```

The successful create response is HTTP `201` with only the server-resolved `productId`.

## Authority

Authentication evidence is verified first and mapped to a platform `PrincipalId` through the accepted authentication boundary. Provider-side role or Household claims are not catalog authority.

Current Product reads use ordinary current Household authority and preserve GLOBAL + same-Household visibility through the accepted Product read boundary.

CreateHouseholdProduct additionally requires the accepted `HOUSEHOLD_CATALOG_ADMINISTER` capability through `PgHouseholdCatalogAdministrationTransactionManager`.

The delivery layer contains no duplicate authorization rules and cannot upgrade read authority into mutation authority.

## Nondisclosure

`HOUSEHOLD_UNAUTHORIZED` and `NOT_FOUND` remain externally collapsed to HTTP 404 with provider-neutral `NOT_FOUND`. Foreign/missing Household contexts therefore do not become an existence oracle for Product identities.

## Idempotency

The caller supplies a stable `CommandId`. The HTTP layer forwards it unchanged to the accepted CreateHouseholdProduct command. Committed retry returns the original committed Product identity even when the server proposes a new internal candidate.

## Runtime wiring

Production `apps/api/src/main.ts` wires:

- `PgCurrentProductReader` to List/Get current Product use cases;
- `PgHouseholdCatalogAdministrationTransactionManager` + `PgHouseholdProductWriter` to CreateHouseholdProduct;
- random server-generated Product candidates that remain outside caller control.

No direct Product SQL or DML is introduced in the delivery layer.

## Authenticated phase-exit proof

The BE-00 API integration proof must demonstrate on one exact HEAD:

1. a signed ES256 token is verified against configured issuer/audience/JWKS;
2. provider claims deliberately assert a fake privileged role and foreign Household;
3. platform identity mapping resolves the actual PrincipalId independently of those claims;
4. a real catalog administrator creates a Household Product through authenticated HTTP;
5. the same CommandId replays the original Product identity;
6. authenticated GET observes the committed Product through the governed read boundary;
7. an ordinary current Household member can observe the Product but cannot create one despite the fake provider-super-admin claim;
8. a foreign/unowned Household context collapses to `NOT_FOUND`.

Together with the already accepted DB/application proofs for GLOBAL + same-Household visibility, foreign Product nondisclosure, identifier isolation, staged-claim non-reservation, least privilege and cross-intent idempotency, this satisfies B5-039 without creating a new GLOBAL authority fiction.

## Explicit non-goals

This phase-exit slice does not add:

- GLOBAL catalog mutations;
- IngredientConcept HTTP delivery;
- compatibility mapping/evidence HTTP delivery;
- ProductIdentifier normalization or staged promotion;
- procurement, inventory, recipe, shelf-life or shopping workflows;
- frontend or deployment changes.

Additional delivery surfaces may evolve after BE-05 closes, but later phases must continue consuming the accepted catalog application contracts rather than bypassing them.

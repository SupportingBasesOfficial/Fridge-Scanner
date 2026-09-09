# BE-05 — ResolveProductIdentifier Acceptance

## Status

Candidate executable slice on accepted `main @ 6de6fa1032855ad04b5f5f90e7d348adec68e3c4`.

This document is not acceptance evidence until one exact final PR HEAD passes all required CI and independent panoramic/adversarial review gates.

## Purpose

Introduce deterministic read-only resolution of canonical ProductIdentifier bindings without turning raw observations into normalization or mutation authority.

## Contract

`ResolveProductIdentifier`:

- requires a current authorized Household membership through the existing transaction boundary;
- accepts one exact already-normalized governed key: `schemeCode + issuerNamespace + normalizationRuleId + normalizedValue`;
- never resolves by raw `sourceValue`;
- never chooses a normalization algorithm, normalization rule or namespace heuristically;
- preserves `normalizedValue` exactly as supplied, including governed surrounding whitespace; only the empty string is rejected;
- requires exact nonblank `schemeCode` and exact optional nonblank `issuerNamespace`;
- returns a canonical match only when the ProductIdentifier is `ACTIVE`, `retired_at IS NULL`, and its Product is `ACTIVE`;
- exposes only Products visible to the Household: GLOBAL plus same-Household private;
- collapses missing, foreign private, retired Product, retired ProductIdentifier, namespace mismatch, rule mismatch, scheme mismatch and normalized-value mismatch to `resolution: null`;
- may resolve an ACTIVE canonical identifier written under a historical/retired normalization rule when the caller presents that exact rule identity and key; rule lifecycle is historical evidence, not current lookup authority;
- performs no writes to canonical ProductIdentifier or staged evidence;
- does not normalize, promote, resolve staged claims, create/rebind/retire identifiers, or mutate Product state.

## Runtime boundary and least privilege

Earlier DB-02 capability grants allowed direct SELECT on `fridge.product_identifier`. This slice revokes that broad runtime SELECT from `fridge_app`, `fridge_worker` and `fridge_readonly`; otherwise callers could bypass exact-membership, lifecycle, namespace-rule and Product-visibility checks.

`fridge_app` receives EXECUTE only on `fridge_internal.resolve_current_product_identifier(...)`. Worker/readonly do not receive this resolution boundary. Existing direct DML remains absent. `product_identifier_normalization_rule` remains governed reference data and is not made a canonical binding surface.

## Non-goals

This slice does not implement raw-value normalization, staged-claim promotion, canonical ProductIdentifier mutation lifecycle, GLOBAL mutation authority, HTTP delivery, scanner UI or deployment changes.

## Acceptance gate

Before squash merge, one exact final HEAD must demonstrate:

- domain/application build and unit success;
- DB-02 PostgreSQL 17/18 success;
- BE-00 regression success;
- current authorized Household membership is required;
- same-Household private canonical binding resolves;
- GLOBAL canonical binding resolves;
- exact historical normalization-rule identity remains usable for an ACTIVE binding even when the rule lifecycle is retired;
- exact normalized-value semantics, including governed surrounding whitespace;
- no heuristic fallback for wrong scheme, namespace, rule or normalized value;
- foreign private, retired Product, retired ProductIdentifier and missing targets collapse to `null`;
- direct ProductIdentifier SELECT is closed for app/worker/readonly;
- no identifier DML privilege widening;
- resolution is observational and leaves canonical/staged row counts unchanged;
- independent panoramic/adversarial review with zero unresolved material findings;
- external automated review, when available, is optional defense-in-depth and not an acceptance dependency;
- explicit owner authorization for squash merge;
- source branch preservation after merge.

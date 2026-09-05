# FridgeScanner — BE-03 Decisions

## Status

This register defines the initial normative decisions for BE-03 — Household Access Management. It becomes authoritative only after the BE-03 baseline is reviewed and merged.

## B3-001 — Household membership administration is Household-scoped authority

**Decision:** membership administration executes only within a current, verified Household authorization context.

**Rule:** authentication success, platform identity alone, provider roles or requested Household identifiers do not grant membership-administration authority.

## B3-002 — Administrative capability is explicit and provider-neutral

**Decision:** a current member may administer memberships only when the accepted Household role/capability contract grants the required capability.

**Rule:** the application does not infer administration rights from arbitrary role-code strings, JWT claims, provider groups or UI labels.

## B3-003 — Concrete Household role meanings are governed reference data

**Decision:** `fridge.household_role` remains the canonical role reference surface, but role semantics/capabilities require an accepted reference-data contract.

**Rule:** executable code may not invent meanings for role codes such as `ADMIN`, `OWNER` or `MEMBER` merely because such names are conventional.

## B3-004 — Membership commands target platform identity

**Decision:** membership mutation targets are existing platform-owned principals/users represented by accepted platform identity.

**Rule:** email addresses, provider subjects, external identity IDs and raw authentication claims are not Household membership authority keys.

## B3-005 — Membership lifecycle is interval/history preserving

**Decision:** current membership is represented by a current effective interval; ending membership closes that interval and history remains durable.

**Rule:** historical membership rows are not deleted or reopened to simplify rejoin flows.

## B3-006 — Rejoin creates new authority history

**Decision:** a principal joining a Household again after a prior ended membership creates a new governed membership interval/record.

**Rule:** rejoin must not reinterpret a previous interval as if authority had never ended.

## B3-007 — Role change preserves historical semantics

**Decision:** a role transition must preserve the role that was authoritative before the transition and the role authoritative after it.

**Rule:** the implementation may use interval closure plus a new membership record or another explicitly governed history model, but it must not silently rewrite past authority.

## B3-008 — One current membership remains an invariant

**Decision:** at most one current/open membership may exist for a given `(Household, User)`.

**Rule:** application concurrency handling must treat the accepted DB uniqueness constraint as a final enforcement layer, not as the only user-visible control flow.

## B3-009 — Membership mutations are intent-specific

**Decision:** application ports/use cases express membership intent such as add, role change, end and read current members.

**Rule:** BE-03 does not introduce a generic HouseholdMembership CRUD repository as the primary business abstraction.

## B3-010 — Actor authority is re-evaluated in the mutation transaction

**Decision:** the acting principal's current Household membership and administrative capability are evaluated in the same authoritative transaction boundary as the mutation.

**Rule:** a preflight check, cached UI permission or previously verified membership cannot freeze administrative authority.

## B3-011 — Target membership state is read authoritatively

**Decision:** add/change/end commands determine the target principal's current membership from canonical durable state under the mutation's concurrency strategy.

**Rule:** caller-supplied current-role/current-membership assertions are not authority.

## B3-012 — Last-administrator survivability is an explicit invariant

**Decision:** BE-03 must define a provider-neutral membership-administration capability and prevent a mutation from leaving a Household without any current principal capable of administering membership when survivability policy requires one.

**Rule:** the last-authority check is atomic with the mutation and cannot rely on read-then-write application logic vulnerable to write skew.

## B3-013 — Self-mutation follows explicit policy

**Decision:** self-leave, self-demotion and self-role-change are governed semantic cases.

**Rule:** equality between actor and target IDs neither automatically permits nor automatically rejects a mutation.

## B3-014 — Role assignment validates current role governance

**Decision:** an assigned role must exist, be active and be assignable under the accepted role reference/capability contract at the mutation point.

**Rule:** unknown, inactive or non-assignable roles fail closed.

## B3-015 — Provider metadata cannot administer membership

**Decision:** provider roles, groups, organizations, tenant hints and custom claims remain authentication-side metadata only.

**Rule:** no external metadata can add, remove, promote or demote Household members unless a future canonical Household-authority contract is explicitly governed and supersedes this decision.

## B3-016 — Unauthorized membership operations preserve nondisclosure

**Decision:** membership administration failures must not reveal cross-tenant Household/member existence to unauthorized callers.

**Rule:** delivery semantics may collapse unauthorized/not-found outcomes according to accepted platform nondisclosure rules.

## B3-017 — Actor provenance is durable business evidence

**Decision:** committed membership authority changes retain the verified acting platform principal and sufficient semantic provenance in durable state.

**Rule:** logs alone are not sufficient provenance for a security-sensitive authority mutation.

## B3-018 — Effective time and recording time are not conflated when they differ

**Decision:** if business-effective membership time may differ from commit/recording time, the authoritative model preserves that distinction.

**Rule:** backdated/future-dated authority must not be introduced implicitly; any support for it requires explicit policy and validation.

## B3-019 — Default mutation semantics are immediate current-time authority

**Decision:** the first executable BE-03 slice should apply membership changes effective at the accepted transaction time unless a separately governed scheduling contract is introduced.

**Rule:** arbitrary caller-controlled backdating/future scheduling is not accepted by default.

## B3-020 — Competing mutations must be deterministic

**Decision:** concurrent add/end/role-change operations must serialize or conflict under a strategy strong enough to preserve one-current-membership and last-authority invariants.

**Rule:** lost update, stale resurrection and write-skew outcomes are forbidden.

## B3-021 — Retry safety is explicit

**Decision:** mutation retry behavior must distinguish safely repeatable outcomes from commands that require an idempotency contract.

**Rule:** network/client retry must not create duplicate historical membership intervals or apply a role transition twice.

## B3-022 — Database privilege remains least-privileged and intent-specific

**Decision:** delivery/runtime code does not receive broad table mutation privilege merely to implement membership administration.

**Rule:** persistence access should use the narrowest accepted capability, transaction boundary or security-definer procedure needed to enforce BE-03 invariants and RLS.

## B3-023 — Household lifecycle and membership lifecycle remain distinct

**Decision:** changing a Household's own lifecycle status is not equivalent to ending individual memberships and is outside the initial membership-management mutation slice unless explicitly baselined.

**Rule:** membership code must not use Household retirement as a shortcut for membership administration.

## B3-024 — Invitation is not pre-authorized membership

**Decision:** BE-03 does not model an email/provider invite as current Household authority.

**Rule:** invitation/claim workflows require their own canonical pending-state, expiry, claimant-binding and acceptance contract before implementation.

## B3-025 — Existing principal requirement fails safely

**Decision:** adding a member in BE-03 targets an existing platform principal/user.

**Rule:** missing/unknown target identity does not silently create a user or external identity link and must preserve nondisclosure as applicable.

## B3-026 — Current membership reads are Household-scoped

**Decision:** listing/reading Household members occurs only under current Household authority and returns provider-neutral platform membership data.

**Rule:** authentication credentials, external provider subjects and raw provider claims are not exposed as membership data.

## B3-027 — Read models do not become mutation authority

**Decision:** membership lists, cached projections and API response versions are observational surfaces only.

**Rule:** mutation decisions re-read canonical current authority rather than trusting client-provided versions unless a future explicit optimistic-concurrency token contract is introduced.

## B3-028 — Upstream identity mapping remains independent

**Decision:** ending Household membership does not revoke the platform principal's external identity link by implication, and revoking an external identity link does not rewrite historical Household membership.

**Rule:** authentication identity lifecycle and Household membership lifecycle remain separate authorities.

## B3-029 — Error contracts remain provider-neutral

**Decision:** membership failures use stable application/delivery errors representing invalid input, unauthenticated, Household unauthorized/not-found, conflict or dependency failure as appropriate.

**Rule:** PostgreSQL constraint names, provider identity details and internal role-policy diagnostics are not public contracts.

## B3-030 — Phase completion requires a real governed mutation proof

**Decision:** documentation, role reference data and unit tests alone do not complete BE-03.

**Rule:** exit requires an exact-HEAD real authenticated request that crosses BE-02 identity verification, current Household authorization, explicit membership-administration capability and durable history-preserving mutation, plus adversarial/concurrency tests proving authority separation and survivability invariants.

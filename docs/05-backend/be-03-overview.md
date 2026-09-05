# FridgeScanner — BE-03 Household Access Management

## Status

BE-03 is the active backend phase after formally accepted BE-02 — Identity Boundary.

Accepted upstream foundation:

- DB-00 — Domain Discovery & Invariants
- DB-01 — Logical / Relational Database Model
- DB-02 — PostgreSQL Physical Schema & Enforcement
- BE-00 — Backend Foundation & Runtime Contracts
- BE-01 — Application Contracts & Domain Kernel
- BE-02 — Identity Boundary

The canonical post-BE-02 `main` baseline is `5f7cba8a1693a5df4cc7d61ad0c3452414b97d3c`.

BE-03 consumes those contracts. It may not reinterpret platform identity, Household tenancy, current membership authority, RLS, nondisclosure, exact-value semantics or provider-neutral authentication for administrative convenience.

## Objective

Establish the provider-neutral application and persistence boundary for governing Household membership and Household-scoped role assignment over time.

BE-03 turns the already accepted read-time authority check into a governed mutation model for membership administration while preserving history, currentness and tenant isolation.

The authority flow is:

```text
verified PrincipalId
  -> current Household authorization transaction
  -> explicit administrative capability/policy
  -> membership lifecycle command
  -> governed durable mutation
  -> immutable/history-preserving result
  -> subsequent requests re-evaluate current membership
```

Authentication still answers **who is this platform principal?** BE-03 answers **who may govern membership inside this Household, and how does that authority change safely over time?**

## Scope

BE-03 covers:

- reading current Household membership state through intent-specific application contracts;
- adding an existing platform principal to a Household under explicit authority;
- changing the Household-scoped role of a current member;
- ending/revoking a current membership without deleting its historical fact;
- re-establishing membership through a new governed membership interval rather than rewriting history;
- defining the policy boundary used to decide which current Household roles/capabilities may administer membership;
- protecting the Household from authority states that violate governed survivability policy;
- exact concurrency semantics for competing membership mutations;
- auditable actor/provenance semantics for membership changes;
- nondisclosure-safe delivery semantics;
- regression proof that BE-02 authentication and DB-02 RLS remain authoritative.

## Explicit non-goals

BE-03 does not implement:

- external invitation/email delivery workflows;
- social-login onboarding;
- password or account-recovery UX;
- global platform administration;
- catalog/product CRUD;
- storage topology CRUD;
- inventory/procurement/receiving workflows;
- frontend/BFF UI;
- billing/subscription roles;
- provider roles/groups as Household authority;
- production hosting rollout.

An invitation workflow may be introduced only after a canonical invitation/claim contract is governed. BE-03 must not simulate invitations by pre-creating authority for an unauthenticated email address or provider claim.

## Canonical upstream model

DB-00 defines:

- `Household` as the primary operational and authorization boundary;
- `HouseholdMembership` as the User-to-Household association that carries Household-scoped authority and membership lifecycle;
- different roles for the same User across different Households;
- no global User role substitution for Household authority.

DB-02 already provides:

- `fridge.household_role` as governed reference data;
- `fridge.household_membership` with `effective_from` / `effective_to` history;
- one open membership per `(household_id, user_id)`;
- `created_by_user_id` provenance;
- no concrete role codes seeded by physical schema design.

BE-03 must use these contracts rather than invent an alternate authorization store.

## Core authority rules

### Current membership is execution-time truth

Membership administration is Household-scoped business authority and therefore executes only after current Household authorization is re-established inside the accepted transaction boundary.

A valid JWT, provider role, external identity link, cached UI state or previous membership decision is never sufficient administrative authority.

### Administrative authority is explicit

A caller being a current Household member does not automatically imply the right to administer other members.

The application layer must evaluate an explicit provider-neutral Household administrative capability/policy derived from canonical Household role governance.

Concrete role-code meanings may not be guessed from strings such as `ADMIN`, `OWNER` or `MEMBER`. Role codes become authoritative only through accepted governed reference data and an explicit capability mapping contract.

### Historical membership is not rewritten

Ending a membership closes its effective interval. Rejoining creates a new governed interval/record. Role history must remain reconstructable; a role transition may not silently mutate a historical interval in a way that changes past authority.

### No last-authority accidents

BE-03 must define and enforce a survivability invariant before allowing a mutation that could remove or demote the last principal capable of administering Household membership.

This invariant must be checked atomically with the mutation. A read-then-write race is not acceptable.

### Self-mutation is not special by accident

Self-leave, self-demotion and self-role-change follow explicit policy. The system must not grant or deny them merely because actor and subject IDs happen to match.

### Target identity must be platform-owned

Membership commands target an existing platform `PrincipalId`/User identity. Provider subject IDs, email addresses, JWT subjects and provider claims are not membership foreign keys or administrative authority.

### Nondisclosure is preserved

Unauthorized callers must not learn whether a target principal, Household, membership history or another tenant resource exists.

Delivery may collapse authorization/not-found outcomes according to accepted nondisclosure semantics.

## Mutation model

Membership mutations must be intent-specific commands, not generic CRUD.

Expected semantic commands include concepts equivalent to:

```text
AddHouseholdMember
ChangeHouseholdMemberRole
EndHouseholdMembership
ReadHouseholdMembers
```

Names may evolve, but contracts must express business intent and authority rather than table operations.

Every mutation must:

1. authenticate to a verified platform principal through BE-02;
2. re-establish current Household membership inside the accepted transaction;
3. prove the actor has the required membership-administration capability;
4. lock/read the authoritative current membership state needed for the invariant;
5. validate the target principal and governed target role;
6. perform one atomic mutation or fail without partial authority change;
7. preserve provenance/history;
8. return provider-neutral output/error semantics.

## Role governance

`household_role` is reference data, not free-form application input.

BE-03 requires an explicit accepted contract for:

- which roles are active;
- which are assignable;
- which provider-neutral capabilities each role grants;
- which capabilities authorize membership administration;
- whether role transitions have additional restrictions;
- survivability semantics for the last membership administrator.

Until that contract is accepted, executable mutation code must not hard-code guessed role meanings.

## Concurrency and consistency

Membership authority is security-sensitive state.

Competing add/end/role-change operations must produce deterministic outcomes under concurrency. At minimum:

- duplicate concurrent add attempts cannot create two current memberships;
- concurrent end/role-change cannot resurrect a closed membership through stale state;
- last-authority protection must be evaluated under an isolation/locking strategy that prevents write skew;
- retries may not duplicate historical intervals;
- a failed mutation cannot leave role and membership history partially changed.

The selected implementation may use PostgreSQL row/advisory locking, serializable semantics or another accepted mechanism, but the invariant is authoritative, not the mechanism.

## Audit/provenance

Every committed membership authority change must retain enough provenance to answer:

- which Household changed;
- which membership/principal was affected;
- which verified platform principal acted;
- what semantic action occurred;
- old/new governed role where applicable;
- authoritative effective time;
- recording time where distinct;
- reason/source when required by policy.

If the accepted DB-02 schema is insufficient for required provenance, BE-03 must evolve the physical contract through an explicit migration rather than dropping evidence in logs only.

## Security properties that must remain true

- provider identity is not Household authority;
- current authentication does not freeze current membership;
- role names from JWT/provider metadata are non-authoritative;
- caller-supplied `PrincipalId` never becomes actor authority;
- target `PrincipalId` is data, not caller authority;
- cross-Household membership state remains isolated;
- historical membership cannot be deleted to simplify state;
- last-authority protection is atomic;
- unauthorized/not-found outcomes preserve nondisclosure;
- no generic privileged database role is exposed to delivery code;
- application/domain contracts remain independent of PostgreSQL/Fastify/provider SDKs.

## Test and CI gate

BE-03 cannot be accepted until exact-HEAD evidence proves at least:

- current authorized administrator can add an existing platform principal under a governed assignable role;
- ordinary current member without the administrative capability cannot add/change/end memberships;
- provider/JWT role metadata cannot grant membership-administration authority;
- unknown target principal fails safely without tenant disclosure;
- duplicate current membership is rejected deterministically;
- ended membership is historical and no longer authorizes execution;
- rejoin creates new history rather than reopening/reinterpreting the old interval;
- role change preserves historical authority semantics;
- inactive/non-assignable/unknown role cannot be assigned;
- self-leave/self-demotion follows explicit policy;
- mutation cannot remove/demote the last membership administrator when survivability policy forbids it;
- concurrent competing mutations preserve last-authority and one-current-membership invariants;
- unauthorized cross-Household attempts cannot observe or mutate another Household;
- actor/provenance is durable;
- BE-02 authentication regressions remain clean;
- DB-02/RLS regressions remain clean;
- container non-root/liveness/readiness behavior remains clean.

## Exit rule

BE-03 is complete only when a real authenticated request can perform a narrowly governed Household-membership administration command through current Household authority, durable history-preserving mutation and exact concurrency invariants, while adversarial requests cannot derive administrative authority from provider metadata, stale membership or cross-tenant knowledge.

Passing tests never override an upstream authority or data-integrity invariant.

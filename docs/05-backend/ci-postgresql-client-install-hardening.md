# PostgreSQL client installation hardening

## Problem

GitHub-hosted Ubuntu runners include an unrelated Google Chrome APT source. On 2026-09-09 that source repeatedly returned a `Hash Sum mismatch`, causing both DB-02 and the BE-00 PostgreSQL/RLS lane to fail during `apt-get update` before any FridgeScanner migration, test, build or integration step executed.

## Change

The DB-02 and BE-00 PostgreSQL client installation steps now locate APT source-list files containing the exact Chrome repository URL `dl.google.com/linux/chrome-stable/deb` and remove only those source files before `apt-get update`. If the same Chrome repository is present in `/etc/apt/sources.list`, only that matching line is removed. APT acquisition retries are also enabled.

Ubuntu, Microsoft and other unrelated package sources are not removed by this hardening.

This does not change application, database or domain behavior. It removes an unrelated runner package source from the dependency chain of installing `postgresql-client`.

## Acceptance

The change is accepted only when the workflows that previously failed at client installation pass on the exact PR HEAD. Merge remains separately owner-authorized.

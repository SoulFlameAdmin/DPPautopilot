# C04 Database Migration Deployment Gate — Partial Progress

C04 remains RED because C03 is RED. This precursor adds a release-time fail-closed migration gate without mutating the database.

Read-only Supabase migration inventory for bound project frhletkiuupgksmgxoxc currently covers every committed DPP migration canonical name.

The repository manifest generator hashes every supabase/migrations SQL file with SHA-256 and binds the manifest to the release commit. The gate verifier requires the same candidate commit, a valid manifest checksum, all canonical migration names present in the approved database evidence, and a commit-aligned passing schema verification.

Supabase-managed applied version IDs are not treated as repository file IDs because managed migration application can assign a different version. Canonical migration name provides cross-system coverage identity; SHA-256 protects committed SQL contents.

No migration or deployment is applied by this C04 precursor.

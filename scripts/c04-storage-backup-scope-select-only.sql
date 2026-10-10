-- DPP C04: live backup scope PRE-FLIGHT ONLY. No bytes copied or files backed up.
-- These 3 statements use SELECT only and aggregate information (no object names/PII).
-- Not a backup, not a PITR checkpoint, not migration evidence, not release PASS.

-- 1: Database storage footprint and observation timestamp.
SELECT now() AT TIME ZONE 'UTC' AS observed_utc,
       pg_database_size(current_database())::bigint AS database_bytes;

-- 2: All Storage buckets, even unrelated SoulFlame apps on the SAME project.
SELECT b.id AS bucket_id, b.public AS is_public,
       count(o.id)::bigint AS metadata_object_count,
       coalesce(sum(CASE WHEN (o.metadata->>'size') ~ '^[0-9]+$'
              THEN (o.metadata->>'size')::numeric ELSE 0 END),0)::numeric AS metadata_estimated_bytes,
       count(o.id) FILTER (WHERE o.metadata->>'size' IS NULL)::bigint AS missing_size_metadata_count
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id
GROUP BY b.id,b.public ORDER BY b.id;

-- 3: Overall expected object-count inventory, not a byte-level checksum.
SELECT count(DISTINCT b.id)::bigint AS bucket_count,
       count(o.id)::bigint AS metadata_object_count,
       count(o.id) FILTER (WHERE b.public IS FALSE)::bigint AS private_metadata_object_count,
       count(o.id) FILTER (WHERE b.public IS TRUE)::bigint AS public_metadata_object_count
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id;

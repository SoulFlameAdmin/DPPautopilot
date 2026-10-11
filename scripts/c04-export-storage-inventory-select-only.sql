-- C04 READ-ONLY: produces a single PRIVATE JSON inventory for all Storage buckets.
-- No Storage object bytes are read. This is NOT a backup or restore.
-- Save output ONLY locally in .c04-private/storage-inventory.json (never GitHub/email).
-- Run in owner-authorized Supabase SQL Editor and copy the JSON value.
-- Fail closed (zero rows) if any object size metadata is absent/non-numeric.
WITH bucket_totals AS (
 SELECT b.id,
   COUNT(o.id)::bigint AS object_count,
   COALESCE(SUM(CASE WHEN (o.metadata->>'size') ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric ELSE 0 END),0)::bigint AS estimated_bytes,
   COUNT(o.id) FILTER(WHERE o.metadata->>'size' IS NULL OR o.metadata->>'size' !~ '^[0-9]+$')::bigint AS missing_size_count
 FROM storage.buckets b
 LEFT JOIN storage.objects o ON o.bucket_id=b.id
 GROUP BY b.id
), inventory AS (
 SELECT COUNT(*)::bigint AS bucket_count,
   COALESCE(SUM(object_count),0)::bigint AS object_count,
   COALESCE(SUM(estimated_bytes),0)::bigint AS estimated_bytes,
   COALESCE(SUM(missing_size_count),0)::bigint AS missing_size_count,
   jsonb_agg(jsonb_build_object('id',id,'objectCount',object_count,'estimatedBytes',estimated_bytes) ORDER BY id) AS buckets
 FROM bucket_totals
)
SELECT jsonb_build_object(
 'schemaVersion','C04_STORAGE_INVENTORY_V1',
 'projectRef','frhletkiuupgksmgxoxc',
 'capturedAtUtc',to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'bucketCount',bucket_count,'objectCount',object_count,
 'estimatedBytes',estimated_bytes,'buckets',buckets
) AS private_inventory
FROM inventory
WHERE missing_size_count=0 AND bucket_count>0;

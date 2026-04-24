/**
 * Supabase relation normalization
 *
 * PostgREST returns a joined relation as either:
 *   - an array of objects (to-many: no unique constraint on the FK)
 *   - a single object or null (to-one: UNIQUE constraint on the FK)
 *
 * Migration 003 added UNIQUE(property_id) on analyses, which flipped the
 * `analyses(...)` join from array shape to object shape. Same thing happens
 * with pipeline (which has UNIQUE(property_id) from the base schema).
 *
 * Rather than rewrite every consumer, we normalize to array shape at fetch
 * boundary. One helper, one convention, one place to fix if Supabase ever
 * changes behavior again.
 */

type MaybeRelation<T> = T | T[] | null | undefined

/** Wrap a single related object in an array; leave arrays and nulls alone. */
export function asArray<T>(v: MaybeRelation<T>): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Given a row with potentially-to-one relations, coerce those relations into arrays.
 * Pass the keys that should be array-shaped on the output row.
 */
export function normalizeRelations<Row extends Record<string, unknown>>(
  rows: Row[],
  relationKeys: (keyof Row)[],
): Row[] {
  return rows.map(row => {
    const out = { ...row }
    for (const key of relationKeys) {
      const v = row[key]
      if (v != null && !Array.isArray(v)) {
        // @ts-expect-error — runtime-safe normalization
        out[key] = [v]
      }
    }
    return out
  })
}

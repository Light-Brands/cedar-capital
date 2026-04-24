/**
 * TCAD (Travis Central Appraisal District) Ingester
 *
 * Pulls the annual public appraisal-roll export from TCAD, streams the
 * ~400K residential records, matches them by address+zip to our properties
 * table, and writes owner name, mailing address, homestead flag, assessed
 * value, market value, and deed date back onto each matched row.
 *
 * Run from the worktree root:
 *   npx tsx scripts/ingest-tcad.ts
 *
 * First run downloads the 553 MB zip to /tmp/tcad and unzips it. Subsequent
 * runs reuse the cached file — delete /tmp/tcad to force a fresh download.
 *
 * Prerequisite: migration 004 applied.
 *
 * Data source: https://traviscad.org/publicinformation
 * Schema:      https://traviscad.org/wp-content/largefiles/Website_Legacy8.0.32-AppraisalExportLayout.zip
 */

import fs from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Config
// ============================================================

const TCAD_ZIP_URL =
  'https://traviscad.org/wp-content/largefiles/2026%20Preliminary%20Appraisal%20Export%20Supp%200_04172026.zip'
const TMP_DIR = '/tmp/tcad'
const ZIP_PATH = path.join(TMP_DIR, 'tcad_2026_preliminary.zip')
const EXTRACT_DIR = path.join(TMP_DIR, 'extracted')
const BATCH_SIZE = 500

// ============================================================
// env loader
// ============================================================

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath} — run from worktree root`)
  }
  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/)
    if (!m) continue
    let value = m[2]
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    process.env[m[1]] = value
  }
}

// ============================================================
// Safer subprocess runner (arg array, no shell)
// ============================================================

function runCommand(cmd: string, args: string[], opts: { captureStdout?: boolean } = {}): string {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: opts.captureStdout ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (r.status !== 0) {
    throw new Error(`${cmd} exited with ${r.status}${r.stderr ? ': ' + r.stderr : ''}`)
  }
  return opts.captureStdout ? r.stdout : ''
}

// ============================================================
// Fixed-width field extraction (1-indexed inclusive)
// ============================================================

function slice(line: string, start: number, end: number): string {
  return line.slice(start - 1, end).trim()
}

function parseNum(s: string): number | null {
  if (!s) return null
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  return n
}

function parseTcadDate(s: string): string | null {
  if (!s) return null
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

// ============================================================
// Address normalization
// ============================================================

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bSTREET\b/g, 'ST'],
  [/\bAVENUE\b/g, 'AVE'],
  [/\bBOULEVARD\b/g, 'BLVD'],
  [/\bDRIVE\b/g, 'DR'],
  [/\bROAD\b/g, 'RD'],
  [/\bLANE\b/g, 'LN'],
  [/\bCIRCLE\b/g, 'CIR'],
  [/\bCOURT\b/g, 'CT'],
  [/\bPLACE\b/g, 'PL'],
  [/\bTRAIL\b/g, 'TRL'],
  [/\bPARKWAY\b/g, 'PKWY'],
  [/\bHIGHWAY\b/g, 'HWY'],
  [/\bTERRACE\b/g, 'TER'],
  [/\bSQUARE\b/g, 'SQ'],
  [/\bCOVE\b/g, 'CV'],
  [/\bCROSSING\b/g, 'XING'],
]

function normalize(s: string): string {
  let out = s.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
  for (const [pattern, replacement] of ABBREVIATIONS) out = out.replace(pattern, replacement)
  return out
}

function buildKey(street: string, zip: string): string {
  return `${normalize(street)}|${zip.slice(0, 5)}`
}

function ourAddressKey(address: string, zipCode: string | null): string | null {
  if (!address || !zipCode) return null
  const firstComma = address.indexOf(',')
  const street = firstComma >= 0 ? address.slice(0, firstComma) : address
  if (!street.trim()) return null
  return buildKey(street, zipCode)
}

function tcadAddressKey(
  num: string,
  prefix: string,
  street: string,
  suffix: string,
  zip: string,
): string | null {
  if (!num || !street || !zip) return null
  const joined = [num, prefix, street, suffix].filter(Boolean).join(' ')
  return buildKey(joined, zip)
}

// ============================================================
// Download + extract
// ============================================================

function ensureTcadFile(): string {
  fs.mkdirSync(TMP_DIR, { recursive: true })

  if (!fs.existsSync(ZIP_PATH)) {
    console.log(`→ downloading ${TCAD_ZIP_URL}`)
    console.log('  (553 MB — ~1-2 min on fast connection)')
    runCommand('curl', ['-fL', '--progress-bar', '-o', ZIP_PATH, TCAD_ZIP_URL])
  } else {
    const sizeMb = (fs.statSync(ZIP_PATH).size / 1_000_000).toFixed(0)
    console.log(`✓ cached zip found: ${ZIP_PATH} (${sizeMb} MB)`)
  }

  fs.mkdirSync(EXTRACT_DIR, { recursive: true })
  const listing = runCommand('unzip', ['-Z1', ZIP_PATH], { captureStdout: true })
  const entries = listing.split('\n').map(s => s.trim()).filter(Boolean)

  const propEntry = entries.find(e => /PROP\.TXT$|APPRAISAL_INFO\.TXT$/i.test(e))
  if (!propEntry) {
    console.log('  zip contents:')
    for (const e of entries.slice(0, 20)) console.log(`    ${e}`)
    throw new Error('Could not find a PROP.TXT or APPRAISAL_INFO.TXT file in the zip')
  }

  const extractedPath = path.join(EXTRACT_DIR, path.basename(propEntry))
  if (!fs.existsSync(extractedPath)) {
    console.log(`→ extracting ${propEntry}`)
    runCommand('unzip', ['-o', '-j', ZIP_PATH, propEntry, '-d', EXTRACT_DIR])
  } else {
    console.log(`✓ property file cached: ${extractedPath}`)
  }

  return extractedPath
}

// ============================================================
// Load our properties' address keys
// ============================================================

interface LocalProp {
  id: string
  address: string
  zip_code: string | null
}

async function loadOurPropertyKeys(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const perPage = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('properties')
      .select('id, address, zip_code')
      .range(offset, offset + perPage - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data as LocalProp[]) {
      const key = ourAddressKey(row.address, row.zip_code)
      if (key) map.set(key, row.id)
    }
    if (data.length < perPage) break
    offset += perPage
  }
  return map
}

// ============================================================
// Build update payload
// ============================================================

interface TcadUpdate {
  id: string
  tcad_prop_id: string | null
  tcad_geo_id: string | null
  owner_name: string | null
  owner_mailing_address: string | null
  is_absentee: boolean | null
  has_homestead_exemption: boolean | null
  market_value: number | null
  appraised_value: number | null
  tax_assessed_value: number | null
  deed_date: string | null
  tcad_updated_at: string
}

function buildUpdate(line: string, propId: string): TcadUpdate {
  const tcadPropId = slice(line, 1, 12)
  const geoId = slice(line, 547, 596)
  const ownerName = slice(line, 609, 678)
  const ownerAddr1 = slice(line, 694, 753)
  const ownerAddr2 = slice(line, 754, 813)
  const ownerCity = slice(line, 874, 923)
  const ownerState = slice(line, 924, 973)
  const ownerZipRaw = slice(line, 979, 983)
  const appraisedVal = parseNum(slice(line, 1916, 1930))
  const assessedVal = parseNum(slice(line, 1946, 1960))
  const marketVal = parseNum(slice(line, 4214, 4227))
  const hsExempt = slice(line, 2609, 2609)
  const deedDt = slice(line, 2034, 2058)
  const situsZip = slice(line, 1140, 1149).slice(0, 5)

  const ownerZip = ownerZipRaw.slice(0, 5)
  const ownerZipDiff = Boolean(ownerZip && ownerZip !== situsZip)
  const ownerOutOfTx = Boolean(ownerState && ownerState.toUpperCase() !== 'TX')
  const isAbsentee = ownerZipDiff || ownerOutOfTx

  const mailParts = [ownerAddr1, ownerAddr2, ownerCity, ownerState, ownerZip].filter(Boolean)

  return {
    id: propId,
    tcad_prop_id: tcadPropId || null,
    tcad_geo_id: geoId || null,
    owner_name: ownerName || null,
    owner_mailing_address: mailParts.length > 0 ? mailParts.join(', ') : null,
    is_absentee: isAbsentee,
    has_homestead_exemption: hsExempt === 'T' || hsExempt === 'Y',
    market_value: marketVal,
    appraised_value: appraisedVal,
    tax_assessed_value: assessedVal,
    deed_date: parseTcadDate(deedDt),
    tcad_updated_at: new Date().toISOString(),
  }
}

async function flush(supabase: SupabaseClient, batch: TcadUpdate[]): Promise<number> {
  if (batch.length === 0) return 0
  const { error } = await supabase.from('properties').upsert(batch, { onConflict: 'id' })
  if (error) {
    console.error('  ✗ batch failed:', error.message)
    return 0
  }
  return batch.length
}

// ============================================================
// Main
// ============================================================

async function main() {
  const runStart = Date.now()
  loadEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL + service role key required')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const propertyFile = ensureTcadFile()
  console.log('→ loading property keys from DB')
  const propMap = await loadOurPropertyKeys(supabase)
  console.log(`  ${propMap.size.toLocaleString()} properties in DB`)

  console.log(`→ streaming ${propertyFile}`)
  const stream = fs.createReadStream(propertyFile, { encoding: 'utf8', highWaterMark: 1024 * 256 })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let totalLines = 0
  let matched = 0
  let updated = 0
  let batch: TcadUpdate[] = []

  for await (const line of rl) {
    totalLines++
    if (totalLines % 50_000 === 0) {
      const elapsed = ((Date.now() - runStart) / 1000).toFixed(0)
      console.log(
        `  processed ${totalLines.toLocaleString()} TCAD rows, ${matched.toLocaleString()} matches, ${updated.toLocaleString()} updated (${elapsed}s)`,
      )
    }

    const situsNum = slice(line, 4460, 4474)
    const situsPrefix = slice(line, 1040, 1049)
    const situsStreet = slice(line, 1050, 1099)
    const situsSuffix = slice(line, 1100, 1109)
    const situsZip = slice(line, 1140, 1149)

    const matchKey = tcadAddressKey(situsNum, situsPrefix, situsStreet, situsSuffix, situsZip)
    if (!matchKey) continue

    const propId = propMap.get(matchKey)
    if (!propId) continue

    matched++
    batch.push(buildUpdate(line, propId))

    if (batch.length >= BATCH_SIZE) {
      updated += await flush(supabase, batch)
      batch = []
    }
  }

  updated += await flush(supabase, batch)

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1)
  console.log('\n✓ DONE')
  console.log(`  TCAD rows scanned: ${totalLines.toLocaleString()}`)
  console.log(`  matched our DB:    ${matched.toLocaleString()}`)
  console.log(`  updated:           ${updated.toLocaleString()}`)
  console.log(`  duration:          ${elapsed}s`)
}

main().catch(err => {
  console.error('Ingester failed:', err)
  process.exit(1)
})

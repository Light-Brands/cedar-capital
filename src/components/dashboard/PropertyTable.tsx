'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import ScoreBadge from './ScoreBadge'
import { scoreToBadge } from '@/lib/analysis/badge'
import { classifyUnitType, isParcelMismatchLikely, isMultiUnit } from '@/lib/analysis/property-classifier'
import { classifyOwner } from '@/lib/analysis/owner-classifier'
import { toCsv, downloadCsv, type CsvColumn } from '@/lib/csv'

/**
 * Kelly's 36-column deal row.
 * Every column from her "Fixer-Upper Deal Flow System" spec is present;
 * column visibility is toggleable to keep the default view readable.
 */

export interface FullPropertyRow {
  id: string
  // properties
  address: string
  city: string
  zip_code: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  lot_size: number | null
  asking_price: number | null
  list_type: string | null
  property_type: string | null
  market_value: number | null
  source: string | null
  link: string | null
  days_on_market: number | null
  created_at: string
  listing_status: string | null
  review_status: string | null
  agent_name: string | null
  agent_phone: string | null
  agent_email: string | null
  owner_name: string | null
  owner_mailing_address: string | null
  is_absentee: boolean | null
  has_homestead_exemption: boolean | null
  distress_signal: string | null
  special_features: string[] | null
  notes: string | null
  // analyses (array because of the Supabase relation; we take [0])
  analyses: Array<{
    offer_price: number | null
    arv: number | null
    arv_per_sqft: number | null
    diff: number | null
    rehab_total: number | null
    selling_costs: number | null
    total_cost: number | null
    est_profit: number | null
    monthly_payment: number | null
    months_held: number | null
    profit_with_finance: number | null
    roi: number | null
    mao: number | null
    wholesale_profit: number | null
    deal_score: string | null
    deal_score_numeric: number | null
    comp_addresses: string[] | null
    comp_prices: number[] | null
    comp_avg_per_sqft: number | null
    discount_pct: number | null
    total_in: number | null
    gross_profit: number | null
    verified: boolean | null
  }> | null
}

interface Props {
  rows: FullPropertyRow[]
  sortColumn?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onReviewStatusChange?: (id: string, status: string) => void
  onEnriched?: (id: string, source: 'batchdata' | 'rentcast_avm', result: EnrichmentResult) => void
}

export interface EnrichmentResult {
  ok: boolean
  source?: string
  message?: string
  error?: string
  owner?: {
    name?: string
    phones?: string[]
    emails?: string[]
    isAbsentee?: boolean
    ownershipLengthYears?: number
    estimatedEquity?: number
  }
  distress?: string | null
  compCount?: number
  estimatedARV?: number
  verified?: boolean
  reanalysis?: {
    arv: number
    roi: number
    mao: number
    wholesale_profit: number
    discount_pct: number | null
    verified: boolean
    deal_score_numeric: number
    badge: string | null
  } | null
}

// ============================================================
// Formatting helpers
// ============================================================

const fmtUSD = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '-'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtUSDCompact = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '-'
    : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const fmtPct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? '-' : `${n.toFixed(digits)}%`

const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : n.toLocaleString()

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const isNew24h = (iso: string | null) => {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000
}

// ============================================================
// Column definitions — Kelly's 36 columns, in her order
// ============================================================

interface ColumnDef {
  key: string // Kelly's number + short name, used for sort + visibility
  header: string
  defaultVisible: boolean
  sortable?: boolean
  width?: string // min-width CSS, e.g. '120px'
  render: (row: FullPropertyRow) => React.ReactNode
  csv: (row: FullPropertyRow) => string | number | null
}

function listSqft(p: FullPropertyRow): number | null {
  if (!p.asking_price || !p.sqft) return null
  return Math.round(p.asking_price / p.sqft)
}

const COLUMNS: ColumnDef[] = [
  // 1 — Property Address (sticky, always visible)
  {
    key: 'address',
    header: 'Address',
    defaultVisible: true,
    sortable: true,
    width: '240px',
    render: (p) => {
      const unitType = classifyUnitType({
        property_type: p.property_type,
        address: p.address,
        lot_size: p.lot_size,
        sqft: p.sqft,
        beds: p.beds,
      })
      const mismatch = isParcelMismatchLikely(unitType, p.market_value, p.asking_price)
      return (
        <div className="relative">
          {isNew24h(p.created_at) && (
            <span className="absolute -left-2 -top-1 text-[10px] bg-cedar-green text-cream px-1.5 py-0.5 rounded font-semibold">🆕</span>
          )}
          <Link href={`/dashboard/properties/${p.id}`} className="font-medium text-cedar-green hover:underline block">
            {p.address}
          </Link>
          <span className="flex items-center gap-1 mt-0.5 text-[10px]">
            <span className={clsx(
              'px-1 py-0.5 rounded font-medium border',
              unitType === 'SFR' ? 'bg-cedar-green/10 text-cedar-green border-cedar-green/20' :
              isMultiUnit(unitType) ? 'bg-capital-gold/15 text-capital-gold border-capital-gold/30' :
              'bg-stone-100 text-stone-600 border-stone-300',
            )}>
              {unitType}
            </span>
            {mismatch && (
              <span
                title="TCAD market value looks like a whole-building parcel, not this unit — ARV may be inflated. Run Comps for a real sold-comp estimate."
                className="px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-medium"
              >
                ⚠ Parcel?
              </span>
            )}
          </span>
        </div>
      )
    },
    csv: (p) => p.address,
  },
  // Type column — adapter value with classifier fallback (hidden by default)
  {
    key: 'unit_type',
    header: 'Type',
    defaultVisible: false,
    sortable: false,
    render: (p) => {
      const t = classifyUnitType({
        property_type: p.property_type,
        address: p.address,
        lot_size: p.lot_size,
        sqft: p.sqft,
        beds: p.beds,
      })
      return <span className="text-xs text-charcoal/70">{t}</span>
    },
    csv: (p) => classifyUnitType({
      property_type: p.property_type,
      address: p.address,
      lot_size: p.lot_size,
      sqft: p.sqft,
      beds: p.beds,
    }),
  },
  // 2 — City / Zip
  { key: 'city_zip', header: 'City / Zip', defaultVisible: true, render: (p) => <span className="text-charcoal/70">{p.city}{p.zip_code ? ` ${p.zip_code}` : ''}</span>, csv: (p) => `${p.city} ${p.zip_code ?? ''}` },
  // 3 — Notes (special features)
  {
    key: 'notes',
    header: 'Notes',
    defaultVisible: false,
    render: (p) => {
      const feats = p.special_features ?? []
      if (feats.length === 0 && !p.notes) return <span className="text-charcoal/40">-</span>
      return <span className="text-xs">{feats.join(', ')}{p.notes ? ` · ${p.notes}` : ''}</span>
    },
    csv: (p) => [(p.special_features ?? []).join(', '), p.notes].filter(Boolean).join(' · '),
  },
  // 4 — Date
  { key: 'date', header: 'Date', defaultVisible: true, sortable: true, render: (p) => <span className="text-charcoal/60 text-xs">{fmtDate(p.created_at)}</span>, csv: (p) => fmtDate(p.created_at) },
  // 5 — Link
  {
    key: 'link',
    header: 'Link',
    defaultVisible: true,
    render: (p) => p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="text-cedar-green hover:underline text-xs">↗</a> : <span className="text-charcoal/40">-</span>,
    csv: (p) => p.link ?? '',
  },
  // 6 — List Type
  {
    key: 'list_type',
    header: 'List Type',
    defaultVisible: true,
    sortable: true,
    render: (p) => p.list_type ? (
      <span className={clsx('text-xs px-2 py-0.5 rounded-full', p.list_type === 'FSBO' ? 'bg-capital-gold/20 text-capital-gold font-semibold' : 'bg-sand text-charcoal/70')}>
        {p.list_type}
      </span>
    ) : <span className="text-charcoal/40">-</span>,
    csv: (p) => p.list_type ?? '',
  },
  // 7 — Beds
  { key: 'beds', header: 'Bd', defaultVisible: true, sortable: true, render: (p) => <span>{p.beds ?? '-'}</span>, csv: (p) => p.beds },
  // 8 — Baths
  { key: 'baths', header: 'Ba', defaultVisible: true, sortable: true, render: (p) => <span>{p.baths ?? '-'}</span>, csv: (p) => p.baths },
  // 9 — SqFt
  { key: 'sqft', header: 'SqFt', defaultVisible: true, sortable: true, render: (p) => <span>{fmtNum(p.sqft)}</span>, csv: (p) => p.sqft },
  // 10 — Asking Price
  { key: 'asking_price', header: 'Asking', defaultVisible: true, sortable: true, render: (p) => <span className="font-medium">{fmtUSD(p.asking_price)}</span>, csv: (p) => p.asking_price },
  // 11 — Offer
  { key: 'offer', header: 'Offer', defaultVisible: false, sortable: true, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.offer_price)}</span>, csv: (p) => p.analyses?.[0]?.offer_price ?? null },
  // 12 — List $/sqft
  { key: 'list_per_sqft', header: 'List $/sf', defaultVisible: false, sortable: true, render: (p) => <span>{fmtUSD(listSqft(p))}</span>, csv: (p) => listSqft(p) },
  // 13 — Nbhd Avg $/sqft
  { key: 'comp_avg', header: 'Nbhd $/sf', defaultVisible: false, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.comp_avg_per_sqft)}</span>, csv: (p) => p.analyses?.[0]?.comp_avg_per_sqft ?? null },
  // 14 — Discount %
  { key: 'discount_pct', header: 'Discount %', defaultVisible: true, sortable: true, render: (p) => {
    const v = p.analyses?.[0]?.discount_pct
    return <span className={clsx('font-semibold', (v ?? 0) > 20 ? 'text-emerald-700' : 'text-charcoal')}>{fmtPct(v)}</span>
  }, csv: (p) => p.analyses?.[0]?.discount_pct ?? null },
  // 15 — Est. Reno
  { key: 'rehab', header: 'Est. Reno', defaultVisible: false, sortable: true, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.rehab_total)}</span>, csv: (p) => p.analyses?.[0]?.rehab_total ?? null },
  // 16 — Total In
  { key: 'total_in', header: 'Total In', defaultVisible: false, sortable: true, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.total_in)}</span>, csv: (p) => p.analyses?.[0]?.total_in ?? null },
  // 17 — Est. ARV
  { key: 'arv', header: 'ARV', defaultVisible: false, sortable: true, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.arv)}</span>, csv: (p) => p.analyses?.[0]?.arv ?? null },
  // 18 — ARV $/sqft
  { key: 'arv_per_sqft', header: 'ARV $/sf', defaultVisible: false, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.arv_per_sqft)}</span>, csv: (p) => p.analyses?.[0]?.arv_per_sqft ?? null },
  // 19 — Gross Profit
  { key: 'gross_profit', header: 'Gross Profit', defaultVisible: false, sortable: true, render: (p) => <span className="text-charcoal">{fmtUSD(p.analyses?.[0]?.gross_profit)}</span>, csv: (p) => p.analyses?.[0]?.gross_profit ?? null },
  // 20 — Est. Selling Costs
  { key: 'selling_costs', header: 'Selling', defaultVisible: false, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.selling_costs)}</span>, csv: (p) => p.analyses?.[0]?.selling_costs ?? null },
  // 21 — Monthly Payment 12%
  { key: 'monthly_payment', header: 'Mo. Pmt', defaultVisible: false, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.monthly_payment)}</span>, csv: (p) => p.analyses?.[0]?.monthly_payment ?? null },
  // 22 — Months Held
  { key: 'months_held', header: 'Months', defaultVisible: false, render: (p) => <span>{p.analyses?.[0]?.months_held ?? '-'}</span>, csv: (p) => p.analyses?.[0]?.months_held ?? null },
  // 23 — Total Cost
  { key: 'total_cost', header: 'Total Cost', defaultVisible: false, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.total_cost)}</span>, csv: (p) => p.analyses?.[0]?.total_cost ?? null },
  // 24 — Est. Profit
  { key: 'est_profit', header: 'Est. Profit', defaultVisible: false, sortable: true, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.est_profit)}</span>, csv: (p) => p.analyses?.[0]?.est_profit ?? null },
  // 25 — Profit w/ Finance
  { key: 'profit_finance', header: 'Profit w/ Fin.', defaultVisible: false, render: (p) => <span>{fmtUSD(p.analyses?.[0]?.profit_with_finance)}</span>, csv: (p) => p.analyses?.[0]?.profit_with_finance ?? null },
  // 26 — Gross ROI
  { key: 'roi', header: 'ROI', defaultVisible: true, sortable: true, render: (p) => {
    const v = p.analyses?.[0]?.roi
    return <span className={clsx('font-semibold', (v ?? 0) > 25 ? 'text-emerald-700' : (v ?? 0) > 0 ? 'text-amber-700' : 'text-charcoal')}>{fmtPct(v)}</span>
  }, csv: (p) => p.analyses?.[0]?.roi ?? null },
  // 27 — DOM
  { key: 'dom', header: 'DOM', defaultVisible: false, sortable: true, render: (p) => <span>{p.days_on_market ?? '-'}</span>, csv: (p) => p.days_on_market ?? null },
  // 28 — MAO
  { key: 'mao', header: 'MAO', defaultVisible: true, sortable: true, render: (p) => <span className="font-medium">{fmtUSD(p.analyses?.[0]?.mao)}</span>, csv: (p) => p.analyses?.[0]?.mao ?? null },
  // 29 — Wholesale Profit
  { key: 'wholesale_profit', header: 'Spread', defaultVisible: true, sortable: true, render: (p) => {
    const v = p.analyses?.[0]?.wholesale_profit
    return <span className={clsx('font-semibold', (v ?? 0) > 10000 ? 'text-emerald-700' : 'text-charcoal')}>{fmtUSD(v)}</span>
  }, csv: (p) => p.analyses?.[0]?.wholesale_profit ?? null },
  // 30/31/32 — Comps 1-3
  ...[0, 1, 2].map((i): ColumnDef => ({
    key: `comp_${i+1}`,
    header: `Comp ${i+1}`,
    defaultVisible: false,
    render: (p) => {
      const addr = p.analyses?.[0]?.comp_addresses?.[i]
      const price = p.analyses?.[0]?.comp_prices?.[i]
      if (!addr) return <span className="text-charcoal/40">-</span>
      return <span className="text-xs">{addr}{price ? ` · ${fmtUSDCompact(price)}` : ''}</span>
    },
    csv: (p) => {
      const addr = p.analyses?.[0]?.comp_addresses?.[i]
      const price = p.analyses?.[0]?.comp_prices?.[i]
      return addr ? `${addr}${price ? ` @ ${price}` : ''}` : ''
    },
  })),
  // 33 — Verified?
  { key: 'verified', header: 'Verified', defaultVisible: false, render: (p) => {
    const v = p.analyses?.[0]?.verified
    if (v === true) return <span className="text-emerald-600">✓</span>
    if (v === false) return <span className="text-amber-600" title="Fewer than 3 comps found">⚠</span>
    return <span className="text-charcoal/40">-</span>
  }, csv: (p) => p.analyses?.[0]?.verified ? 'verified' : (p.analyses?.[0]?.verified === false ? 'unverified' : '') },
  // 34 — Source
  { key: 'source', header: 'Source', defaultVisible: true, sortable: true, render: (p) => <span className="text-xs text-charcoal/60 font-mono">{p.source ?? '-'}</span>, csv: (p) => p.source ?? '' },
  // 35 — Owner / Agent Contact
  { key: 'agent', header: 'Agent', defaultVisible: false, render: (p) => {
    const name = p.agent_name
    const phone = p.agent_phone
    if (!name && !phone) return <span className="text-charcoal/40">-</span>
    return <span className="text-xs">{name}{phone ? ` · ${phone}` : ''}</span>
  }, csv: (p) => [p.agent_name, p.agent_phone, p.agent_email].filter(Boolean).join(' · ') },
  // 35b — Owner of record (from TCAD). Most workable signal for cold outreach.
  {
    key: 'owner',
    header: 'Owner',
    defaultVisible: true,
    width: '220px',
    render: (p) => {
      if (!p.owner_name) return <span className="text-charcoal/40 text-xs">-</span>
      const type = classifyOwner(p.owner_name)
      const badgeClass =
        type === 'Individual' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
        type === 'Trust'      ? 'bg-capital-gold/15 text-capital-gold border-capital-gold/30' :
        type === 'Entity'     ? 'bg-stone-100 text-stone-700 border-stone-300' :
        type === 'Government' ? 'bg-red-50 text-red-700 border-red-200' :
        'bg-stone-50 text-stone-500 border-stone-200'
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-charcoal font-medium truncate" title={p.owner_name}>{p.owner_name}</span>
          <span className="flex items-center gap-1">
            <span className={clsx('text-[10px] px-1 py-0.5 rounded border font-semibold', badgeClass)}>{type}</span>
            {p.is_absentee && <span className="text-[10px] text-capital-gold" title="Absentee owner — mailing address differs from property">✈ abs</span>}
            {p.has_homestead_exemption && <span className="text-[10px] text-stone-500" title="Homestead exemption — primary residence">🏠</span>}
            {p.distress_signal && <span className="text-[10px] bg-red-50 text-red-800 border border-red-200 px-1 rounded" title={p.distress_signal}>⚠ {p.distress_signal}</span>}
          </span>
        </div>
      )
    },
    csv: (p) => p.owner_name ? `${p.owner_name} (${classifyOwner(p.owner_name)})` : '',
  },
  // 36 — Deal Score (badge + number)
  { key: 'deal_score', header: 'Score', defaultVisible: true, sortable: true, width: '180px', render: (p) => {
    const s = p.analyses?.[0]?.deal_score_numeric
    if (s === null || s === undefined) return <span className="text-charcoal/40">-</span>
    return <ScoreBadge score={s} size="sm" />
  }, csv: (p) => {
    const s = p.analyses?.[0]?.deal_score_numeric
    if (s === null || s === undefined) return ''
    return `${scoreToBadge(s) ?? ''} (${s})`
  }},
]

// ============================================================
// Review-status triage chip
// ============================================================

const REVIEW_CYCLE: Record<string, string> = { New: 'Reviewed', Reviewed: 'Contacted', Contacted: 'Dead', Dead: 'New' }
const REVIEW_STYLES: Record<string, string> = {
  New: 'bg-blue-50 text-blue-800 border-blue-200',
  Reviewed: 'bg-cedar-green/10 text-cedar-green border-cedar-green/30',
  Contacted: 'bg-capital-gold/15 text-capital-gold border-capital-gold/30',
  Dead: 'bg-stone-100 text-stone-500 border-stone-300 line-through',
}

// ============================================================
// Per-row enrichment buttons
// ============================================================

type EnrichState = 'idle' | 'loading' | 'done' | 'failed'

function EnrichButtons({
  propertyId,
  onEnriched,
}: {
  propertyId: string
  onEnriched?: (id: string, source: 'batchdata' | 'rentcast_avm', result: EnrichmentResult) => void
}) {
  const [ownerState, setOwnerState] = useState<EnrichState>('idle')
  const [compsState, setCompsState] = useState<EnrichState>('idle')
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  async function trigger(source: 'batchdata' | 'rentcast_avm') {
    const setState = source === 'batchdata' ? setOwnerState : setCompsState
    setState('loading')
    setLastMessage(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/enrich/${source}`, { method: 'POST' })
      const data = (await res.json()) as EnrichmentResult
      if (data.ok) {
        setState('done')
        if (source === 'batchdata') {
          const phones = data.owner?.phones?.length ?? 0
          setLastMessage(`${phones} phone${phones === 1 ? '' : 's'}${data.distress ? ` · ${data.distress}` : ''}`)
        } else {
          setLastMessage(`${data.compCount ?? 0} comps${data.verified ? ' ✓' : ''}`)
        }
      } else {
        setState('failed')
        setLastMessage(data.message ?? data.error ?? 'failed')
      }
      if (onEnriched) onEnriched(propertyId, source, data)
    } catch (err) {
      setState('failed')
      setLastMessage(err instanceof Error ? err.message : 'failed')
    }
  }

  return (
    <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => trigger('batchdata')}
          disabled={ownerState === 'loading'}
          title="Skip trace via BatchData — owner phone, email, distress signals"
          className={clsx(
            'text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors whitespace-nowrap',
            ownerState === 'loading' && 'bg-stone-100 text-stone-500 border-stone-300',
            ownerState === 'idle' && 'bg-white text-cedar-green border-cedar-green/30 hover:bg-cedar-green/5',
            ownerState === 'done' && 'bg-emerald-50 text-emerald-800 border-emerald-300',
            ownerState === 'failed' && 'bg-red-50 text-red-700 border-red-300',
          )}
        >
          {ownerState === 'loading' ? '…' : ownerState === 'done' ? '✓' : ownerState === 'failed' ? '✕' : '📞'} Owner
        </button>
        <button
          type="button"
          onClick={() => trigger('rentcast_avm')}
          disabled={compsState === 'loading'}
          title="Rentcast AVM — real sold comps within 0.5 mi, refined ARV, verified flag"
          className={clsx(
            'text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors whitespace-nowrap',
            compsState === 'loading' && 'bg-stone-100 text-stone-500 border-stone-300',
            compsState === 'idle' && 'bg-white text-cedar-green border-cedar-green/30 hover:bg-cedar-green/5',
            compsState === 'done' && 'bg-emerald-50 text-emerald-800 border-emerald-300',
            compsState === 'failed' && 'bg-red-50 text-red-700 border-red-300',
          )}
        >
          {compsState === 'loading' ? '…' : compsState === 'done' ? '✓' : compsState === 'failed' ? '✕' : '📊'} Comps
        </button>
      </div>
      {lastMessage && <span className="text-[10px] text-charcoal/60">{lastMessage}</span>}
    </div>
  )
}

function ReviewChip({ status, onCycle }: { status: string | null; onCycle: () => void }) {
  const s = status ?? 'New'
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle() }}
      className={clsx(
        'text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-md border cursor-pointer hover:opacity-80 transition-opacity',
        REVIEW_STYLES[s] ?? REVIEW_STYLES.New,
      )}
      title="Click to cycle: New → Reviewed → Contacted → Dead"
    >
      {s}
    </button>
  )
}

// ============================================================
// Main table
// ============================================================

export default function PropertyTable({ rows, sortColumn, sortOrder, onSort, onReviewStatusChange, onEnriched }: Props) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  )
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  const visibleColumns = useMemo(() => COLUMNS.filter(c => visible.has(c.key)), [visible])

  function toggleCol(key: string) {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleReviewCycle(id: string, current: string | null) {
    const next = REVIEW_CYCLE[current ?? 'New'] ?? 'Reviewed'
    onReviewStatusChange?.(id, next)
  }

  function exportCsv() {
    const csvCols: CsvColumn<FullPropertyRow>[] = [
      { header: 'Review Status', accessor: (r) => r.review_status ?? 'New' },
      ...COLUMNS.map<CsvColumn<FullPropertyRow>>((c) => ({ header: c.header, accessor: c.csv })),
    ]
    const content = toCsv(rows, csvCols)
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`cedar-capital-deals-${today}.csv`, content)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowColumnPicker(v => !v)}
            className="text-xs font-medium px-3 py-1.5 bg-white border border-stone/40 rounded-md hover:bg-sand/50"
          >
            Columns ({visibleColumns.length}/{COLUMNS.length})
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="text-xs font-medium px-3 py-1.5 bg-white border border-cedar-green/30 text-cedar-green rounded-md hover:bg-cedar-green/5"
          >
            Export CSV
          </button>
        </div>
        <div className="text-xs text-charcoal/50">{rows.length} rows shown</div>
      </div>

      {/* Column picker */}
      {showColumnPicker && (
        <div className="bg-white border border-stone/30 rounded-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-charcoal/70 uppercase tracking-wide">Column Visibility</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setVisible(new Set(COLUMNS.map(c => c.key)))} className="text-xs text-cedar-green hover:underline">Show all</button>
              <button type="button" onClick={() => setVisible(new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key)))} className="text-xs text-charcoal/60 hover:text-charcoal">Reset</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 text-xs">
            {COLUMNS.map(c => (
              <label key={c.key} className="flex items-center gap-1.5 cursor-pointer hover:bg-sand/30 px-1.5 py-1 rounded">
                <input type="checkbox" checked={visible.has(c.key)} onChange={() => toggleCol(c.key)} className="accent-cedar-green" />
                <span>{c.header}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-stone/30 rounded-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sand/40">
            <tr className="border-b border-stone/30">
              <th className="text-left py-2 px-3 font-heading font-semibold text-charcoal/70 text-xs uppercase tracking-wide">Triage</th>
              <th className="text-left py-2 px-3 font-heading font-semibold text-charcoal/70 text-xs uppercase tracking-wide whitespace-nowrap">Enrich</th>
              {visibleColumns.map(col => {
                const isSorted = sortColumn === col.key
                return (
                  <th
                    key={col.key}
                    style={col.width ? { minWidth: col.width } : undefined}
                    className={clsx(
                      'text-left py-2 px-3 font-heading font-semibold text-charcoal/70 text-xs uppercase tracking-wide whitespace-nowrap',
                      col.sortable && 'cursor-pointer hover:text-cedar-green',
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.header}
                      {isSorted && <span className="text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-stone/10 hover:bg-sand/20 transition-colors">
                <td className="py-2 px-3 align-top">
                  <ReviewChip status={row.review_status} onCycle={() => handleReviewCycle(row.id, row.review_status)} />
                </td>
                <td className="py-2 px-3 align-top">
                  <EnrichButtons propertyId={row.id} onEnriched={onEnriched} />
                </td>
                {visibleColumns.map(col => (
                  <td key={col.key} className="py-2 px-3 align-top whitespace-nowrap">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="py-12 text-center text-charcoal/50">
                  No properties match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

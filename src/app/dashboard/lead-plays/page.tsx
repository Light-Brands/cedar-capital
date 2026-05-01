'use client'

/**
 * /dashboard/lead-plays
 *
 * One page, six tabs — each backed by a SQL view from
 * scripts/build-lead-categorization-views.sql:
 *   reo_leads, short_sale_leads, equity_rich_leads,
 *   free_and_clear_leads, corporate_owner_leads, multi_property_owners
 *
 * Each tab is its own outreach playbook. The whole point is operator
 * efficiency: pick a play, see its leads, click into a property, work it.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'
import { LEAD_PLAY_DESCRIPTION, LEAD_PLAY_TONE } from '@/lib/lead-plays'

type Tab = 'reo' | 'short_sale' | 'equity_rich' | 'free_and_clear' | 'corporate_owner' | 'multi_owner'

const TABS: { id: Tab; label: string; view: string; sortKey: string; description: string }[] = [
  { id: 'reo',             label: 'REO',            view: 'reo_leads',             sortKey: 'upside_pct',     description: LEAD_PLAY_DESCRIPTION.reo },
  { id: 'short_sale',      label: 'Short Sale',     view: 'short_sale_leads',      sortKey: 'underwater_pct', description: LEAD_PLAY_DESCRIPTION.short_sale },
  { id: 'equity_rich',     label: 'Equity Rich',    view: 'equity_rich_leads',     sortKey: 'mortgage_age',   description: LEAD_PLAY_DESCRIPTION.equity_rich },
  { id: 'free_and_clear',  label: 'Free & Clear',   view: 'free_and_clear_leads',  sortKey: 'upside_pct',     description: LEAD_PLAY_DESCRIPTION.free_and_clear },
  { id: 'corporate_owner', label: 'Corporate',      view: 'corporate_owner_leads', sortKey: 'arv_mid',        description: LEAD_PLAY_DESCRIPTION.corporate_owner },
  { id: 'multi_owner',     label: 'Multi-Owner',    view: 'multi_property_owners', sortKey: 'total_arv',      description: 'Owners holding 2+ properties — single conversation, multiple deals.' },
]

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function LeadPlaysPage() {
  const [tab, setTab] = useState<Tab>('reo')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const tabConfig = useMemo(() => TABS.find((t) => t.id === tab)!, [tab])

  useEffect(() => {
    async function loadCounts() {
      const result = await Promise.all(
        TABS.map(async (t) => {
          const { count } = await supabase.from(t.view).select('*', { count: 'exact', head: true })
          return [t.id, count ?? 0] as const
        }),
      )
      setCounts(Object.fromEntries(result))
    }
    loadCounts()
  }, [])

  useEffect(() => {
    async function loadRows() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from(tabConfig.view)
        .select('*')
        .order(tabConfig.sortKey, { ascending: false, nullsFirst: false })
        .limit(200)
      if (err) setError(err.message)
      else setRows((data ?? []) as Record<string, unknown>[])
      setLoading(false)
    }
    loadRows()
  }, [tabConfig])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-cedar-green">Lead Plays</h1>
        <p className="text-charcoal/60 mt-1 text-sm max-w-3xl">
          Six wholesale archetypes derived from ATTOM owner + mortgage data. Each tab is its own
          playbook. Click into a property to work the deal.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex flex-wrap gap-2 border-b border-stone/30">
        {TABS.map((t) => {
          const active = t.id === tab
          const count = counts[t.id] ?? 0
          const tone = active
            ? 'bg-cedar-green text-cream border-cedar-green'
            : 'bg-white text-charcoal/70 border-stone/30 hover:bg-sand/40'
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-0 text-sm font-medium transition-colors',
                tone,
              )}
            >
              <span>{t.label}</span>
              <span className={clsx(
                'px-1.5 py-0.5 rounded text-[10px] font-bold',
                active ? 'bg-cream/20' : 'bg-stone-100 text-stone-700',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Description for current tab */}
      <div className={clsx(
        'rounded-card border p-3 text-sm',
        tab === 'reo' || tab === 'short_sale' ? LEAD_PLAY_TONE.reo : 'bg-cedar-green/5 border-cedar-green/20 text-cedar-green',
      )}>
        {tabConfig.description}
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-800 rounded-card p-3 text-sm">{error}</div>}
      {loading && <div className="text-charcoal/50 text-center py-12">Loading {tabConfig.label}…</div>}

      {!loading && rows.length === 0 && (
        <div className="text-charcoal/50 text-center py-12">
          No {tabConfig.label} leads yet — runs against the SQL view; populate more ATTOM data to fill it.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white border border-stone/30 rounded-card overflow-x-auto">
          {tab === 'reo' && <ReoTable rows={rows} />}
          {tab === 'short_sale' && <ShortSaleTable rows={rows} />}
          {tab === 'equity_rich' && <EquityRichTable rows={rows} />}
          {tab === 'free_and_clear' && <FreeAndClearTable rows={rows} />}
          {tab === 'corporate_owner' && <CorporateOwnerTable rows={rows} />}
          {tab === 'multi_owner' && <MultiOwnerTable rows={rows} />}
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={clsx(
      'px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide bg-sand/30',
      align === 'right' ? 'text-right' : 'text-left',
    )}>
      {children}
    </th>
  )
}

function PropertyLink({ id, address, zip }: { id: string; address: string; zip: string | null }) {
  return (
    <td className="px-3 py-2">
      <Link href={`/dashboard/properties/${id}`} className="text-cedar-green hover:underline font-medium">
        {address}
      </Link>
      <div className="text-[10px] text-charcoal/50">{zip}</div>
    </td>
  )
}

function UpsideCell({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <td className="px-3 py-2 text-right text-charcoal/40">—</td>
  return (
    <td className={clsx(
      'px-3 py-2 text-right font-bold',
      pct >= 100 ? 'text-emerald-700' :
      pct >= 50 ? 'text-emerald-600' :
      pct >= 20 ? 'text-amber-700' :
      pct >= 0 ? 'text-charcoal/70' : 'text-red-700',
    )}>
      {pct >= 0 ? '+' : ''}{pct}%
    </td>
  )
}

function ReoTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr>
        <Th>Property</Th><Th>REO Class</Th><Th>Owner</Th>
        <Th align="right">Asking</Th><Th align="right">ARV mid</Th><Th align="right">Upside</Th>
        <Th>Prior Loan</Th><Th>Prior Lender</Th>
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-stone/15 hover:bg-cream/40">
          <PropertyLink id={String(r.id)} address={String(r.address)} zip={r.zip_code as string} />
          <td className="px-3 py-2"><span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-300 font-bold uppercase">{String(r.reo_class)}</span></td>
          <td className="px-3 py-2 text-xs text-charcoal/70 max-w-[180px] truncate">{String(r.owner)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.asking_price as number)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.arv_mid as number)}</td>
          <UpsideCell pct={r.upside_pct as number} />
          <td className="px-3 py-2 text-xs">{fmtUSD(r.prior_loan as number)}</td>
          <td className="px-3 py-2 text-xs text-charcoal/60 truncate max-w-[150px]">{(r.prior_lender as string) ?? '—'}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function ShortSaleTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr>
        <Th>Property</Th><Th>Owner</Th>
        <Th align="right">Asking</Th><Th align="right">Mortgage</Th><Th align="right">Underwater</Th>
        <Th align="right">ARV mid</Th><Th>Lender</Th>
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-stone/15 hover:bg-cream/40">
          <PropertyLink id={String(r.id)} address={String(r.address)} zip={r.zip_code as string} />
          <td className="px-3 py-2 text-xs text-charcoal/70 max-w-[180px] truncate">{String(r.owner)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.asking_price as number)}</td>
          <td className="px-3 py-2 text-right text-red-700 font-medium">{fmtUSD(r.mortgage as number)}</td>
          <td className="px-3 py-2 text-right text-red-700 font-bold">{r.underwater_pct as number}%</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.arv_mid as number)}</td>
          <td className="px-3 py-2 text-xs text-charcoal/60 truncate max-w-[150px]">{(r.lender as string) ?? '—'}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function EquityRichTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr>
        <Th>Property</Th><Th>Owner</Th>
        <Th align="right">Mtg Age</Th><Th align="right">Original</Th>
        <Th align="right">Asking</Th><Th align="right">ARV mid</Th><Th align="right">Upside</Th>
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-stone/15 hover:bg-cream/40">
          <PropertyLink id={String(r.id)} address={String(r.address)} zip={r.zip_code as string} />
          <td className="px-3 py-2 text-xs text-charcoal/70 max-w-[180px] truncate">{String(r.owner)}</td>
          <td className="px-3 py-2 text-right text-emerald-700 font-bold">{r.mortgage_age as number}y</td>
          <td className="px-3 py-2 text-right text-xs">{fmtUSD(r.original_loan as number)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.asking_price as number)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.arv_mid as number)}</td>
          <UpsideCell pct={r.upside_pct as number} />
        </tr>
      ))}</tbody>
    </table>
  )
}

function FreeAndClearTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr>
        <Th>Property</Th><Th>Owner</Th><Th>Type</Th>
        <Th align="right">Asking</Th><Th align="right">ARV mid</Th><Th align="right">Upside</Th>
        <Th>Absent</Th><Th>Cond</Th>
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-stone/15 hover:bg-cream/40">
          <PropertyLink id={String(r.id)} address={String(r.address)} zip={r.zip_code as string} />
          <td className="px-3 py-2 text-xs text-charcoal/70 max-w-[180px] truncate">{String(r.owner)}</td>
          <td className="px-3 py-2 text-xs text-charcoal/60">{(r.owner_type as string) ?? '—'}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.asking_price as number)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.arv_mid as number)}</td>
          <UpsideCell pct={r.upside_pct as number} />
          <td className="px-3 py-2 text-xs">{r.absentee === 'ABSENTEE' ? '✈ Absentee' : (r.absentee as string)?.split('(')[0] ?? '—'}</td>
          <td className="px-3 py-2 text-xs text-charcoal/60">{(r.condition as string) ?? '—'}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function CorporateOwnerTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr>
        <Th>Property</Th><Th>Owner</Th><Th>Type</Th>
        <Th align="right">Asking</Th><Th align="right">ARV mid</Th><Th align="right">Upside</Th>
        <Th align="right">Mortgage</Th>
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-stone/15 hover:bg-cream/40">
          <PropertyLink id={String(r.id)} address={String(r.address)} zip={r.zip_code as string} />
          <td className="px-3 py-2 text-xs text-charcoal/70 max-w-[180px] truncate">{String(r.owner)}</td>
          <td className="px-3 py-2"><span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-300 font-bold uppercase">{String(r.entity_type)}</span></td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.asking_price as number)}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.arv_mid as number)}</td>
          <UpsideCell pct={r.upside_pct as number} />
          <td className="px-3 py-2 text-right text-xs">{fmtUSD(r.mortgage as number)}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function MultiOwnerTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr>
        <Th>Owner</Th><Th align="right">Holdings</Th>
        <Th align="right">Avg Asking</Th><Th align="right">Total ARV</Th><Th align="right">Avg Upside</Th>
        <Th>Sample Properties</Th>
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-stone/15 hover:bg-cream/40">
          <td className="px-3 py-2 font-medium text-charcoal max-w-[220px] truncate">{String(r.owner)}</td>
          <td className="px-3 py-2 text-right font-bold text-cedar-green">{r.holdings as number}</td>
          <td className="px-3 py-2 text-right">{fmtUSD(r.avg_asking as number)}</td>
          <td className="px-3 py-2 text-right text-emerald-700 font-medium">{fmtUSD(r.total_arv as number)}</td>
          <UpsideCell pct={r.avg_upside_pct as number} />
          <td className="px-3 py-2 text-[10px] text-charcoal/60">
            {(r.sample_addresses as string[] | null)?.slice(0, 3).join(' · ') ?? '—'}
          </td>
        </tr>
      ))}</tbody>
    </table>
  )
}

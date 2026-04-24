'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'
import { normalizeRelations } from '@/lib/supabase/normalize'
import type { Property, Analysis, Lead, PipelineEntry, OutreachLogEntry } from '@/lib/supabase/types'
import ScoreBadge from '@/components/dashboard/ScoreBadge'
import AnalysisPanel from '@/components/dashboard/AnalysisPanel'
import { classifyUnitType, isParcelMismatchLikely, isMultiUnit } from '@/lib/analysis/property-classifier'
import { classifyOwner } from '@/lib/analysis/owner-classifier'
import { toZillowUrl, toRealtorUrl, toGoogleMapsUrl, toTcadUrl } from '@/lib/external-links'
import type { DealBadge } from '@/lib/analysis/badge'

interface FullProperty extends Property {
  analyses: Analysis[]
  leads: Lead[]
  pipeline: PipelineEntry[]
  outreach_log: OutreachLogEntry[]
}

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtBool(b: boolean | null | undefined): string {
  if (b === true) return 'Yes'
  if (b === false) return 'No'
  return '—'
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

export default function PropertyDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [property, setProperty] = useState<FullProperty | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'reanalyze' | 'batchdata' | 'rentcast_avm' | null>(null)
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null)

  async function loadProperty() {
    const { data } = await supabase
      .from('properties')
      .select(`*, analyses(*), leads(*), pipeline(*), outreach_log(*)`)
      .eq('id', id)
      .maybeSingle()

    if (!data) {
      setLoading(false)
      return
    }
    // Normalize to array shape — UNIQUE constraints on analyses/leads/pipeline
    // make PostgREST return them as objects or null.
    const normalized = normalizeRelations(
      [data as unknown as Record<string, unknown>],
      ['analyses', 'leads', 'pipeline', 'outreach_log'],
    )[0] as unknown as FullProperty
    setProperty(normalized)
    setLoading(false)
  }

  useEffect(() => { loadProperty() }, [id])

  async function triggerEnrich(source: 'batchdata' | 'rentcast_avm' | 'reanalyze') {
    setAction(source)
    setEnrichMsg(null)
    try {
      const path = source === 'reanalyze'
        ? `/api/properties/${id}/analyze`
        : `/api/properties/${id}/enrich/${source}`
      const res = await fetch(path, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setEnrichMsg(data.error || data.message || `${source} failed`)
      } else if (source === 'batchdata') {
        const phones = data.owner?.phones?.length ?? 0
        const emails = data.owner?.emails?.length ?? 0
        setEnrichMsg(`${phones} phones · ${emails} emails${data.distress ? ` · ${data.distress}` : ''}`)
      } else if (source === 'rentcast_avm') {
        setEnrichMsg(`${data.compCount ?? 0} comps${data.verified ? ' ✓ verified' : ''}`)
      } else {
        setEnrichMsg('Re-analyzed')
      }
      await loadProperty()
    } catch (err) {
      setEnrichMsg(err instanceof Error ? err.message : 'failed')
    } finally {
      setAction(null)
    }
  }

  async function handleStageChange(stage: string) {
    if (!property) return
    const pipeline = property.pipeline?.[0]
    if (pipeline) {
      await supabase.from('pipeline').update({ stage }).eq('id', pipeline.id)
    } else {
      await supabase.from('pipeline').insert({
        property_id: property.id,
        analysis_id: property.analyses?.[0]?.id ?? null,
        stage,
      })
    }
    await loadProperty()
  }

  if (loading) {
    return <div className="text-center py-12 text-charcoal/50">Loading property details...</div>
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-charcoal/50 mb-4">Property not found</p>
        <Link href="/dashboard/properties" className="btn btn-secondary">Back to Properties</Link>
      </div>
    )
  }

  const analysis = property.analyses?.[0]
  const lead = property.leads?.[0]
  const pipeline = property.pipeline?.[0]

  const unitType = classifyUnitType({
    property_type: property.property_type,
    address: property.address,
    lot_size: property.lot_size,
    sqft: property.sqft,
    beds: property.beds,
  })
  const parcelMismatch = isParcelMismatchLikely(unitType, property.market_value, property.asking_price)
  const ownerType = classifyOwner(property.owner_name)

  // Offer-range tiers — same math as the PropertyTable column
  const arv = analysis?.arv ?? 0
  const rehab = analysis?.rehab_total ?? 0
  const offerLow = arv > 0 ? Math.round(arv * 0.65 - rehab) : null
  const offerTarget = arv > 0 ? Math.round(arv * 0.70 - rehab) : null
  const offerMax = arv > 0 ? Math.round(arv * 0.75 - rehab) : null

  const zillowUrl = toZillowUrl(property.address)
  const realtorUrl = toRealtorUrl(property.address)
  const mapsUrl = toGoogleMapsUrl(property.address)
  const tcadUrl = toTcadUrl(property.tcad_prop_id)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-charcoal/50">
        <Link href="/dashboard/properties" className="hover:text-cedar-green">Properties</Link>
        <span>/</span>
        <span className="text-charcoal">{property.address}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            {analysis && <ScoreBadge
              badge={analysis.badge as DealBadge | null}
              score={analysis.deal_score_numeric}
              size="lg"
              showAction
            />}
            <span className={clsx(
              'text-xs px-2 py-1 rounded font-medium border',
              unitType === 'SFR' ? 'bg-cedar-green/10 text-cedar-green border-cedar-green/20' :
              isMultiUnit(unitType) ? 'bg-capital-gold/15 text-capital-gold border-capital-gold/30' :
              'bg-stone-100 text-stone-600 border-stone-300',
            )}>
              {unitType}
            </span>
            {parcelMismatch && (
              <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-300 font-medium" title="TCAD market_value looks like a whole-building parcel, not this unit — ARV may be inflated. Run Comps for a real sold-comp estimate.">
                ⚠ Parcel mismatch
              </span>
            )}
          </div>
          <h1 className="text-2xl font-heading font-bold text-cedar-green break-words">{property.address}</h1>
          <p className="text-charcoal/60 mt-1">
            {property.city}, {property.state} {property.zip_code}
            {property.county && ` · ${property.county} County`}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-charcoal/70 flex-wrap">
            {property.beds != null && <span>{property.beds} bd</span>}
            {property.baths != null && <span>{property.baths} ba</span>}
            {property.sqft && <span>{property.sqft.toLocaleString()} sqft</span>}
            {property.year_built && <span>Built {property.year_built}</span>}
            {property.lot_size && <span>{property.lot_size.toLocaleString()} sqft lot</span>}
            {property.list_type && <span className="text-capital-gold font-medium">{property.list_type}</span>}
          </div>
          {/* Cross-reference links */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {property.link && <a href={property.link} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border border-cedar-green/30 text-cedar-green rounded hover:bg-cedar-green/5">Source ↗</a>}
            {zillowUrl && <a href={zillowUrl} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border border-cedar-green/30 text-cedar-green rounded hover:bg-cedar-green/5">Zillow</a>}
            {realtorUrl && <a href={realtorUrl} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border border-cedar-green/30 text-cedar-green rounded hover:bg-cedar-green/5">Realtor</a>}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border border-cedar-green/30 text-cedar-green rounded hover:bg-cedar-green/5">🗺 Maps</a>}
            {tcadUrl && <a href={tcadUrl} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border border-cedar-green/30 text-cedar-green rounded hover:bg-cedar-green/5">🏛 TCAD</a>}
          </div>
        </div>

        {/* Enrich + Re-analyze buttons */}
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => triggerEnrich('batchdata')}
              disabled={action !== null}
              className="btn btn-secondary text-sm disabled:opacity-50"
              title="BatchData skip-trace — phone, email, distress signals (~$0.10)"
            >
              {action === 'batchdata' ? '…' : '📞'} Owner
            </button>
            <button
              onClick={() => triggerEnrich('rentcast_avm')}
              disabled={action !== null}
              className="btn btn-secondary text-sm disabled:opacity-50"
              title="Rentcast AVM — real sold comps within 0.5mi, refined ARV, verified flag"
            >
              {action === 'rentcast_avm' ? '…' : '📊'} Comps
            </button>
            <button
              onClick={() => triggerEnrich('reanalyze')}
              disabled={action !== null}
              className="btn btn-secondary text-sm disabled:opacity-50"
            >
              {action === 'reanalyze' ? 'Analyzing…' : 'Re-analyze'}
            </button>
          </div>
          {enrichMsg && <span className="text-xs text-charcoal/60 max-w-xs text-right">{enrichMsg}</span>}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Offer Range — prominent because this is the actionable number */}
          {offerTarget !== null && (
            <div className="bg-cedar-green/5 border border-cedar-green/20 rounded-card p-5">
              <h3 className="font-heading font-semibold text-cedar-green mb-3">What to Offer</h3>
              <div className="text-2xl font-bold text-cedar-green">{fmtUSD(offerTarget)}</div>
              <div className="text-xs text-charcoal/60 mt-1">target cash offer (70% ARV − rehab)</div>
              <div className="mt-3 pt-3 border-t border-cedar-green/20 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-charcoal/60">Opening anchor (65%)</span><span className="font-medium">{fmtUSD(offerLow)}</span></div>
                <div className="flex justify-between"><span className="text-charcoal/60">Max / MAO (75%)</span><span className="font-medium">{fmtUSD(offerMax)}</span></div>
              </div>
            </div>
          )}

          {/* Property Details */}
          <div className="bg-white border border-stone/30 rounded-card p-5">
            <h3 className="font-heading font-semibold text-cedar-green mb-4">Property Details</h3>
            <div className="space-y-2 text-sm">
              <Row label="Asking Price" value={<span className="font-bold text-lg">{fmtUSD(property.asking_price)}</span>} />
              <Row label="TCAD Market Value" value={fmtUSD(property.market_value)} />
              <Row label="TCAD Appraised" value={fmtUSD(property.appraised_value)} />
              <Row label="Tax Assessed" value={fmtUSD(property.tax_assessed_value)} />
              <Row label="Zestimate" value={fmtUSD(property.zestimate)} />
              <Row label="Last Sale" value={`${fmtUSD(property.last_sale_price)}${property.last_sale_date ? ` (${fmtDate(property.last_sale_date)})` : ''}`} />
              <Row label="Deed Date (TCAD)" value={fmtDate(property.deed_date)} />
              <Row label="Property Type" value={property.property_type ?? '—'} />
              <Row label="List Type" value={property.list_type ?? '—'} />
              <Row label="Days on Market" value={property.days_on_market ?? '—'} />
              <Row label="Source" value={<code className="text-xs">{property.source ?? '—'}</code>} />
              {property.tcad_prop_id && <Row label="TCAD Prop ID" value={<code className="text-xs">{property.tcad_prop_id}</code>} />}
            </div>
          </div>

          {/* Owner Info — merges TCAD (always) + BatchData (if enriched) */}
          <div className="bg-white border border-stone/30 rounded-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-cedar-green">Owner</h3>
              {property.last_enriched_at && (
                <span className="text-[10px] text-charcoal/50" title={`Last enriched: ${property.last_enriched_at}`}>
                  enriched {fmtDate(property.last_enriched_at)}
                </span>
              )}
            </div>
            {property.owner_name || lead ? (
              <div className="space-y-2 text-sm">
                <Row label="Name" value={
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{property.owner_name ?? lead?.owner_name ?? '—'}</span>
                    <span className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                      ownerType === 'Individual' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                      ownerType === 'Trust' ? 'bg-capital-gold/15 text-capital-gold border-capital-gold/30' :
                      ownerType === 'Entity' ? 'bg-stone-100 text-stone-700 border-stone-300' :
                      'bg-stone-50 text-stone-500 border-stone-200',
                    )}>{ownerType}</span>
                  </span>
                } />
                <Row label="Mailing Address" value={<span className="text-xs">{property.owner_mailing_address ?? lead?.mailing_address ?? '—'}</span>} />
                <Row label="Absentee" value={
                  <span className={property.is_absentee ? 'text-capital-gold font-medium' : ''}>
                    {fmtBool(property.is_absentee ?? lead?.is_absentee)}
                    {property.is_absentee && ' ✈'}
                  </span>
                } />
                <Row label="Homestead (primary residence)" value={fmtBool(property.has_homestead_exemption)} />
                {property.distress_signal && (
                  <Row label="Distress Signal" value={
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-200 font-medium">
                      ⚠ {property.distress_signal}
                    </span>
                  } />
                )}
                {/* BatchData-only fields */}
                {lead?.phone_numbers && lead.phone_numbers.length > 0 && (
                  <div>
                    <span className="text-charcoal/50 text-xs block mb-1">Phone (BatchData)</span>
                    {lead.phone_numbers.map((p, i) => <div key={i} className="font-medium text-sm">{p}</div>)}
                  </div>
                )}
                {lead?.email_addresses && lead.email_addresses.length > 0 && (
                  <div>
                    <span className="text-charcoal/50 text-xs block mb-1">Email (BatchData)</span>
                    {lead.email_addresses.map((e, i) => <a key={i} href={`mailto:${e}`} className="block font-medium text-sm text-cedar-green hover:underline">{e}</a>)}
                  </div>
                )}
                {lead?.ownership_length_years != null && (
                  <Row label="Ownership Length" value={`${lead.ownership_length_years} years`} />
                )}
                {lead?.estimated_equity != null && (
                  <Row label="Est. Equity (BatchData)" value={fmtUSD(lead.estimated_equity)} />
                )}
                {lead?.mortgage_balance != null && (
                  <Row label="Mortgage Balance" value={fmtUSD(lead.mortgage_balance)} />
                )}
                {!lead && (
                  <div className="mt-2 pt-2 border-t border-stone/20 text-xs text-charcoal/60">
                    Click <strong>📞 Owner</strong> above to skip-trace for phone + email via BatchData (~$0.10/call).
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-charcoal/50">No owner info. Run TCAD ingest to get owner name + mailing, or BatchData to get phone + email.</p>
            )}
          </div>

          {/* Pipeline Stage */}
          <div className="bg-white border border-stone/30 rounded-card p-5">
            <h3 className="font-heading font-semibold text-cedar-green mb-4">Pipeline Stage</h3>
            <div className="grid grid-cols-2 gap-2">
              {['new', 'verbal_offer', 'wrote_offer', 'in_contract', 'closed', 'rejected'].map(stage => (
                <button
                  key={stage}
                  onClick={() => handleStageChange(stage)}
                  className={clsx(
                    'text-left px-3 py-2 rounded-lg text-sm capitalize transition-colors',
                    pipeline?.stage === stage
                      ? 'bg-cedar-green text-cream font-medium'
                      : 'bg-sand/50 text-charcoal/70 hover:bg-sand',
                  )}
                >
                  {stage.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center + Right: Analysis */}
        <div className="lg:col-span-2">
          {analysis ? (
            <AnalysisPanel analysis={analysis} />
          ) : (
            <div className="bg-white border border-stone/30 rounded-card p-8 text-center">
              <p className="text-charcoal/50 mb-4">No analysis yet for this property.</p>
              <button onClick={() => triggerEnrich('reanalyze')} className="btn btn-primary">
                Run Analysis
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Outreach Log */}
      {property.outreach_log && property.outreach_log.length > 0 && (
        <div className="bg-white border border-stone/30 rounded-card p-5">
          <h3 className="font-heading font-semibold text-cedar-green mb-4">Outreach History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone/20">
                  <th className="text-left py-2 px-3 font-medium text-charcoal/60">Channel</th>
                  <th className="text-left py-2 px-3 font-medium text-charcoal/60">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-charcoal/60">Template</th>
                  <th className="text-left py-2 px-3 font-medium text-charcoal/60">Sent At</th>
                  <th className="text-left py-2 px-3 font-medium text-charcoal/60">Response</th>
                </tr>
              </thead>
              <tbody>
                {property.outreach_log.map(log => (
                  <tr key={log.id} className="border-b border-stone/10">
                    <td className="py-2 px-3 capitalize">{log.channel}</td>
                    <td className="py-2 px-3">
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full',
                        log.status === 'sent' || log.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                        log.status === 'replied' ? 'bg-blue-100 text-blue-700' :
                        log.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700',
                      )}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-charcoal/60">{log.template_used ?? '—'}</td>
                    <td className="py-2 px-3 text-charcoal/60">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 px-3 text-charcoal/60">{log.response_text ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-charcoal/50 text-xs uppercase tracking-wide">{label}</span>
      <span className="text-charcoal text-right">{value}</span>
    </div>
  )
}

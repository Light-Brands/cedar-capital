'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { Property, Analysis, Lead, PipelineEntry, OutreachLogEntry } from '@/lib/supabase/types'
import ScoreBadge from '@/components/dashboard/ScoreBadge'
import AnalysisPanel from '@/components/dashboard/AnalysisPanel'

interface FullProperty extends Property {
  analyses: Analysis[]
  leads: Lead[]
  pipeline: PipelineEntry[]
  outreach_log: OutreachLogEntry[]
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function PropertyDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [property, setProperty] = useState<FullProperty | null>(null)
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)

  async function loadProperty() {
    const { data } = await supabase
      .from('properties')
      .select(`
        *,
        analyses ( * ),
        leads ( * ),
        pipeline ( * ),
        outreach_log ( * )
      `)
      .eq('id', id)
      .single()

    setProperty(data as unknown as FullProperty)
    setLoading(false)
  }

  useEffect(() => {
    loadProperty()
  }, [id])

  async function handleReanalyze() {
    setReanalyzing(true)
    try {
      await fetch(`/api/properties/${id}/analyze`, { method: 'POST' })
      await loadProperty()
    } catch (err) {
      console.error('Re-analysis failed:', err)
    }
    setReanalyzing(false)
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
        <Link href="/dashboard/properties" className="btn btn-secondary">
          Back to Properties
        </Link>
      </div>
    )
  }

  const analysis = property.analyses?.[0]
  const lead = property.leads?.[0]
  const pipeline = property.pipeline?.[0]

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
        <div>
          <div className="flex items-center gap-3 mb-2">
            {analysis?.deal_score && (
              <ScoreBadge grade={analysis.deal_score} score={analysis.deal_score_numeric ?? undefined} size="lg" />
            )}
            <h1 className="text-2xl font-heading font-bold text-cedar-green">{property.address}</h1>
          </div>
          <p className="text-charcoal/60">
            {property.city}, {property.state} {property.zip_code}
            {property.county && ` | ${property.county} County`}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-charcoal/70">
            {property.beds && <span>{property.beds} beds</span>}
            {property.baths && <span>{property.baths} baths</span>}
            {property.sqft && <span>{property.sqft.toLocaleString()} sqft</span>}
            {property.year_built && <span>Built {property.year_built}</span>}
            {property.lot_size && <span>{property.lot_size.toLocaleString()} sqft lot</span>}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="btn btn-secondary text-sm"
          >
            {reanalyzing ? 'Analyzing...' : 'Re-analyze'}
          </button>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Property Info */}
        <div className="space-y-4">
          {/* Property Details */}
          <div className="bg-white border border-stone/30 rounded-card p-5">
            <h3 className="font-heading font-semibold text-cedar-green mb-4">Property Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-charcoal/50">Asking Price</span>
                <span className="font-bold text-lg">{fmt(property.asking_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">Zestimate</span>
                <span className="font-medium">{fmt(property.zestimate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">Tax Assessed</span>
                <span className="font-medium">{fmt(property.tax_assessed_value)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">Last Sale</span>
                <span className="font-medium">
                  {fmt(property.last_sale_price)}
                  {property.last_sale_date && <span className="text-xs text-charcoal/40 ml-1">({property.last_sale_date})</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">Property Type</span>
                <span className="font-medium">{property.property_type ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">List Type</span>
                <span className="font-medium">{property.list_type ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">Days on Market</span>
                <span className="font-medium">{property.days_on_market ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-charcoal/50">Source</span>
                <span className="font-medium">{property.source ?? '-'}</span>
              </div>
            </div>
          </div>

          {/* Owner Info */}
          <div className="bg-white border border-stone/30 rounded-card p-5">
            <h3 className="font-heading font-semibold text-cedar-green mb-4">Owner Info</h3>
            {lead ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-charcoal/50">Name</span>
                  <span className="font-medium">{lead.owner_name ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/50">Type</span>
                  <span className="font-medium">{lead.owner_type ?? '-'}</span>
                </div>
                {lead.phone_numbers && lead.phone_numbers.length > 0 && (
                  <div>
                    <span className="text-charcoal/50 block mb-1">Phone</span>
                    {lead.phone_numbers.map((p, i) => (
                      <span key={i} className="block font-medium">{p}</span>
                    ))}
                  </div>
                )}
                {lead.email_addresses && lead.email_addresses.length > 0 && (
                  <div>
                    <span className="text-charcoal/50 block mb-1">Email</span>
                    {lead.email_addresses.map((e, i) => (
                      <span key={i} className="block font-medium">{e}</span>
                    ))}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-charcoal/50">Absentee</span>
                  <span className="font-medium">{lead.is_absentee ? 'Yes' : lead.is_absentee === false ? 'No' : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/50">Ownership</span>
                  <span className="font-medium">{lead.ownership_length_years ? `${lead.ownership_length_years} years` : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/50">Est. Equity</span>
                  <span className="font-medium">{fmt(lead.estimated_equity)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-charcoal/50">No owner info yet. Run enrichment to skip trace.</p>
            )}
          </div>

          {/* Pipeline Stage */}
          <div className="bg-white border border-stone/30 rounded-card p-5">
            <h3 className="font-heading font-semibold text-cedar-green mb-4">Pipeline Stage</h3>
            <div className="space-y-2">
              {['new', 'verbal_offer', 'wrote_offer', 'in_contract', 'closed', 'rejected'].map(stage => (
                <button
                  key={stage}
                  onClick={() => handleStageChange(stage)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm capitalize transition-colors ${
                    pipeline?.stage === stage
                      ? 'bg-cedar-green text-cream font-medium'
                      : 'bg-sand/50 text-charcoal/70 hover:bg-sand'
                  }`}
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
              <button onClick={handleReanalyze} className="btn btn-primary">
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        log.status === 'sent' || log.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                        log.status === 'replied' ? 'bg-blue-100 text-blue-700' :
                        log.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-charcoal/60">{log.template_used ?? '-'}</td>
                    <td className="py-2 px-3 text-charcoal/60">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-3 text-charcoal/60">{log.response_text ?? '-'}</td>
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

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'

interface OutreachEntry {
  id: string
  channel: string
  status: string
  template_used: string | null
  message_content: string | null
  sent_at: string | null
  response_text: string | null
  response_at: string | null
  lead_id: string
  property_id: string
  leads: { owner_name: string | null } | null
  properties: { address: string; zip_code: string | null } | null
}

export default function OutreachPage() {
  const [entries, setEntries] = useState<OutreachEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [filter, setFilter] = useState('')

  async function loadOutreach() {
    const { data } = await supabase
      .from('outreach_log')
      .select(`
        *,
        leads ( owner_name ),
        properties ( address, zip_code )
      `)
      .order('sent_at', { ascending: false })
      .limit(200)

    setEntries((data ?? []) as unknown as OutreachEntry[])
    setLoading(false)
  }

  useEffect(() => {
    loadOutreach()
  }, [])

  async function handleProcessQueue() {
    setProcessing(true)
    try {
      const res = await fetch('/api/outreach/process', { method: 'POST' })
      const data = await res.json()
      alert(`Outreach: ${data.sent} sent, ${data.skipped} skipped, ${data.errors} errors`)
      await loadOutreach()
    } catch {
      alert('Failed to process outreach queue')
    }
    setProcessing(false)
  }

  const filtered = filter
    ? entries.filter(e => e.status === filter || e.channel === filter)
    : entries

  const stats = {
    total: entries.length,
    sent: entries.filter(e => e.status === 'sent' || e.status === 'delivered').length,
    replied: entries.filter(e => e.status === 'replied').length,
    failed: entries.filter(e => e.status === 'failed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cedar-green">Outreach</h1>
          <p className="text-charcoal/60 text-sm">Automated SMS and email outreach log</p>
        </div>
        <button
          onClick={handleProcessQueue}
          disabled={processing}
          className="btn btn-primary"
        >
          {processing ? 'Processing...' : 'Process Queue Now'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-stone/30 rounded-card p-4">
          <p className="text-xs text-charcoal/50">Total</p>
          <p className="text-2xl font-bold text-cedar-green">{stats.total}</p>
        </div>
        <div className="bg-white border border-stone/30 rounded-card p-4">
          <p className="text-xs text-charcoal/50">Sent/Delivered</p>
          <p className="text-2xl font-bold text-success">{stats.sent}</p>
        </div>
        <div className="bg-white border border-stone/30 rounded-card p-4">
          <p className="text-xs text-charcoal/50">Replied</p>
          <p className="text-2xl font-bold text-info">{stats.replied}</p>
        </div>
        <div className="bg-white border border-stone/30 rounded-card p-4">
          <p className="text-xs text-charcoal/50">Failed</p>
          <p className="text-2xl font-bold text-error">{stats.failed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['', 'sms', 'email', 'sent', 'replied', 'failed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === f
                ? 'bg-cedar-green text-cream'
                : 'bg-sand text-charcoal/70 hover:bg-stone/30'
            }`}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-stone/30 rounded-card overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-charcoal/50">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone/20">
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Date</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Property</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Owner</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Channel</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Template</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Status</th>
                <th className="text-left py-3 px-4 font-medium text-charcoal/60">Response</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id} className="border-b border-stone/10 hover:bg-sand/20">
                  <td className="py-3 px-4 text-charcoal/60">
                    {entry.sent_at ? new Date(entry.sent_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/dashboard/properties/${entry.property_id}`} className="text-cedar-green hover:underline">
                      {entry.properties?.address ?? '-'}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-charcoal/70">
                    {entry.leads?.owner_name ?? '-'}
                  </td>
                  <td className="py-3 px-4 capitalize">{entry.channel}</td>
                  <td className="py-3 px-4 text-charcoal/60 capitalize">{entry.template_used?.replace(/([A-Z])/g, ' $1') ?? '-'}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      entry.status === 'sent' || entry.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                      entry.status === 'replied' ? 'bg-blue-100 text-blue-700' :
                      entry.status === 'opened' ? 'bg-purple-100 text-purple-700' :
                      entry.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-charcoal/60 max-w-[200px] truncate">
                    {entry.response_text ?? '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-charcoal/50">
                    No outreach entries{filter ? ` matching "${filter}"` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

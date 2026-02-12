'use client'

import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge from './ScoreBadge'

interface PropertyRow {
  id: string
  address: string
  city: string
  zip_code: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  asking_price: number | null
  list_type: string | null
  created_at: string
  analyses: Array<{
    deal_score: string | null
    deal_score_numeric: number | null
    roi: number | null
    mao: number | null
    wholesale_profit: number | null
    arv: number | null
    est_profit: number | null
    profit_with_finance: number | null
  }> | null
  pipeline: Array<{ stage: string }> | null
}

interface PropertyTableProps {
  properties: PropertyRow[]
  onSort?: (column: string) => void
  sortColumn?: string
  sortOrder?: 'asc' | 'desc'
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function PropertyTable({ properties, onSort, sortColumn, sortOrder }: PropertyTableProps) {
  const columns = [
    { key: 'deal_score', label: 'Score' },
    { key: 'address', label: 'Address' },
    { key: 'beds', label: 'Bd/Ba' },
    { key: 'asking_price', label: 'Asking' },
    { key: 'arv', label: 'ARV' },
    { key: 'roi', label: 'ROI' },
    { key: 'mao', label: 'MAO' },
    { key: 'wholesale_profit', label: 'Spread' },
    { key: 'list_type', label: 'Type' },
    { key: 'stage', label: 'Stage' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone/30">
            {columns.map(col => (
              <th
                key={col.key}
                className="text-left py-3 px-3 font-heading font-semibold text-charcoal/70 cursor-pointer hover:text-cedar-green"
                onClick={() => onSort?.(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {sortColumn === col.key && (
                    <span className="text-xs">{sortOrder === 'asc' ? '\u25B2' : '\u25BC'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {properties.map(prop => {
            const analysis = prop.analyses?.[0]
            const stage = prop.pipeline?.[0]?.stage
            return (
              <tr
                key={prop.id}
                className="border-b border-stone/10 hover:bg-sand/30 transition-colors"
              >
                <td className="py-3 px-3">
                  {analysis?.deal_score && (
                    <ScoreBadge
                      grade={analysis.deal_score}
                      score={analysis.deal_score_numeric ?? undefined}
                      size="sm"
                    />
                  )}
                </td>
                <td className="py-3 px-3">
                  <Link
                    href={`/dashboard/properties/${prop.id}`}
                    className="font-medium text-cedar-green hover:underline"
                  >
                    {prop.address}
                  </Link>
                  <span className="block text-xs text-charcoal/50">
                    {prop.city}, TX {prop.zip_code}
                  </span>
                </td>
                <td className="py-3 px-3 text-charcoal/70">
                  {prop.beds ?? '-'}/{prop.baths ?? '-'}
                  {prop.sqft && <span className="block text-xs">{prop.sqft.toLocaleString()}sf</span>}
                </td>
                <td className="py-3 px-3 font-medium">{fmt(prop.asking_price)}</td>
                <td className="py-3 px-3">{fmt(analysis?.arv)}</td>
                <td className="py-3 px-3">
                  <span className={`font-semibold ${(analysis?.roi ?? 0) > 20 ? 'text-success' : (analysis?.roi ?? 0) > 0 ? 'text-warning' : 'text-error'}`}>
                    {analysis?.roi != null ? `${analysis.roi.toFixed(1)}%` : '-'}
                  </span>
                </td>
                <td className="py-3 px-3">{fmt(analysis?.mao)}</td>
                <td className="py-3 px-3">
                  <span className={`font-semibold ${(analysis?.wholesale_profit ?? 0) > 10000 ? 'text-success' : 'text-charcoal'}`}>
                    {fmt(analysis?.wholesale_profit)}
                  </span>
                </td>
                <td className="py-3 px-3">
                  {prop.list_type && (
                    <span className="text-xs bg-sand text-charcoal/70 px-2 py-0.5 rounded-full">
                      {prop.list_type}
                    </span>
                  )}
                </td>
                <td className="py-3 px-3">
                  {stage && (
                    <span className="text-xs bg-cedar-green/10 text-cedar-green px-2 py-0.5 rounded-full capitalize">
                      {stage.replaceAll('_', ' ')}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
          {properties.length === 0 && (
            <tr>
              <td colSpan={10} className="py-12 text-center text-charcoal/50">
                No properties found. Click Refresh to discover new leads.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

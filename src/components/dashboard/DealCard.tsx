'use client'

import Link from 'next/link'
import ScoreBadge from './ScoreBadge'

interface DealCardProps {
  id: string
  address: string
  city: string
  zipCode: string
  beds: number | null
  baths: number | null
  sqft: number | null
  askingPrice: number | null
  dealScore: string | null
  dealScoreNumeric: number | null
  roi: number | null
  mao: number | null
  wholesaleProfit: number | null
  arv: number | null
  estProfit: number | null
  pipelineStage: string | null
  listType: string | null
}

function formatCurrency(n: number | null): string {
  if (n === null || n === undefined) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number | null): string {
  if (n === null || n === undefined) return '-'
  return `${n.toFixed(1)}%`
}

export default function DealCard(props: DealCardProps) {
  return (
    <Link
      href={`/dashboard/properties/${props.id}`}
      className="block bg-white border border-stone/30 rounded-card p-4 shadow-card hover:shadow-elevated transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {props.dealScore && (
              <ScoreBadge grade={props.dealScore} score={props.dealScoreNumeric ?? undefined} size="sm" />
            )}
            {props.listType && (
              <span className="text-xs bg-sand text-charcoal/70 px-2 py-0.5 rounded-full">
                {props.listType}
              </span>
            )}
          </div>
          <h3 className="font-heading font-semibold text-cedar-green truncate">
            {props.address}
          </h3>
          <p className="text-sm text-charcoal/60">
            {props.city}, TX {props.zipCode}
          </p>
        </div>
        <div className="text-right">
          <p className="font-heading font-bold text-cedar-green">
            {formatCurrency(props.askingPrice)}
          </p>
          {props.arv && (
            <p className="text-xs text-charcoal/50">ARV: {formatCurrency(props.arv)}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-sm text-charcoal/70">
        {props.beds !== null && <span>{props.beds}bd</span>}
        {props.baths !== null && <span>{props.baths}ba</span>}
        {props.sqft !== null && <span>{props.sqft.toLocaleString()}sqft</span>}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-stone/20">
        <div>
          <p className="text-xs text-charcoal/50">ROI</p>
          <p className={`text-sm font-semibold ${(props.roi ?? 0) > 20 ? 'text-success' : (props.roi ?? 0) > 0 ? 'text-warning' : 'text-error'}`}>
            {formatPct(props.roi)}
          </p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50">MAO</p>
          <p className="text-sm font-semibold text-charcoal">{formatCurrency(props.mao)}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50">Spread</p>
          <p className={`text-sm font-semibold ${(props.wholesaleProfit ?? 0) > 10000 ? 'text-success' : 'text-charcoal'}`}>
            {formatCurrency(props.wholesaleProfit)}
          </p>
        </div>
      </div>

      {props.pipelineStage && (
        <div className="mt-2 pt-2 border-t border-stone/20">
          <span className="text-xs bg-cedar-green/10 text-cedar-green px-2 py-0.5 rounded-full capitalize">
            {props.pipelineStage.replaceAll('_', ' ')}
          </span>
        </div>
      )}
    </Link>
  )
}

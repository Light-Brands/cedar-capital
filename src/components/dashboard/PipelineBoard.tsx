'use client'

import { useState } from 'react'
import ScoreBadge from './ScoreBadge'

interface PipelineItem {
  id: string
  property_id: string
  stage: string
  notes: string | null
  properties: {
    id: string
    address: string
    city: string
    zip_code: string | null
    beds: number | null
    baths: number | null
    sqft: number | null
    asking_price: number | null
  } | null
  analyses: {
    deal_score: string | null
    deal_score_numeric: number | null
    roi: number | null
    mao: number | null
    arv: number | null
    est_profit: number | null
  } | null
}

interface PipelineBoardProps {
  items: PipelineItem[]
  onStageChange: (pipelineId: string, newStage: string) => void
}

const STAGES = [
  { key: 'new', label: 'New Leads', color: 'border-t-blue-400' },
  { key: 'verbal_offer', label: 'Verbal Offer', color: 'border-t-amber-400' },
  { key: 'wrote_offer', label: 'Wrote Offer', color: 'border-t-purple-400' },
  { key: 'in_contract', label: 'In Contract', color: 'border-t-emerald-400' },
  { key: 'closed', label: 'Closed', color: 'border-t-green-600' },
  { key: 'rejected', label: 'Rejected', color: 'border-t-red-400' },
]

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function PipelineBoard({ items, onStageChange }: PipelineBoardProps) {
  const [dragItem, setDragItem] = useState<string | null>(null)

  function handleDragStart(pipelineId: string) {
    setDragItem(pipelineId)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(stage: string) {
    if (dragItem) {
      onStageChange(dragItem, stage)
      setDragItem(null)
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map(stage => {
        const stageItems = items.filter(item => item.stage === stage.key)
        return (
          <div
            key={stage.key}
            className={`flex-shrink-0 w-72 bg-sand/30 rounded-card border-t-4 ${stage.color}`}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(stage.key)}
          >
            <div className="p-3 border-b border-stone/20">
              <div className="flex items-center justify-between">
                <h4 className="font-heading font-semibold text-sm text-charcoal">
                  {stage.label}
                </h4>
                <span className="text-xs bg-white text-charcoal/60 px-2 py-0.5 rounded-full">
                  {stageItems.length}
                </span>
              </div>
            </div>
            <div className="p-2 space-y-2 min-h-[200px]">
              {stageItems.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  className="bg-white rounded-lg p-3 shadow-card cursor-move hover:shadow-elevated transition-shadow"
                >
                  {item.analyses?.deal_score && (
                    <ScoreBadge grade={item.analyses.deal_score} size="sm" />
                  )}
                  <p className="font-medium text-sm text-cedar-green mt-1 truncate">
                    {item.properties?.address ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-charcoal/50">
                    {item.properties?.city}, TX {item.properties?.zip_code}
                  </p>
                  <div className="flex justify-between text-xs mt-2 text-charcoal/60">
                    <span>Ask: {fmt(item.properties?.asking_price ?? null)}</span>
                    <span>ROI: {item.analyses?.roi != null ? `${item.analyses.roi.toFixed(1)}%` : '-'}</span>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-charcoal/50 mt-1 truncate">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

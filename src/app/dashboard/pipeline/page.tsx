'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import PipelineBoard from '@/components/dashboard/PipelineBoard'

export default function PipelinePage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function loadPipeline() {
    const { data } = await supabase
      .from('pipeline')
      .select(`
        *,
        properties ( id, address, city, zip_code, beds, baths, sqft, asking_price ),
        analyses ( deal_score, deal_score_numeric, roi, mao, arv, est_profit )
      `)
      .order('updated_at', { ascending: false })

    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadPipeline()

    const channel = supabase
      .channel('pipeline-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline' }, () => {
        loadPipeline()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleStageChange(pipelineId: string, newStage: string) {
    await supabase
      .from('pipeline')
      .update({ stage: newStage })
      .eq('id', pipelineId)

    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === pipelineId ? { ...item, stage: newStage } : item
    ))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-cedar-green">Pipeline</h1>
        <p className="text-charcoal/60 text-sm">Drag and drop deals between stages</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-charcoal/50">Loading pipeline...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white border border-stone/30 rounded-card">
          <p className="text-charcoal/50 mb-2">No deals in the pipeline yet.</p>
          <p className="text-sm text-charcoal/40">A and B grade leads are automatically added when discovered.</p>
        </div>
      ) : (
        <PipelineBoard items={items} onStageChange={handleStageChange} />
      )}
    </div>
  )
}

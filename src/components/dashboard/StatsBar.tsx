'use client'

interface Stat {
  label: string
  value: string | number
  change?: string
}

interface StatsBarProps {
  stats: Stat[]
}

export default function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white border border-stone/30 rounded-card p-4 shadow-card"
        >
          <p className="text-sm text-charcoal/60 font-body">{stat.label}</p>
          <p className="text-2xl font-heading font-bold text-cedar-green mt-1">
            {stat.value}
          </p>
          {stat.change && (
            <p className="text-xs text-success mt-1">{stat.change}</p>
          )}
        </div>
      ))}
    </div>
  )
}

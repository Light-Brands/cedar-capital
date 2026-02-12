'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-cedar-green">Settings</h1>
        <p className="text-charcoal/60 text-sm">Configure API keys, cron schedules, and outreach templates</p>
      </div>

      {/* API Keys */}
      <div className="bg-white border border-stone/30 rounded-card p-6">
        <h2 className="font-heading font-semibold text-cedar-green mb-4">API Configuration</h2>
        <p className="text-sm text-charcoal/60 mb-4">
          API keys are configured via environment variables for security. Set these in your Vercel dashboard or .env.local file.
        </p>
        <div className="space-y-3">
          {[
            { name: 'ATTOM_API_KEY', label: 'ATTOM Data API', desc: 'Property data, valuations, comps' },
            { name: 'BATCHDATA_API_KEY', label: 'BatchData API', desc: 'Skip tracing, owner contact info' },
            { name: 'ESTATED_API_KEY', label: 'Estated API', desc: 'Fallback property data and AVMs' },
            { name: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID', desc: 'SMS outreach' },
            { name: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token', desc: 'SMS authentication' },
            { name: 'TWILIO_PHONE_NUMBER', label: 'Twilio Phone Number', desc: 'SMS sender number' },
            { name: 'SENDGRID_API_KEY', label: 'SendGrid API Key', desc: 'Email outreach' },
          ].map(item => (
            <div key={item.name} className="flex items-center justify-between py-2 border-b border-stone/10 last:border-0">
              <div>
                <p className="text-sm font-medium text-charcoal">{item.label}</p>
                <p className="text-xs text-charcoal/50">{item.desc}</p>
              </div>
              <code className="text-xs bg-sand px-2 py-1 rounded text-charcoal/60">{item.name}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Cron Schedule */}
      <div className="bg-white border border-stone/30 rounded-card p-6">
        <h2 className="font-heading font-semibold text-cedar-green mb-4">Cron Schedule</h2>
        <p className="text-sm text-charcoal/60 mb-4">
          Pipeline runs every 2 hours automatically on Vercel.
        </p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-stone/10">
            <div>
              <p className="font-medium">Discover</p>
              <p className="text-xs text-charcoal/50">Find new distressed properties</p>
            </div>
            <code className="text-xs bg-sand px-2 py-1 rounded">XX:00</code>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-stone/10">
            <div>
              <p className="font-medium">Enrich</p>
              <p className="text-xs text-charcoal/50">Skip trace owner info</p>
            </div>
            <code className="text-xs bg-sand px-2 py-1 rounded">XX:15</code>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-stone/10">
            <div>
              <p className="font-medium">Analyze</p>
              <p className="text-xs text-charcoal/50">Run deal analysis engine</p>
            </div>
            <code className="text-xs bg-sand px-2 py-1 rounded">XX:30</code>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Outreach</p>
              <p className="text-xs text-charcoal/50">Send SMS/email to A/B leads</p>
            </div>
            <code className="text-xs bg-sand px-2 py-1 rounded">XX:45</code>
          </div>
        </div>
      </div>

      {/* Outreach Templates */}
      <div className="bg-white border border-stone/30 rounded-card p-6">
        <h2 className="font-heading font-semibold text-cedar-green mb-4">Outreach Templates</h2>
        <p className="text-sm text-charcoal/60 mb-4">
          Message templates are defined in <code className="bg-sand px-1 rounded">src/lib/outreach/templates.ts</code>.
          Edit that file to customize messaging.
        </p>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-charcoal mb-2">SMS Sequence</h3>
            <div className="space-y-2 text-xs text-charcoal/60">
              <div className="bg-sand/50 p-3 rounded-lg">
                <p className="font-medium text-charcoal mb-1">1. Initial (Immediate)</p>
                <p>Introduction + cash offer + call to action</p>
              </div>
              <div className="bg-sand/50 p-3 rounded-lg">
                <p className="font-medium text-charcoal mb-1">2. Follow-up (48 hours)</p>
                <p>Reminder + value proposition</p>
              </div>
              <div className="bg-sand/50 p-3 rounded-lg">
                <p className="font-medium text-charcoal mb-1">3. Final (5 days)</p>
                <p>Soft close + leave door open</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-charcoal mb-2">Email Sequence</h3>
            <div className="space-y-2 text-xs text-charcoal/60">
              <div className="bg-sand/50 p-3 rounded-lg">
                <p className="font-medium text-charcoal mb-1">1. Initial (Immediate)</p>
                <p>Full introduction + benefits list + CTA</p>
              </div>
              <div className="bg-sand/50 p-3 rounded-lg">
                <p className="font-medium text-charcoal mb-1">2. Follow-up (48 hours)</p>
                <p>Short check-in + reiterate offer</p>
              </div>
              <div className="bg-sand/50 p-3 rounded-lg">
                <p className="font-medium text-charcoal mb-1">3. Final (5 days)</p>
                <p>Last touch + soft close</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Defaults */}
      <div className="bg-white border border-stone/30 rounded-card p-6">
        <h2 className="font-heading font-semibold text-cedar-green mb-4">Analysis Defaults</h2>
        <p className="text-sm text-charcoal/60 mb-4">
          Default values used by the deal analysis engine. These mirror your spreadsheet settings.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">LTV Ratio</label>
            <input type="text" className="input" defaultValue="90%" readOnly />
          </div>
          <div>
            <label className="label">Points</label>
            <input type="text" className="input" defaultValue="2%" readOnly />
          </div>
          <div>
            <label className="label">Interest Rate</label>
            <input type="text" className="input" defaultValue="10%" readOnly />
          </div>
          <div>
            <label className="label">Hold Period</label>
            <input type="text" className="input" defaultValue="6 months" readOnly />
          </div>
          <div>
            <label className="label">Selling Costs</label>
            <input type="text" className="input" defaultValue="7% of ARV" readOnly />
          </div>
          <div>
            <label className="label">MAO Formula</label>
            <input type="text" className="input" defaultValue="(ARV x 75%) - Repairs" readOnly />
          </div>
        </div>
        <p className="text-xs text-charcoal/40 mt-3">
          To change defaults, edit <code className="bg-sand px-1 rounded">src/lib/analysis/finance-calculator.ts</code>
        </p>
      </div>

      {saved && (
        <div className="fixed bottom-6 right-6 bg-success text-cream px-4 py-2 rounded-lg shadow-elevated">
          Settings saved!
        </div>
      )}
    </div>
  )
}

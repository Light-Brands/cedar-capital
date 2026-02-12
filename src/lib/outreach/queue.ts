/**
 * Outreach Queue Processor
 * Handles automated outreach to A and B grade leads.
 * Implements follow-up sequences at 48hr, 5day, 10day intervals.
 */

import { createServerClient } from '@/lib/supabase/client'
import type { Lead, Property, Analysis, OutreachLogInsert } from '@/lib/supabase/types'
import { sendSMS } from './twilio'
import { sendEmail } from './sendgrid'
import {
  SMS_TEMPLATES,
  EMAIL_TEMPLATES,
  getNextTemplate,
  DEFAULT_TEMPLATE_VARS,
  type TemplateVars,
} from './templates'

interface OutreachCandidate {
  property: Property
  lead: Lead
  analysis: Analysis
  outreachCount: number
  lastOutreachAt: string | null
}

/**
 * Process the outreach queue.
 * Finds A/B grade leads that need outreach and sends messages.
 */
export async function processOutreachQueue(): Promise<{
  sent: number
  skipped: number
  errors: number
}> {
  const supabase = createServerClient()
  const stats = { sent: 0, skipped: 0, errors: 0 }

  // Get A and B grade analyses
  const { data: analyses } = await supabase
    .from('analyses')
    .select('*')
    .in('deal_score', ['A', 'B'])
    .order('deal_score_numeric', { ascending: false })

  if (!analyses || analyses.length === 0) return stats

  for (const analysis of analyses) {
    try {
      // Get property and lead
      const { data: property } = await supabase
        .from('properties')
        .select('*')
        .eq('id', analysis.property_id)
        .single()

      if (!property) continue

      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('property_id', analysis.property_id)
        .limit(1)
        .single()

      if (!lead) {
        stats.skipped++
        continue
      }

      // Check outreach history
      const { data: outreachHistory } = await supabase
        .from('outreach_log')
        .select('*')
        .eq('lead_id', lead.id)
        .order('sent_at', { ascending: false })

      // Count outreach "rounds" (not individual messages) by counting
      // distinct template names used, since SMS + email share the same template per round
      const templateNames = new Set((outreachHistory ?? []).map(o => o.template_used))
      const roundCount = templateNames.size
      const lastOutreach = outreachHistory?.[0]

      // Check if any outreach got a reply - if so, skip
      if (outreachHistory?.some(o => o.status === 'replied')) {
        stats.skipped++
        continue
      }

      // Check follow-up timing
      if (lastOutreach?.sent_at) {
        const hoursSinceLastOutreach = (Date.now() - new Date(lastOutreach.sent_at).getTime()) / (1000 * 60 * 60)

        // Initial → Follow-up 1: wait 48 hours
        if (roundCount === 1 && hoursSinceLastOutreach < 48) {
          stats.skipped++
          continue
        }
        // Follow-up 1 → Follow-up 2: wait 5 days (120 hours)
        if (roundCount === 2 && hoursSinceLastOutreach < 120) {
          stats.skipped++
          continue
        }
        // After follow-up 2, mark as cold - skip
        if (roundCount >= 3) {
          stats.skipped++
          continue
        }
      }

      // Determine which templates to use
      const templates = getNextTemplate(roundCount)
      const vars: TemplateVars = {
        ownerName: lead.owner_name ?? 'Homeowner',
        address: property.address,
        ...DEFAULT_TEMPLATE_VARS,
      }

      let messagesDelivered = 0

      // Send SMS if we have a phone number
      if (lead.phone_numbers && lead.phone_numbers.length > 0) {
        const phone = lead.phone_numbers[0]
        const smsBody = SMS_TEMPLATES[templates.sms](vars)
        const smsResult = await sendSMS(phone, smsBody)

        const logEntry: OutreachLogInsert = {
          lead_id: lead.id,
          property_id: property.id,
          channel: 'sms',
          status: smsResult.success ? 'sent' : 'failed',
          template_used: templates.sms,
          message_content: smsBody,
          sent_at: new Date().toISOString(),
        }
        await supabase.from('outreach_log').insert(logEntry)

        if (smsResult.success) { stats.sent++; messagesDelivered++ }
        else stats.errors++
      }

      // Send email if we have an email address
      if (lead.email_addresses && lead.email_addresses.length > 0) {
        const email = lead.email_addresses[0]
        const emailTemplate = EMAIL_TEMPLATES[templates.email]
        const subject = emailTemplate.subject(vars)
        const body = emailTemplate.body(vars)
        const emailResult = await sendEmail(email, subject, body)

        const logEntry: OutreachLogInsert = {
          lead_id: lead.id,
          property_id: property.id,
          channel: 'email',
          status: emailResult.success ? 'sent' : 'failed',
          template_used: templates.email,
          message_content: body,
          sent_at: new Date().toISOString(),
        }
        await supabase.from('outreach_log').insert(logEntry)

        if (emailResult.success) { stats.sent++; messagesDelivered++ }
        else stats.errors++
      }

      // If no contact info at all, skip
      if ((!lead.phone_numbers || lead.phone_numbers.length === 0) &&
          (!lead.email_addresses || lead.email_addresses.length === 0)) {
        stats.skipped++
      }

      // Create/update pipeline entry only if this is first outreach and we sent something
      if (roundCount === 0 && messagesDelivered > 0) {
        await supabase.from('pipeline').upsert({
          property_id: property.id,
          analysis_id: analysis.id,
          stage: 'new',
          notes: `Auto-outreach sent. Score: ${analysis.deal_score}`,
        }, { onConflict: 'property_id' })
      }
    } catch (err) {
      console.error(`Outreach error for analysis ${analysis.id}:`, err)
      stats.errors++
    }
  }

  return stats
}

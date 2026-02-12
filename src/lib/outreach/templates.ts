/**
 * Outreach Message Templates
 * SMS and email templates for seller outreach.
 */

export interface TemplateVars {
  ownerName: string
  address: string
  agentName: string
  companyPhone: string
}

// ---------- SMS Templates ----------

export const SMS_TEMPLATES = {
  initial: (v: TemplateVars) =>
    `Hi ${v.ownerName}, this is ${v.agentName} with Cedar Capital. We're interested in your property at ${v.address}. We buy homes as-is, close fast, and cover all costs. Would you be open to a quick chat? Reply YES or call us at ${v.companyPhone}.`,

  followUp1: (v: TemplateVars) =>
    `Hi ${v.ownerName}, just following up on ${v.address}. We can make a fair cash offer within 24 hours. No repairs needed, no agent fees. Interested?`,

  followUp2: (v: TemplateVars) =>
    `Last note about ${v.address} - we're actively buying in your area. If the timing isn't right now, no worries. We're here when you're ready. - ${v.agentName}, Cedar Capital`,
} as const

// ---------- Email Templates ----------

export const EMAIL_TEMPLATES = {
  initial: {
    subject: (v: TemplateVars) =>
      `Cash Offer for ${v.address}`,
    body: (v: TemplateVars) =>
      `Hi ${v.ownerName},

My name is ${v.agentName} and I'm with Cedar Capital, a local Austin-based real estate investment company.

We noticed your property at ${v.address} and we're interested in making you a fair, all-cash offer. Here's what we offer:

- Cash offer within 24 hours
- Close on your timeline (as fast as 7 days)
- No repairs needed - we buy as-is
- No agent commissions or closing costs for you
- No showings or open houses

If you're open to hearing what we could offer, simply reply to this email or give us a call at ${v.companyPhone}.

No pressure at all - we're here if and when the timing is right for you.

Best regards,
${v.agentName}
Cedar Capital
${v.companyPhone}`,
  },

  followUp1: {
    subject: (v: TemplateVars) =>
      `Following up: ${v.address}`,
    body: (v: TemplateVars) =>
      `Hi ${v.ownerName},

I reached out a couple of days ago about your property at ${v.address}. I wanted to follow up in case my previous message got lost.

We're actively buying properties in your area and can make a fair cash offer within 24 hours. No obligations - just a conversation to see if it could be a good fit.

Would you be open to a quick chat?

Best,
${v.agentName}
Cedar Capital
${v.companyPhone}`,
  },

  followUp2: {
    subject: (v: TemplateVars) =>
      `One last note about ${v.address}`,
    body: (v: TemplateVars) =>
      `Hi ${v.ownerName},

This is my last follow-up about ${v.address}. I completely understand if now isn't the right time.

If anything changes in the future, we'll still be here and happy to make you a fair offer. Just reply to this email or call ${v.companyPhone} anytime.

Wishing you all the best,
${v.agentName}
Cedar Capital`,
  },
} as const

// ---------- Template Selection ----------

export type SMSTemplateName = keyof typeof SMS_TEMPLATES
export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES

/**
 * Determine which follow-up template to use based on outreach count.
 */
export function getNextTemplate(outreachCount: number): { sms: SMSTemplateName; email: EmailTemplateName } {
  if (outreachCount === 0) return { sms: 'initial', email: 'initial' }
  if (outreachCount === 1) return { sms: 'followUp1', email: 'followUp1' }
  return { sms: 'followUp2', email: 'followUp2' }
}

/**
 * Default template variables. Override agentName and companyPhone from settings.
 */
export const DEFAULT_TEMPLATE_VARS: Pick<TemplateVars, 'agentName' | 'companyPhone'> = {
  agentName: 'Cedar Capital',
  companyPhone: '(512) 555-0100',
}

/**
 * SendGrid Email Client
 * Sends emails for seller outreach.
 */

import sgMail from '@sendgrid/mail'

function initSendGrid() {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) throw new Error('SENDGRID_API_KEY not configured')
  sgMail.setApiKey(apiKey)
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email to a lead.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  fromEmail: string = 'deals@cedarcapital.com',
  fromName: string = 'Cedar Capital'
): Promise<EmailResult> {
  try {
    initSendGrid()

    const [response] = await sgMail.send({
      to,
      from: { email: fromEmail, name: fromName },
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    })

    return {
      success: response.statusCode >= 200 && response.statusCode < 300,
      messageId: response.headers['x-message-id'] as string | undefined,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`SendGrid email error:`, errorMessage)
    return {
      success: false,
      error: errorMessage,
    }
  }
}

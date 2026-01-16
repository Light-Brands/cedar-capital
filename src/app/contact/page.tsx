'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const contactInfo = [
  {
    title: 'Phone',
    value: '(512) 555-CEDAR',
    description: 'Mon-Fri, 9am-6pm CT',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    title: 'Email',
    value: 'hello@cedarcapital.com',
    description: "We'll respond within 24 hours",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Location',
    value: 'Austin, Texas',
    description: 'Serving the greater Austin area',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

const faqs = [
  {
    question: 'How quickly can I get an offer?',
    answer: 'We typically provide a cash offer within 24 hours of receiving your property information.',
  },
  {
    question: 'Do I need to make repairs before selling?',
    answer: 'No. We buy homes as-is, in any condition. No repairs, cleaning, or staging required.',
  },
  {
    question: 'Are there any fees or commissions?',
    answer: 'None. The offer we make is what you receive. No hidden fees, no agent commissions.',
  },
  {
    question: 'How fast can we close?',
    answer: 'We can close in as little as 7 days, or on your timeline if you need more time.',
  },
]

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <>
      {/* Hero Section */}
      <section className="section">
        <div className="container-content">
          <div className="text-center max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="gold-accent mx-auto mb-6" />
              <h1 className="mb-6">Let&apos;s talk.</h1>
              <p className="text-lg text-charcoal/80">
                Have questions? Want to discuss your situation? We&apos;re here to help — no pressure, no obligation.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="pb-12">
        <div className="container-content">
          <div className="grid md:grid-cols-3 gap-6">
            {contactInfo.map((info, index) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="text-center h-full">
                  <div className="w-12 h-12 bg-cedar-green/10 rounded-full flex items-center justify-center mx-auto mb-4 text-cedar-green">
                    {info.icon}
                  </div>
                  <h3 className="text-lg mb-1">{info.title}</h3>
                  <p className="font-medium text-cedar-green mb-1">{info.value}</p>
                  <p className="text-charcoal/60 text-sm">{info.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form & FAQ */}
      <section className="section section-alt">
        <div className="container-content">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card variant="elevated" className="p-8">
                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl mb-2">Message sent!</h3>
                    <p className="text-charcoal/70">
                      We&apos;ll get back to you within 24 hours.
                    </p>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl mb-2">Send us a message</h2>
                    <p className="text-charcoal/70 mb-6">
                      Fill out the form below and we&apos;ll be in touch soon.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="name" className="label">
                            Your name
                          </label>
                          <input
                            type="text"
                            id="name"
                            className="input"
                            placeholder="John Smith"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="phone" className="label">
                            Phone
                          </label>
                          <input
                            type="tel"
                            id="phone"
                            className="input"
                            placeholder="(512) 555-0123"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="email" className="label">
                          Email
                        </label>
                        <input
                          type="email"
                          id="email"
                          className="input"
                          placeholder="john@example.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="subject" className="label">
                          What can we help with?
                        </label>
                        <select
                          id="subject"
                          className="input"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          required
                        >
                          <option value="">Select a topic</option>
                          <option value="sell">I want to sell my home</option>
                          <option value="invest">I&apos;m interested in investing</option>
                          <option value="question">I have a question</option>
                          <option value="other">Something else</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="message" className="label">
                          Your message
                        </label>
                        <textarea
                          id="message"
                          className="input min-h-[120px] resize-y"
                          placeholder="Tell us more about your situation..."
                          value={formData.message}
                          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                          required
                        />
                      </div>

                      <Button type="submit" className="w-full">
                        Send Message
                      </Button>
                    </form>
                  </>
                )}
              </Card>
            </motion.div>

            {/* FAQ */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="gold-accent mb-6" />
              <h2 className="mb-8">Frequently asked questions</h2>

              <div className="space-y-6">
                {faqs.map((faq) => (
                  <div key={faq.question} className="border-b border-stone pb-6">
                    <h3 className="text-lg mb-2">{faq.question}</h3>
                    <p className="text-charcoal/70">{faq.answer}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-6 bg-cedar-green/5 rounded-card">
                <h3 className="text-lg mb-2">Still have questions?</h3>
                <p className="text-charcoal/70 text-sm mb-4">
                  We&apos;re happy to chat. Give us a call or send a message — no pressure, ever.
                </p>
                <a
                  href="tel:+15125552332"
                  className="text-cedar-green font-medium hover:underline"
                >
                  (512) 555-CEDAR
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  )
}

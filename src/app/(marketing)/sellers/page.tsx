'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const processSteps = [
  {
    step: 1,
    title: 'Tell us about your property',
    description: 'Fill out our simple form with basic info about your home. Takes about 2 minutes.',
  },
  {
    step: 2,
    title: 'Get a fair cash offer',
    description: 'We\'ll analyze your property and provide a no-obligation cash offer within 24 hours.',
  },
  {
    step: 3,
    title: 'Choose your closing date',
    description: 'Accept the offer and pick a closing date that works for you — as fast as 7 days.',
  },
  {
    step: 4,
    title: 'Get paid',
    description: 'Show up, sign the papers, and walk away with cash. It\'s that simple.',
  },
]

const benefits = [
  { title: 'No Repairs Needed', description: 'We buy homes as-is. No fixing, cleaning, or staging required.' },
  { title: 'No Agent Fees', description: 'No 6% commission. The offer we make is what you get.' },
  { title: 'No Showings', description: 'No strangers walking through your home every weekend.' },
  { title: 'Close Fast', description: 'Traditional sales take 90+ days. We can close in as little as 7.' },
  { title: 'Fair Cash Offers', description: 'Our offers are based on real market data, not lowball tactics.' },
  { title: 'Your Timeline', description: 'Need more time? We can work with your schedule.' },
]

const situations = [
  'Inherited property',
  'Facing foreclosure',
  'Job relocation',
  'Divorce',
  'Tired landlord',
  'Home needs major repairs',
  'Behind on payments',
  'Downsizing',
]

export default function SellersPage() {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    situation: '',
    timeline: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // In production, this would submit to an API
    setSubmitted(true)
  }

  return (
    <>
      {/* Hero Section */}
      <section className="section">
        <div className="container-content">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="gold-accent mb-6" />
              <h1 className="mb-6">Sell your home fast, fair, and stress-free.</h1>
              <p className="text-lg text-charcoal/80 mb-8">
                No repairs. No showings. No hassle. Just a fair cash offer from local Austin buyers who actually show up.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  'Cash offers within 24 hours',
                  'Close in as little as 7 days',
                  'No fees, commissions, or closing costs',
                  'We buy homes in any condition',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-charcoal/80">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Lead Capture Form */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Card variant="elevated" className="p-8">
                {submitted ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl mb-2">Got it!</h3>
                    <p className="text-charcoal/70">
                      We&apos;ll be in touch within 24 hours with your cash offer.
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-2xl mb-2">Get your free cash offer</h3>
                    <p className="text-charcoal/70 mb-6">
                      No obligation. No pressure. Just a fair offer.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
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

                      <div className="grid grid-cols-2 gap-4">
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
                            required
                          />
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
                      </div>

                      <div>
                        <label htmlFor="address" className="label">
                          Property address
                        </label>
                        <input
                          type="text"
                          id="address"
                          className="input"
                          placeholder="123 Main St, Austin, TX"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="timeline" className="label">
                          When do you need to sell?
                        </label>
                        <select
                          id="timeline"
                          className="input"
                          value={formData.timeline}
                          onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                        >
                          <option value="">Select timeline</option>
                          <option value="asap">As soon as possible</option>
                          <option value="30">Within 30 days</option>
                          <option value="60">Within 60 days</option>
                          <option value="flexible">I&apos;m flexible</option>
                        </select>
                      </div>

                      <Button type="submit" className="w-full">
                        Get My Free Offer
                      </Button>

                      <p className="text-center text-xs text-charcoal/50">
                        By submitting, you agree to be contacted about your property.
                      </p>
                    </form>
                  </>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="section section-alt">
        <div className="container-content">
          <div className="text-center mb-12">
            <div className="gold-accent mx-auto mb-4" />
            <h2>How it works</h2>
            <p className="mt-4 text-charcoal/80 max-w-2xl mx-auto">
              Selling your home shouldn&apos;t be complicated. Here&apos;s our simple 4-step process.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {processSteps.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full relative">
                  <div className="absolute -top-4 left-6">
                    <div className="w-8 h-8 bg-cedar-green rounded-full flex items-center justify-center text-cream font-heading font-bold text-sm">
                      {step.step}
                    </div>
                  </div>
                  <div className="pt-4">
                    <h3 className="text-lg mb-2">{step.title}</h3>
                    <p className="text-charcoal/70 text-sm">{step.description}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="section">
        <div className="container-content">
          <div className="text-center mb-12">
            <div className="gold-accent mx-auto mb-4" />
            <h2>Why sell to Cedar Capital?</h2>
            <p className="mt-4 text-charcoal/80 max-w-2xl mx-auto">
              Skip the stress of traditional home sales. Here&apos;s why homeowners choose us.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <Card key={benefit.title}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-capital-gold/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-capital-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg mb-1">{benefit.title}</h3>
                    <p className="text-charcoal/70 text-sm">{benefit.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Situations We Help With */}
      <section className="section bg-cedar-green">
        <div className="container-content">
          <div className="text-center mb-12">
            <h2 className="text-cream">We help homeowners in all situations</h2>
            <p className="mt-4 text-cream/80 max-w-2xl mx-auto">
              Whatever your situation, we can help. No judgment, just solutions.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {situations.map((situation) => (
              <div
                key={situation}
                className="bg-cream/10 text-cream px-4 py-2 rounded-full text-sm"
              >
                {situation}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="section">
        <div className="container-content">
          <div className="bg-sand border border-stone rounded-card p-8 md:p-12 text-center">
            <div className="gold-accent mx-auto mb-6" />
            <h2 className="mb-4">Ready for a fair, fast offer?</h2>
            <p className="text-charcoal/80 max-w-2xl mx-auto mb-8">
              No obligation, no pressure. Get a cash offer in 24 hours and decide on your own timeline.
            </p>
            <Button
              size="lg"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Get My Free Offer
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}

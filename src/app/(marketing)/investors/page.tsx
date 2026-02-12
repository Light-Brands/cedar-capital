'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const dealTypes = [
  {
    title: 'Fix & Flip',
    description: 'Properties with clear rehab potential and strong ARV projections.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    title: 'Buy & Hold',
    description: 'Rental-ready properties with strong cash flow potential.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    title: 'Wholesale',
    description: 'Assignment opportunities for quick turnaround deals.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
]

const benefits = [
  {
    title: 'Vetted Deal Flow',
    description: 'Every property is thoroughly analyzed before it hits your inbox. No tire-kickers.',
  },
  {
    title: 'Clear Numbers',
    description: 'Transparent ARV, repair estimates, and ROI projections. No guesswork.',
  },
  {
    title: 'Off-Market Access',
    description: 'Properties you won\'t find on the MLS. Less competition, better margins.',
  },
  {
    title: 'Local Expertise',
    description: 'We know Austin inside and out. Neighborhoods, comps, and market trends.',
  },
  {
    title: 'Professional Process',
    description: 'Organized documentation, clear timelines, and reliable communication.',
  },
  {
    title: 'Flexible Terms',
    description: 'We structure deals that work for both sides. No rigid requirements.',
  },
]

const sampleDeals = [
  {
    address: '4521 Oak Valley Dr',
    area: 'South Austin',
    type: 'Fix & Flip',
    askingPrice: '$285,000',
    arv: '$385,000',
    repairEstimate: '$45,000',
    potentialProfit: '$55,000',
    status: 'Available',
  },
  {
    address: '1823 Cedar Lane',
    area: 'East Austin',
    type: 'Buy & Hold',
    askingPrice: '$225,000',
    arv: '$275,000',
    repairEstimate: '$15,000',
    potentialProfit: '$1,450/mo',
    status: 'Under Contract',
  },
  {
    address: '9012 Riverside Blvd',
    area: 'North Austin',
    type: 'Fix & Flip',
    askingPrice: '$340,000',
    arv: '$465,000',
    repairEstimate: '$60,000',
    potentialProfit: '$65,000',
    status: 'Available',
  },
]

export default function InvestorsPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    investmentType: '',
    budget: '',
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
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="gold-accent mb-6" />
              <h1 className="mb-6">Quality Austin deals, delivered.</h1>
              <p className="text-lg text-charcoal/80 mb-8">
                Vetted opportunities. Clear numbers. No guesswork. Get access to off-market Austin properties with transparent analysis and reliable deal flow.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="#partner" className="btn btn-accent">
                  Join Our Investor Network
                </Link>
                <Link href="#deals" className="btn btn-secondary">
                  View Sample Deals
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Deal Types */}
      <section className="section section-alt">
        <div className="container-content">
          <div className="text-center mb-12">
            <div className="gold-accent mx-auto mb-4" />
            <h2>Investment opportunities we source</h2>
            <p className="mt-4 text-charcoal/80 max-w-2xl mx-auto">
              We focus on deals that make sense — with real numbers and clear upside.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {dealTypes.map((type) => (
              <Card key={type.title} className="text-center">
                <div className="w-14 h-14 bg-capital-gold/10 rounded-full flex items-center justify-center mx-auto mb-4 text-capital-gold">
                  {type.icon}
                </div>
                <h3 className="text-xl mb-2">{type.title}</h3>
                <p className="text-charcoal/70 text-sm">{type.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Deals */}
      <section id="deals" className="section">
        <div className="container-content">
          <div className="text-center mb-12">
            <div className="gold-accent mx-auto mb-4" />
            <h2>Sample deal flow</h2>
            <p className="mt-4 text-charcoal/80 max-w-2xl mx-auto">
              Here&apos;s a snapshot of the types of deals we bring to our investor network.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {sampleDeals.map((deal) => (
              <motion.div
                key={deal.address}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <Card variant="elevated" className="h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg">{deal.address}</h3>
                      <p className="text-charcoal/60 text-sm">{deal.area}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        deal.status === 'Available'
                          ? 'bg-success/10 text-success'
                          : 'bg-warning/10 text-warning'
                      }`}
                    >
                      {deal.status}
                    </span>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal/60">Type</span>
                      <span className="font-medium">{deal.type}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal/60">Asking Price</span>
                      <span className="font-medium">{deal.askingPrice}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal/60">ARV</span>
                      <span className="font-medium">{deal.arv}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal/60">Repair Estimate</span>
                      <span className="font-medium">{deal.repairEstimate}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-stone">
                    <div className="flex justify-between items-center">
                      <span className="text-charcoal/60 text-sm">Potential Profit</span>
                      <span className="text-xl font-heading font-bold text-cedar-green">
                        {deal.potentialProfit}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-charcoal/60 text-sm">
              Sample deals for illustration. Join our network to see current opportunities.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section bg-cedar-green">
        <div className="container-content">
          <div className="text-center mb-12">
            <h2 className="text-cream">Why partner with Cedar Capital?</h2>
            <p className="mt-4 text-cream/80 max-w-2xl mx-auto">
              We&apos;re not just another wholesaler. We&apos;re your Austin market partner.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="bg-cream/5 rounded-card p-6">
                <div className="w-10 h-10 bg-capital-gold/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-capital-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg text-cream mb-2">{benefit.title}</h3>
                <p className="text-cream/70 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Form */}
      <section id="partner" className="section">
        <div className="container-content">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="gold-accent mb-6" />
              <h2 className="mb-6">Join our investor network</h2>
              <p className="text-charcoal/80 mb-6">
                Get notified when new deals hit our pipeline. No spam, no fluff — just quality opportunities delivered to your inbox.
              </p>
              <ul className="space-y-3">
                {[
                  'First access to off-market deals',
                  'Detailed property analysis packages',
                  'Direct communication with our team',
                  'No obligation — unsubscribe anytime',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-charcoal/80">
                    <svg className="w-5 h-5 text-capital-gold flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card variant="elevated" className="p-8">
                {submitted ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl mb-2">You&apos;re in!</h3>
                    <p className="text-charcoal/70">
                      We&apos;ll send you our latest deals as they become available.
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-2xl mb-2">Get deal alerts</h3>
                    <p className="text-charcoal/70 mb-6">
                      Tell us what you&apos;re looking for.
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
                        <label htmlFor="investmentType" className="label">
                          Investment strategy
                        </label>
                        <select
                          id="investmentType"
                          className="input"
                          value={formData.investmentType}
                          onChange={(e) => setFormData({ ...formData, investmentType: e.target.value })}
                        >
                          <option value="">Select strategy</option>
                          <option value="flip">Fix & Flip</option>
                          <option value="hold">Buy & Hold</option>
                          <option value="wholesale">Wholesale</option>
                          <option value="all">All of the above</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="budget" className="label">
                          Investment budget
                        </label>
                        <select
                          id="budget"
                          className="input"
                          value={formData.budget}
                          onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                        >
                          <option value="">Select budget</option>
                          <option value="under200k">Under $200k</option>
                          <option value="200-400k">$200k - $400k</option>
                          <option value="400-600k">$400k - $600k</option>
                          <option value="over600k">$600k+</option>
                        </select>
                      </div>

                      <Button type="submit" variant="accent" className="w-full">
                        Join the Network
                      </Button>
                    </form>
                  </>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  )
}

'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'

export default function AudienceSplit() {
  return (
    <section className="section">
      <div className="container-content">
        <div className="text-center mb-12">
          <div className="gold-accent mx-auto mb-4" />
          <h2>How can we help you?</h2>
          <p className="mt-4 text-charcoal/80 max-w-2xl mx-auto">
            Whether you&apos;re looking to sell your home or find your next investment, we&apos;re here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Sellers Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Card variant="elevated" className="h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-cedar-green/10 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-cedar-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <h3 className="text-2xl">For Homeowners</h3>
              </div>

              <p className="text-charcoal/70 mb-6">
                Need to sell your home quickly? We provide fair cash offers with no repairs, no showings, and no hassle. Sell on your timeline.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  'Cash offers within 24 hours',
                  'Close in as little as 7 days',
                  'No repairs or cleaning needed',
                  'No agent fees or commissions',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-charcoal/80">
                    <svg className="w-5 h-5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>

              <Link href="/sellers" className="btn btn-primary w-full">
                Get Your Free Offer
              </Link>
            </Card>
          </motion.div>

          {/* Investors Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Card variant="elevated" className="h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-capital-gold/10 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-capital-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-2xl">For Investors</h3>
              </div>

              <p className="text-charcoal/70 mb-6">
                Looking for quality Austin real estate deals? We source, vet, and package off-market opportunities with clear numbers and transparent analysis.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  'Vetted deal flow you can trust',
                  'Clear ROI and investment analysis',
                  'Off-market opportunities',
                  'Austin market expertise',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-charcoal/80">
                    <svg className="w-5 h-5 text-capital-gold flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>

              <Link href="/investors" className="btn btn-accent w-full">
                View Opportunities
              </Link>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

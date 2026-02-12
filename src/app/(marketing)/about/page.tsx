'use client'

import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import CTASection from '@/components/sections/CTASection'

const values = [
  {
    title: 'Honesty',
    description: 'We say what we mean and follow through on our promises. No hidden fees, no surprises.',
  },
  {
    title: 'Fairness',
    description: 'Our offers are based on real market data. We want deals that work for everyone.',
  },
  {
    title: 'Respect',
    description: 'We understand selling a home is personal. We treat every homeowner with care and dignity.',
  },
  {
    title: 'Local First',
    description: 'We live and work in Austin. This is our community, and we invest in its future.',
  },
]

const timeline = [
  {
    year: 'Founded',
    title: 'Starting Local',
    description: 'Cedar Capital was founded with a simple mission: help Austin homeowners sell their properties quickly and fairly.',
  },
  {
    year: 'Growing',
    title: 'Building Trust',
    description: 'We focused on doing right by every homeowner, one transaction at a time. Word spread.',
  },
  {
    year: 'Today',
    title: 'Serving Austin',
    description: 'We continue to serve the Austin community, helping homeowners and investors achieve their real estate goals.',
  },
]

export default function AboutPage() {
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
              <h1 className="mb-6">We&apos;re real people who actually show up.</h1>
              <p className="text-lg text-charcoal/80">
                Cedar Capital isn&apos;t a faceless corporation or a tech startup pretending to care. We&apos;re local Austin residents who buy homes directly from homeowners. We use modern tools to move fast, but we never forget that behind every home is a real person with real needs.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="section section-alt">
        <div className="container-content">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="mb-6">Our Story</h2>
              <div className="space-y-4 text-charcoal/80">
                <p>
                  Cedar Capital started because we saw too many homeowners struggling with the traditional home-selling process. Endless showings, expensive repairs, uncertain timelines, and hefty agent commissions made what should be straightforward incredibly stressful.
                </p>
                <p>
                  We knew there had to be a better way. So we built Cedar Capital to be the kind of home buyer we&apos;d want to work with ourselves — straightforward, fair, and reliable.
                </p>
                <p>
                  Today, we&apos;ve helped over 100 Austin families sell their homes on their terms. Whether you&apos;re facing a difficult situation or simply want a hassle-free sale, we&apos;re here to help.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              {timeline.map((item, index) => (
                <div key={item.year} className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-cedar-green rounded-full flex items-center justify-center text-cream font-heading font-bold text-sm">
                      {index + 1}
                    </div>
                  </div>
                  <div>
                    <div className="text-capital-gold font-heading font-semibold text-sm mb-1">
                      {item.year}
                    </div>
                    <h3 className="text-lg mb-1">{item.title}</h3>
                    <p className="text-charcoal/70 text-sm">{item.description}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="section">
        <div className="container-content">
          <div className="text-center mb-12">
            <div className="gold-accent mx-auto mb-4" />
            <h2>What we stand for</h2>
            <p className="mt-4 text-charcoal/80 max-w-2xl mx-auto">
              Our values guide every interaction and every offer we make.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {values.map((value) => (
              <Card key={value.title} className="text-center">
                <div className="w-12 h-12 bg-capital-gold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-3 h-3 bg-capital-gold rounded-full" />
                </div>
                <h3 className="text-lg mb-2">{value.title}</h3>
                <p className="text-charcoal/70 text-sm">{value.description}</p>
              </Card>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Commitment Section */}
      <section className="section bg-cedar-green">
        <div className="container-content">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-cream mb-6">Our commitment to you</h2>
            <div className="space-y-4 text-cream/80">
              <p>
                When you work with Cedar Capital, you&apos;re working with people who care about doing right by you. We&apos;ll give you a fair offer, explain everything clearly, and never pressure you to make a decision.
              </p>
              <p>
                If selling to us isn&apos;t the right fit, we&apos;ll tell you. We&apos;d rather lose a deal than have a homeowner regret working with us.
              </p>
            </div>
            <div className="mt-8 text-cream font-heading font-semibold text-lg">
              That&apos;s the Cedar Capital promise.
            </div>
          </div>
        </div>
      </section>

      <CTASection
        title="Ready to talk?"
        description="No pressure, no obligation. Just a conversation about how we can help."
        primaryCTA={{ text: "Get a Fair Offer", href: "/sellers" }}
        secondaryCTA={{ text: "Contact Us", href: "/contact" }}
      />
    </>
  )
}

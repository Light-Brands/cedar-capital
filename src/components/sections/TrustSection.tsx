'use client'

import { motion } from 'framer-motion'

const stats = [
  { value: '100+', label: 'Homes Purchased' },
  { value: '24hrs', label: 'Average Offer Time' },
  { value: '14', label: 'Average Days to Close' },
  { value: '$0', label: 'Fees or Commissions' },
]

export default function TrustSection() {
  return (
    <section className="section bg-cedar-green">
      <div className="container-content">
        <div className="text-center mb-12">
          <h2 className="text-cream">Real people. Real results.</h2>
          <p className="mt-4 text-cream/80 max-w-2xl mx-auto">
            We&apos;re not a faceless corporation. We&apos;re local Austin residents who buy homes directly from homeowners like you.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl md:text-5xl font-heading font-bold text-capital-gold mb-2">
                {stat.value}
              </div>
              <div className="text-cream/70 text-sm">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-16 text-center"
        >
          <blockquote className="text-xl md:text-2xl text-cream italic max-w-3xl mx-auto">
            &ldquo;Cedar Capital made selling our home incredibly easy. They were honest, transparent, and closed on our timeline. I couldn&apos;t have asked for a better experience.&rdquo;
          </blockquote>
          <div className="mt-4 text-cream/70">
            — Austin Homeowner
          </div>
        </motion.div>
      </div>
    </section>
  )
}

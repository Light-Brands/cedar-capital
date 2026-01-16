'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

interface CTASectionProps {
  title?: string
  description?: string
  primaryCTA?: {
    text: string
    href: string
  }
  secondaryCTA?: {
    text: string
    href: string
  }
}

export default function CTASection({
  title = "Ready to get started?",
  description = "Whether you're looking to sell your home or find your next investment opportunity, we're here to help.",
  primaryCTA = { text: "Get a Fair Offer", href: "/sellers" },
  secondaryCTA = { text: "Talk to Us", href: "/contact" },
}: CTASectionProps) {
  return (
    <section className="section">
      <div className="container-content">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-sand border border-stone rounded-card p-8 md:p-12 text-center"
        >
          <div className="gold-accent mx-auto mb-6" />
          <h2 className="mb-4">{title}</h2>
          <p className="text-charcoal/80 max-w-2xl mx-auto mb-8">
            {description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={primaryCTA.href} className="btn btn-primary">
              {primaryCTA.text}
            </Link>
            <Link href={secondaryCTA.href} className="btn btn-secondary">
              {secondaryCTA.text}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

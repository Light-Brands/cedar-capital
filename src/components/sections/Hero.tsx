'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export default function Hero() {
  return (
    <section className="relative bg-cream overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-cedar-green/10 rounded-bl-[200px]" />
      </div>

      <div className="container-content relative">
        <div className="py-20 md:py-28 lg:py-36">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="gold-accent mb-6" />
              <h1 className="mb-6">
                Local Austin buyers.
                <br />
                <span className="text-evergreen">Fast, fair offers.</span>
              </h1>
              <p className="text-lg md:text-xl text-charcoal/80 mb-8 max-w-2xl">
                We&apos;re Cedar Capital — local Austin buyers who help homeowners sell fast, fair, and stress-free. No repairs needed. No endless showings. No pressure.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link href="/sellers" className="btn btn-primary">
                Get a Fair Offer
              </Link>
              <Link href="/investors" className="btn btn-secondary">
                View Investment Opportunities
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-12 flex items-center gap-8 text-sm text-charcoal/60"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>No fees or commissions</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Close in as little as 7 days</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

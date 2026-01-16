import Link from 'next/link'
import Logo from '@/components/ui/Logo'

const footerLinks = {
  company: [
    { name: 'About Us', href: '/about' },
    { name: 'Contact', href: '/contact' },
  ],
  sellers: [
    { name: 'How It Works', href: '/sellers#how-it-works' },
    { name: 'Get an Offer', href: '/sellers' },
  ],
  investors: [
    { name: 'Deal Flow', href: '/investors' },
    { name: 'Partner With Us', href: '/investors#partner' },
  ],
}

export default function Footer() {
  return (
    <footer className="bg-navy-ink text-cream">
      <div className="container-content section">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Logo variant="light" />
            <p className="mt-4 text-cream/80 text-sm leading-relaxed">
              Local Austin buyers helping homeowners sell fast, fair, and stress-free.
            </p>
            <p className="mt-4 text-cream/60 text-sm">
              Austin, Texas
            </p>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="text-capital-gold font-heading font-semibold mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-cream/80 hover:text-cream transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Sellers Links */}
          <div>
            <h4 className="text-capital-gold font-heading font-semibold mb-4">For Sellers</h4>
            <ul className="space-y-3">
              {footerLinks.sellers.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-cream/80 hover:text-cream transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Investors Links */}
          <div>
            <h4 className="text-capital-gold font-heading font-semibold mb-4">For Investors</h4>
            <ul className="space-y-3">
              {footerLinks.investors.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-cream/80 hover:text-cream transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-cream/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-cream/60 text-sm">
              &copy; {new Date().getFullYear()} Cedar Capital. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm">
              <Link href="/privacy" className="text-cream/60 hover:text-cream transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-cream/60 hover:text-cream transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

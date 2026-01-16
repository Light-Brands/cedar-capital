interface LogoProps {
  variant?: 'default' | 'light'
  size?: 'sm' | 'md' | 'lg'
}

export default function Logo({ variant = 'default', size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-10',
  }

  const textColor = variant === 'light' ? 'text-cream' : 'text-cedar-green'
  const goldColor = 'text-capital-gold'

  return (
    <div className={`flex items-center gap-2 ${sizeClasses[size]}`}>
      {/* Cedar Tree Icon */}
      <svg
        viewBox="0 0 40 40"
        className={`${sizeClasses[size]} aspect-square`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Tree shape */}
        <path
          d="M20 4L8 18h5l-4 8h6l-3 6h16l-3-6h6l-4-8h5L20 4z"
          className={variant === 'light' ? 'fill-cream' : 'fill-cedar-green'}
        />
        {/* House silhouette in tree */}
        <path
          d="M20 22l-5 4v6h4v-4h2v4h4v-6l-5-4z"
          className="fill-capital-gold"
        />
        {/* Trunk */}
        <rect
          x="18"
          y="32"
          width="4"
          height="4"
          className={variant === 'light' ? 'fill-cream/80' : 'fill-cedar-green/80'}
        />
      </svg>

      {/* Text */}
      <div className="flex flex-col leading-none">
        <span className={`font-heading font-bold text-lg tracking-tight ${textColor}`}>
          Cedar
        </span>
        <span className={`font-heading font-semibold text-sm tracking-wide ${goldColor}`}>
          Capital
        </span>
      </div>
    </div>
  )
}

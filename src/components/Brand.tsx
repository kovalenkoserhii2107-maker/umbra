export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0a0a0a" />
      <circle cx="32" cy="32" r="22" fill="url(#umbra-corona)" />
      <circle cx="32" cy="32" r="16.2" fill="url(#umbra-sun)" />
      <circle cx="32.6" cy="32" r="14.6" fill="#0a0a0a" />
      <defs>
        <radialGradient id="umbra-corona" cx="32" cy="32" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0.58" stopColor="#ffb07a" stopOpacity="0" />
          <stop offset="0.72" stopColor="#ff9e64" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff9e64" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="umbra-sun" cx="30" cy="29" r="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6e8" />
          <stop offset="0.7" stopColor="#ffd09a" />
          <stop offset="1" stopColor="#ff9e64" />
        </radialGradient>
      </defs>
    </svg>
  )
}

export function BrandWordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const scale = size === 'lg' ? 'text-[34px] sm:text-[40px]' : size === 'sm' ? 'text-[15px]' : 'text-[22px]'
  return (
    <span className={`leading-none tracking-[0.26em] text-ink ${scale}`} style={{ fontWeight: 600 }}>
      UMBRA
    </span>
  )
}

export function BrandLockup({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark size={size === 'lg' ? 36 : 28} />
      <BrandWordmark size={size === 'lg' ? 'lg' : 'sm'} />
    </span>
  )
}

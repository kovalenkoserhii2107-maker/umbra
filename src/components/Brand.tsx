export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0a0a0a"/>
      <path fill="#fcfcfc" fillRule="evenodd" d="M30 14.5a17.5 17.5 0 1 0 0 35 17.5 17.5 0 0 0 0-35Zm7.2 0a17.5 17.5 0 1 0 0 35 17.5 17.5 0 0 0 0-35Z"/>
      <path d="M30 15.6a16.4 16.4 0 0 0 0 32.8" stroke="#ff9e64" strokeWidth="2.2" strokeLinecap="round"/>
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

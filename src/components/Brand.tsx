export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand-mark.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="block shrink-0"
    />
  );
}

export function BrandWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const scale =
    size === "lg"
      ? "text-[34px] sm:text-[40px]"
      : size === "sm"
        ? "text-[15px]"
        : "text-[22px]";
  return (
    <span
      className={`leading-none tracking-[0.26em] text-ink ${scale}`}
      style={{ fontWeight: 600 }}
    >
      UMBRA
    </span>
  );
}

export function BrandLockup({ size = "sm" }: { size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="inline-flex flex-col items-center gap-4">
        <BrandMark size={132} />
        <BrandWordmark size="lg" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark size={40} />
      <BrandWordmark size="sm" />
    </span>
  );
}

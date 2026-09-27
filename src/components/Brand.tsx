export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand-mark.jpg`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="shrink-0 rounded-[22%]"
    />
  );
}

export function BrandWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const scale =
    size === "lg" ? "text-4xl" : size === "sm" ? "text-[17px]" : "text-2xl";
  return (
    <span
      className={`font-['Playfair_Display'] font-bold leading-none text-[#D4AF37] ${scale}`}
    >
      Umbra
    </span>
  );
}

export function BrandLockup({ size = "sm" }: { size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="inline-flex flex-col items-center gap-3">
        <BrandMark size={112} />
        <BrandWordmark size="lg" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <BrandMark size={30} />
      <BrandWordmark size="sm" />
    </span>
  );
}

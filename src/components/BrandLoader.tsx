import { cn } from "@/lib/utils";

type BrandLoaderProps = {
  label?: string;
  className?: string;
};

// Branded full-height loading state that shows the SeenTube logo.
export default function BrandLoader({ label = "Loading…", className }: BrandLoaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/15" />
        <img
          src="/icons/icon-192.png"
          alt="SeenTube"
          className="relative h-20 w-20 animate-pulse rounded-2xl object-contain"
        />
      </span>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

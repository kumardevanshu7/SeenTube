import { cn, formatStatus } from "@/lib/utils";
import type { VideoStatusEnum } from "@/lib/constants";
import { Clock, Eye, CheckCircle2 } from "lucide-react";

interface StatusBadgeProps {
  status: VideoStatusEnum;
  size?: "xs" | "sm" | "md" | "lg";
  showIcon?: boolean;
  short?: boolean;
  className?: string;
}

const statusConfig: Record<
  VideoStatusEnum,
  { label: string; shortLabel: string; icon: typeof Clock; badgeClass: string; glowClass: string }
> = {
  pending: {
    label: "Pending",
    shortLabel: "Pending",
    icon: Clock,
    badgeClass: "badge-pending",
    glowClass: "glow-amber",
  },
  partially_watched: {
    label: "Partially Watched",
    shortLabel: "Partial",
    icon: Eye,
    badgeClass: "badge-partially",
    glowClass: "glow-blue",
  },
  watched: {
    label: "Watched",
    shortLabel: "Watched",
    icon: CheckCircle2,
    badgeClass: "badge-watched",
    glowClass: "glow-green",
  },
};

const sizeClasses = {
  xs: "text-[10px] px-1.5 py-0.5 gap-0.5",
  sm: "text-xs px-2 py-0.5 gap-1",
  md: "text-sm px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

const iconSizes = {
  xs: "w-2.5 h-2.5",
  sm: "w-3 h-3",
  md: "w-3.5 h-3.5",
  lg: "w-4 h-4",
};

export default function StatusBadge({
  status,
  size = "md",
  showIcon = true,
  short = false,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        config.badgeClass,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], "shrink-0")} />}
      {short ? config.shortLabel : config.label}
    </span>
  );
}

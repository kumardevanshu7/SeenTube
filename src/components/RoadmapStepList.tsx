import {
  ArrowDown,
  ArrowDownCircle,
  ArrowUp,
  CheckCircle2,
  CircleX,
  Clock3,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { youtubeThumbnailUrl, youtubeWatchUrl, type RoadmapStep, type RoadmapStepStatus } from "@/lib/roadmaps";

type StepStatusPickerProps = {
  status: RoadmapStepStatus;
  editable: boolean;
  disabled?: boolean;
  onChange?: (status: RoadmapStepStatus) => void;
};

function StepStatusPicker({
  status,
  editable,
  disabled = false,
  onChange,
}: StepStatusPickerProps) {
  const options = [
    { value: "completed" as const, label: "Completed", Icon: CheckCircle2, active: "border-emerald-300 bg-emerald-50 text-emerald-700" },
    { value: "not_completed" as const, label: "Not completed", Icon: CircleX, active: "border-rose-300 bg-rose-50 text-rose-700" },
    { value: "pending" as const, label: "Pending", Icon: Clock3, active: "border-amber-300 bg-amber-50 text-amber-700" },
  ];
  const isLocked = status === "completed";

  return (
    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Video progress status">
      {options.map(({ value, label, Icon, active }) => {
        const selected = status === value;
        const optionDisabled = !editable || disabled || (isLocked && !selected);
        return (
          <button
            key={value}
            type="button"
            title={isLocked && !selected ? "Completed status is locked" : label}
            aria-label={`${label}${selected ? ", selected" : ""}${isLocked && !selected ? ", locked" : ""}`}
            aria-pressed={selected}
            disabled={optionDisabled}
            onClick={() => onChange?.(value)}
            className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
              selected ? active : "border-border bg-white text-muted-foreground"
            } ${editable && !optionDisabled ? "hover:border-primary/50" : "cursor-default"} ${
              optionDisabled && !selected ? "opacity-50" : ""
            }`}
          >
            {disabled && selected ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            <span>{label}</span>
          </button>
        );
      })}
      {isLocked && editable && (
        <p className="w-full text-[11px] text-muted-foreground">Completed — status is locked.</p>
      )}
    </div>
  );
}
type RoadmapStepListProps = {
  steps: RoadmapStep[];
  editable?: boolean;
  allowRemove?: boolean;
  statusEditable?: boolean;
  updatingStepId?: string | null;
  onMove?: (index: number, direction: -1 | 1) => void;
  onRemove?: (index: number) => void;
  onStatusChange?: (stepId: string, status: RoadmapStepStatus) => void;
};

export default function RoadmapStepList({
  steps,
  editable = false,
  allowRemove = true,
  statusEditable = false,
  updatingStepId,
  onMove,
  onRemove,
  onStatusChange,
}: RoadmapStepListProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <div key={step.id}>
          <article className="flex gap-3 rounded-lg border border-border bg-white p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <a
                href={youtubeWatchUrl(step.youtubeId)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 flex-col gap-3 sm:flex-row"
                aria-label={`Watch ${step.title} on YouTube`}
              >
                <img
                  src={step.thumbnail || youtubeThumbnailUrl(step.youtubeId)}
                  alt=""
                  className="aspect-video w-full shrink-0 rounded-md bg-secondary object-cover sm:h-20 sm:w-32"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = youtubeThumbnailUrl(step.youtubeId);
                  }}
                />
                <span className="min-w-0 self-center">
                  <span className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary sm:text-base">
                    {step.title}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Open on YouTube <ExternalLink className="h-3 w-3" />
                  </span>
                </span>
              </a>
              <StepStatusPicker
                status={step.status}
                editable={statusEditable}
                disabled={updatingStepId === step.id}
                onChange={(status) => onStatusChange?.(step.id, status)}
              />
            </div>
            {editable && (
              <div className="flex shrink-0 flex-col gap-1">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove?.(index, -1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove?.(index, 1)} disabled={index === steps.length - 1} aria-label={`Move step ${index + 1} down`}>
                  <ArrowDown />
                </Button>
                {allowRemove && (
                  <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => onRemove?.(index)} aria-label={`Remove step ${index + 1}`}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            )}
          </article>
          {index < steps.length - 1 && (
            <div className="flex h-10 items-center justify-center text-primary" aria-hidden="true">
              <ArrowDownCircle className="h-6 w-6" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

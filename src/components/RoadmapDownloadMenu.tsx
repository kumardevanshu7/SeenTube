import { useState } from "react";
import { Download, FileCode2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { downloadRoadmapHtml, downloadRoadmapPdf } from "@/lib/roadmap-export";
import type { Roadmap } from "@/lib/roadmaps";

type RoadmapDownloadMenuProps = {
  roadmap: Roadmap;
  ownerName: string;
  ownerUsername?: string;
  className?: string;
};

/** A dev-machine URL is useless inside a shared file, so leave it out. */
const isLocalOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(origin);

export default function RoadmapDownloadMenu({
  roadmap,
  ownerName,
  ownerUsername,
  className,
}: RoadmapDownloadMenuProps) {
  const [busy, setBusy] = useState<"html" | "pdf" | null>(null);

  const appUrl = typeof window === "undefined" || isLocalOrigin(window.location.origin)
    ? undefined
    : `${window.location.origin}/roadmaps/${encodeURIComponent(roadmap.id)}`;

  const runExport = async (format: "html" | "pdf") => {
    if (busy) return;
    setBusy(format);
    try {
      if (format === "html") {
        await downloadRoadmapHtml(roadmap, { ownerName, ownerUsername, appUrl });
        toast.success("HTML roadmap downloaded");
      } else {
        await downloadRoadmapPdf(roadmap, { ownerName, ownerUsername, appUrl });
        toast.success("PDF roadmap downloaded");
      }
    } catch (error) {
      console.error("Roadmap export error:", error);
      toast.error("Could not create the download. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="lg" variant="outline" className={className} disabled={Boolean(busy)}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {busy ? "Preparing download…" : "Download roadmap"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Download this roadmap</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void runExport("pdf");
          }}
        >
          <FileText />
          <span className="flex flex-col">
            <span className="font-semibold">PDF document</span>
            <span className="text-xs text-muted-foreground">Every video links to YouTube</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void runExport("html");
          }}
        >
          <FileCode2 />
          <span className="flex flex-col">
            <span className="font-semibold">HTML page</span>
            <span className="text-xs text-muted-foreground">Styled page with thumbnails and links</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

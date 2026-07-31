"use client";

import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Full-height modal that embeds a PDF blob URL. The browser's built-in
 * PDF viewer scrolls through multi-page documents inside the iframe.
 */
export function PdfPreviewDialog({
  open,
  url,
  filename,
  onOpenChange,
  onDownload,
}: {
  open: boolean;
  url: string | null;
  filename?: string | null;
  onOpenChange: (open: boolean) => void;
  onDownload?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="z-[60] flex h-[min(92dvh,52rem)] w-[min(96vw,48rem)] max-w-[min(96vw,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,48rem)]"
        style={{ display: "flex" }}
      >
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-border px-4 py-3">
          <div className="min-w-0 space-y-1">
            <DialogTitle>Export preview</DialogTitle>
            <DialogDescription className="truncate">
              {filename ?? "PDF"} — scroll to review pages
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onDownload ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={onDownload}
              >
                <Download className="size-3.5" />
                Download
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Close preview"
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 bg-muted/40">
          {url ? (
            <iframe
              title={filename ?? "PDF preview"}
              src={`${url}#view=FitH`}
              className="h-full w-full border-0"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

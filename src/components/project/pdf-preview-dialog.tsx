"use client";

import { Download, Loader2, X } from "lucide-react";
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
 * Supports a loading / error panel while the export is being built.
 */
export function PdfPreviewDialog({
  open,
  url,
  filename,
  loading = false,
  error = null,
  downloading = false,
  onOpenChange,
  onDownload,
}: {
  open: boolean;
  url: string | null;
  filename?: string | null;
  loading?: boolean;
  error?: string | null;
  downloading?: boolean;
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
              {loading
                ? "Building PDF…"
                : error
                  ? "Could not build preview"
                  : `${filename ?? "PDF"} — scroll to review pages`}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onDownload && !loading && !error ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-[var(--project-accent)]"
                disabled={downloading}
                onClick={onDownload}
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {downloading ? "Exporting…" : "Download"}
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

        <div className="relative min-h-0 flex-1 bg-muted/40">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Loader2 className="size-8 animate-spin text-[var(--project-accent)]" />
              <p className="text-sm text-muted-foreground">
                Building your scene pack…
              </p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-foreground">
                Nothing to preview
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
            </div>
          ) : url ? (
            <iframe
              title={filename ?? "PDF preview"}
              src={`${url}#view=FitH`}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
              No preview available.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

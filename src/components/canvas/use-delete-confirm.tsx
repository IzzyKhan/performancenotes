"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteConfirmRequest = {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

/**
 * Confirmation for destructive row-level actions inside canvas nodes
 * (beats, characters, shots, grid images). Whole-node deletes are confirmed
 * by the canvas itself — see InstinctCanvas.
 */
export function useDeleteConfirm() {
  const [pending, setPending] = useState<DeleteConfirmRequest | null>(null);

  const requestDelete = useCallback((request: DeleteConfirmRequest) => {
    setPending(request);
  }, []);

  const deleteDialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{pending?.title ?? "Delete?"}</DialogTitle>
          <DialogDescription>{pending?.description ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4 pt-2">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-destructive hover:text-white"
            onClick={() => {
              pending?.onConfirm();
              setPending(null);
            }}
          >
            {pending?.confirmLabel ?? "Delete"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPending(null)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { requestDelete, deleteDialog };
}

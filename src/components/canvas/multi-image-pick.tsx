"use client";

import { createContext, useCallback, useContext, useRef } from "react";

type MultiImagePickHandler = (files: File[]) => void;

export type MultiImagePickRequest = (handler: MultiImagePickHandler) => void;

const MultiImagePickContext = createContext<MultiImagePickRequest>(() => {
  // no-op outside provider
});

export function useMultiImagePick(): MultiImagePickRequest {
  return useContext(MultiImagePickContext);
}

/**
 * File inputs inside React Flow nodes remount when the OS dialog closes,
 * so onChange never fires. Keep the input outside the node tree.
 */
export function MultiImagePickProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handlerRef = useRef<MultiImagePickHandler | null>(null);

  const requestPick = useCallback<MultiImagePickRequest>((handler) => {
    handlerRef.current = handler;
    inputRef.current?.click();
  }, []);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Snapshot files BEFORE clearing — FileList is live and empties on reset.
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    const handler = handlerRef.current;
    handlerRef.current = null;
    if (!handler || files.length === 0) return;
    handler(files);
  }, []);

  return (
    <MultiImagePickContext.Provider value={requestPick}>
      {children}
      {/* Visually hidden (not display:none) — more reliable with programmatic click */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif,image/webp,image/*"
        onChange={onChange}
        className="pointer-events-none fixed top-0 left-0 h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </MultiImagePickContext.Provider>
  );
}

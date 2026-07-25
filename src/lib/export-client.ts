import { toast } from "sonner";

export async function downloadExport(params: URLSearchParams) {
  const res = await fetch(`/api/export?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Export failed" }));
    toast.error(
      typeof err.error === "string" ? err.error : "Export failed"
    );
    return;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = match?.[1] ?? "export";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Open the PDF in a new tab for review before downloading. */
export async function previewExport(params: URLSearchParams) {
  const previewParams = new URLSearchParams(params);
  previewParams.set("disposition", "inline");
  previewParams.delete("format");
  const res = await fetch(`/api/export?${previewParams}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Preview failed" }));
    toast.error(
      typeof err.error === "string" ? err.error : "Preview failed"
    );
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    toast.error("Pop-up blocked — allow pop-ups to preview exports");
    URL.revokeObjectURL(url);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Performance Notes",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <Link
          href="/"
          className="mb-10 flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Clapperboard className="size-4 stroke-[1.5]" />
          <span className="text-xs tracking-wide">Performance Notes</span>
        </Link>

        <h1 className="text-2xl font-medium tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Early-access version — last updated August 2026. A full policy will
          be published before general availability.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Your script stays yours
            </h2>
            <p>
              When you upload a screenplay PDF, it is parsed in your browser.
              We extract and store scene headings (slug lines) only — dialogue,
              action, and the PDF itself are never sent to or stored on our
              servers.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              What we store
            </h2>
            <p>
              Your account email, your projects and scene headings, the notes,
              links, and images you add to scene canvases, and your prep and
              schedule dates. Images you upload are stored so we can show them
              back to you; they are not used for anything else.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Payments
            </h2>
            <p>
              Paid subscriptions are handled by Stripe. We never see or store
              your card details — we keep only a Stripe customer reference and
              your plan status.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              No tracking, no selling
            </h2>
            <p>
              We do not sell your data, run ads, or use third-party tracking.
              We may collect basic, anonymous usage metrics to improve the
              product.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Deleting your data
            </h2>
            <p>
              Deleting a project removes its scenes, notes, and images.
              During early access, contact us to delete your account entirely
              and we will action it promptly.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-border pt-5 text-xs text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}

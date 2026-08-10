import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — Performance Notes",
};

export default function TermsPage() {
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

        <h1 className="text-2xl font-medium tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Early-access version — last updated August 2026. Full terms will be
          published before general availability.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Early access
            </h2>
            <p>
              Performance Notes is in early access. Features may change and
              occasional downtime is possible while we improve the product with
              working directors. We recommend keeping your own copies of
              exported packs.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Your content
            </h2>
            <p>
              You own everything you create and upload — scene headings, notes,
              references, and images. You grant us only the rights needed to
              store and display that content back to you. Don&apos;t upload
              material you don&apos;t have the right to use.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Plans and billing
            </h2>
            <p>
              The Free plan covers one short-film project (the first 15 scenes
              are unlocked). Solo and Pro are monthly subscriptions billed
              through Stripe and can be cancelled any time from the billing
              portal; access continues to the end of the paid period.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Acceptable use
            </h2>
            <p>
              Don&apos;t abuse the service, attempt to access other
              users&apos; data, or use it for anything unlawful. We may
              suspend accounts that do.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-medium text-foreground">
              Liability
            </h2>
            <p>
              The service is provided &quot;as is&quot; during early access,
              without warranties. To the maximum extent permitted by law, our
              liability is limited to the amount you paid us in the previous
              twelve months.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-border pt-5 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

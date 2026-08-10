import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Clapperboard,
  FileUp,
  LayoutGrid,
  ShieldCheck,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Public front door shown to signed-out visitors at `/`.
 * Deliberately minimal for the early-access launch — no video, no pricing
 * table. Copy mirrors docs/launchnotes.md (slug-only privacy, Free tier CTA,
 * greyed Solo/Pro until billing is live).
 */
export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-foreground">
          <Clapperboard className="size-4 stroke-[1.5]" />
          <span className="text-sm font-medium tracking-tight">
            Performance Notes
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6">
        <section className="pt-14 pb-10 sm:pt-20">
          <p className="mb-5 inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            Early access — built with working directors
          </p>
          <h1 className="max-w-2xl text-3xl font-medium tracking-tight sm:text-4xl">
            Prep your film scene by scene
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Upload a script, pin references to every scene, track your prep
            pace, and export packs ordered for the shoot day.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={cn(buttonVariants(), "gap-1.5")}>
              Start free
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="mb-10 rounded-lg border border-border bg-muted/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                Your script stays yours.
              </span>{" "}
              We parse and store scene headings only — dialogue and action
              never leave your device.
            </p>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-5">
            <FileUp className="size-4 stroke-[1.5] text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">Slug-only script import</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Upload a screenplay PDF and your scenes appear as a checklist of
              headings. Script revisions diff cleanly — prep carries over.
            </p>
          </div>
          <div className="rounded-lg border border-border p-5">
            <LayoutGrid className="size-4 stroke-[1.5] text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">A canvas per scene</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Drop images, links, and notes onto each scene&apos;s instinct
              layer — raw references, organized where you&apos;ll use them.
            </p>
          </div>
          <div className="rounded-lg border border-border p-5">
            <CalendarClock className="size-4 stroke-[1.5] text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">Prep pace + shoot days</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Tick scenes as prepped, see the scenes/day you need before the
              shoot, and export packs in shoot-day order.
            </p>
          </div>
        </section>

        <section className="border-t border-border pb-16 pt-8">
          <h2 className="text-sm font-medium">Plans</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-foreground/20 bg-muted/20 p-4">
              <p className="text-xs font-medium text-foreground">Free</p>
              <p className="mt-1 text-lg font-medium tracking-tight">$0</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Prep a short film — first 15 scenes unlocked, 1 project, 1
                script.
              </p>
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "mt-4 w-full gap-1"
                )}
              >
                Start free
                <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="rounded-lg border border-border p-4 opacity-50">
              <p className="text-xs font-medium text-muted-foreground">Solo</p>
              <p className="mt-1 text-lg font-medium tracking-tight text-muted-foreground">
                $9/mo
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                One project, unlimited scenes — for a feature or longer short.
              </p>
              <p className="mt-4 text-center text-[11px] font-medium text-muted-foreground">
                Launching soon
              </p>
            </div>
            <div className="rounded-lg border border-border p-4 opacity-50">
              <p className="text-xs font-medium text-muted-foreground">Pro</p>
              <p className="mt-1 text-lg font-medium tracking-tight text-muted-foreground">
                $15/mo
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Unlimited projects, scripts, and scenes — series and episodic
                prep.
              </p>
              <p className="mt-4 text-center text-[11px] font-medium text-muted-foreground">
                Launching soon
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-muted-foreground">
          <span suppressHydrationWarning>
            © {new Date().getFullYear()} Performance Notes
          </span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/** Professional shared App Router fallback for page transitions and streamed route content. */
export function PageLoadingState({ label = "Loading dashboard..." }: { label?: string }) {
  return (
    <main
      className="mx-auto w-full max-w-[1600px] flex flex-col gap-6 p-4 sm:p-6 lg:p-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>

      {/* Header section with page title skeleton and actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Spinner className="size-3.5 text-muted-foreground/60" />
          </div>
          <Skeleton className="h-8 w-64 max-w-full rounded-md" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-card p-1.5 shadow-xs sm:w-auto">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* KPI Stats Grid */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="gap-3 py-4">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="size-8 rounded-full" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-7 w-32" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-2 w-10 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Charts & Analytics section */}
      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-6 w-16 rounded-md" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex h-48 items-end gap-3 px-1">
              {[38, 62, 48, 76, 58, 88, 68, 94].map((height, index) => (
                <Skeleton
                  key={index}
                  className="flex-1 rounded-t-md"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-32" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-6">
            {[100, 85, 68, 52].map((width, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-20 shrink-0" />
                <Skeleton className="h-3 flex-1" style={{ maxWidth: `${width}%` }} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Data Table skeleton */}
      <Card className="p-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-44 rounded-lg" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="grid grid-cols-[1.5fr_1fr_0.7fr] items-center gap-4 rounded-md px-2 py-3 sm:grid-cols-[1.6fr_1fr_1fr_0.7fr]"
            >
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="hidden h-3.5 w-2/3 sm:block" />
              <Skeleton className="h-5 w-16 justify-self-end rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

/** Professional lightweight skeleton for focused dashboard pages, cards, or panels. */
export function SectionLoadingState({
  title = "Loading...",
  rows = 4,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <Card className="w-full border border-border/80 p-0 shadow-xs" aria-busy="true">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        </div>
        <Skeleton className="h-7 w-20 rounded-md" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4 py-1">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3.5 w-1/6" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function LoginFormSkeleton({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <Card className="w-full shadow-lg border-border bg-card overflow-hidden">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-36" />
          {isAdmin ? (
            <Skeleton className="h-5 w-20 rounded-full bg-amber-500/20" />
          ) : (
            <Skeleton className="h-5 w-16 rounded-full" />
          )}
        </div>
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-4 p-6 pt-2 border-t border-border bg-muted/20">
        <Skeleton className="h-11 w-full rounded-lg" />
      </CardFooter>
    </Card>
  );
}

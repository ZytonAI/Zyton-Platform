import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-full">
      <div className="w-full md:w-80 border-r p-3 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="hidden md:flex flex-1 items-center justify-center">
        <Skeleton className="h-10 w-64 rounded-xl" />
      </div>
    </div>
  );
}

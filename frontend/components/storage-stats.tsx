"use client";

import { cn } from "@/lib/utils";
import { Box, Layers } from "lucide-react";

interface StorageStatsProps {
  totalSlots: number;
  usedSlots: number;
  freeSlots: number;
  totalItems: number;
  uniqueItemTypes: number;
  chestCount: number;
  blockCount: number;
  itemCount: number;
  usagePercent: number;
  className?: string;
}

export function StorageStats({
  totalSlots,
  usedSlots,
  freeSlots,
  totalItems,
  blockCount,
  itemCount,
  chestCount,
  usagePercent,
  className,
}: StorageStatsProps) {
  // Calculate percentages for the bar
  const blockPercent = totalItems > 0 ? (blockCount / totalItems) * usagePercent : 0;
  const itemPercent = totalItems > 0 ? (itemCount / totalItems) * usagePercent : 0;
  const freePercent = 100 - usagePercent;

  const segments = [
    { label: "Blocks", value: blockCount, percent: blockPercent, color: "bg-amber-500" },
    { label: "Items", value: itemCount, percent: itemPercent, color: "bg-emerald-500" },
  ];

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div className={cn("rounded-md border bg-card p-3 space-y-2", className)}>
      {/* Header with usage info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          <span>
            <span className="font-medium text-foreground">{usedSlots}</span>
            <span className="text-muted-foreground">/{totalSlots} slots</span>
          </span>
          <span className="text-muted-foreground">•</span>
          <span>{chestCount} chests</span>
        </div>
        <span className="font-medium tabular-nums">{usagePercent}% used</span>
      </div>

      {/* Progress bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={cn("h-full transition-all", segment.color)}
            style={{ width: `${segment.percent}%` }}
            role="progressbar"
            aria-label={segment.label}
            aria-valuenow={segment.value}
            aria-valuemin={0}
            aria-valuemax={totalItems}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5">
            <span
              className={cn("size-2.5 shrink-0 rounded-sm", segment.color)}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="font-medium tabular-nums">{formatCount(segment.value)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm bg-muted" aria-hidden="true" />
          <span className="text-muted-foreground">Free</span>
          <span className="font-medium tabular-nums">{freeSlots} slots</span>
        </div>
      </div>
    </div>
  );
}

// Skeleton version for loading state
export function StorageStatsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-md border bg-card p-3 space-y-2 animate-pulse", className)}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
      </div>
      <div className="h-2 w-full bg-muted rounded-full" />
      <div className="flex items-center gap-4">
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}

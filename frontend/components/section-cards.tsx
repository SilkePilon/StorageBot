"use client";

import { Bot, Box, Package, Activity } from "lucide-react";
import { useBots } from "@/hooks/use-bots";
import { useBotStore } from "@/stores/bot-store";
import { Badge } from "@/components/ui/badge";

export function SectionCards() {
  const { data: bots, isLoading } = useBots();
  const botStatuses = useBotStore((state) => state.botStatuses);

  // Calculate stats
  const totalBots = bots?.length || 0;
  const onlineBots = bots?.filter((bot: any) => {
    const status = botStatuses[bot.id] || bot.runtimeStatus;
    return status?.connected;
  }).length || 0;
  const totalStorageSystems = bots?.reduce((acc: number, bot: any) => {
    return acc + (bot._count?.storageSystems || 0);
  }, 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-24 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Bot className="h-3.5 w-3.5" />
        <span className="font-semibold">{totalBots}</span>
        <span className="text-muted-foreground">bots</span>
      </Badge>
      <Badge variant={onlineBots > 0 ? "default" : "secondary"} className="gap-1.5 py-1.5 px-3">
        <Activity className="h-3.5 w-3.5" />
        <span className="font-semibold">{onlineBots}</span>
        <span className="opacity-80">online</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Box className="h-3.5 w-3.5" />
        <span className="font-semibold">{totalStorageSystems}</span>
        <span className="text-muted-foreground">storage</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Package className="h-3.5 w-3.5" />
        <span className="font-semibold">--</span>
        <span className="text-muted-foreground">items</span>
      </Badge>
    </div>
  );
}

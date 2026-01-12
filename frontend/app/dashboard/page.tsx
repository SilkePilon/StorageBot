"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useDebounce } from "use-debounce";
import { useBots, useConnectBot, useDisconnectBot, useDeleteBot, useSetBotVisibility, usePublicBots, useForceReauth } from "@/hooks/use-bots";
import { useStorageSystems, useStorageItems, useStartIndexing, useStopIndexing, useStorageStats, useUpdateStorageSystem } from "@/hooks/use-storage";
import { useBotStore } from "@/stores/bot-store";
import { useSocket } from "@/hooks/use-socket";
import { useQueryClient } from "@tanstack/react-query";
import { SectionCards } from "@/components/section-cards";
import { NewBotDialog } from "@/components/new-bot-dialog";
import { SetupBotDialog } from "@/components/setup-bot-dialog";
import { ItemIcon } from "@/components/item-icon";
import { StorageStats, StorageStatsSkeleton } from "@/components/storage-stats";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskList } from "@/components/task-list";
import { ShulkerToggleButton } from "@/components/shulker-toggle-button";
import { StatusEffectBadge } from "@/components/status-effect-icon";
import { toast } from "sonner";
import {
  Bot,
  Plus,
  Power,
  PowerOff,
  Settings,
  ChevronDown,
  ChevronRight,
  Heart,
  Apple,
  MapPin,
  Server,
  Search,
  RefreshCw,
  Loader2,
  Box,
  Clock,
  MoreVertical,
  Trash2,
  Edit,
  Globe,
  Lock,
  Users,
  Package,
  X,
  Minus,
  Check,
  ClipboardList,
  Square,
  KeyRound,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

// Helper to get shulker box color from item name
function getShulkerColor(itemId: string): { bg: string; border: string } {
  const colorMap: Record<string, { bg: string; border: string }> = {
    white_shulker_box: { bg: "bg-gray-100 dark:bg-gray-200", border: "border-gray-300" },
    orange_shulker_box: { bg: "bg-orange-200 dark:bg-orange-300", border: "border-orange-400" },
    magenta_shulker_box: { bg: "bg-fuchsia-200 dark:bg-fuchsia-300", border: "border-fuchsia-400" },
    light_blue_shulker_box: { bg: "bg-sky-200 dark:bg-sky-300", border: "border-sky-400" },
    yellow_shulker_box: { bg: "bg-yellow-200 dark:bg-yellow-300", border: "border-yellow-400" },
    lime_shulker_box: { bg: "bg-lime-200 dark:bg-lime-300", border: "border-lime-400" },
    pink_shulker_box: { bg: "bg-pink-200 dark:bg-pink-300", border: "border-pink-400" },
    gray_shulker_box: { bg: "bg-gray-400 dark:bg-gray-500", border: "border-gray-500" },
    light_gray_shulker_box: { bg: "bg-gray-300 dark:bg-gray-400", border: "border-gray-400" },
    cyan_shulker_box: { bg: "bg-cyan-200 dark:bg-cyan-300", border: "border-cyan-400" },
    purple_shulker_box: { bg: "bg-purple-300 dark:bg-purple-400", border: "border-purple-500" },
    blue_shulker_box: { bg: "bg-blue-300 dark:bg-blue-400", border: "border-blue-500" },
    brown_shulker_box: { bg: "bg-amber-300 dark:bg-amber-400", border: "border-amber-500" },
    green_shulker_box: { bg: "bg-green-300 dark:bg-green-400", border: "border-green-500" },
    red_shulker_box: { bg: "bg-red-300 dark:bg-red-400", border: "border-red-500" },
    black_shulker_box: { bg: "bg-gray-700 dark:bg-gray-800", border: "border-gray-800" },
    shulker_box: { bg: "bg-purple-200 dark:bg-purple-300", border: "border-purple-400" }, // Default purple
  };
  return colorMap[itemId] || colorMap.shulker_box;
}

function BotCard({ bot, isOwner = true }: { bot: any; isOwner?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<number | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [expandedShulkerIds, setExpandedShulkerIds] = useState<Set<string>>(new Set());
  const [allShulkersExpanded, setAllShulkersExpanded] = useState(false);
  // Selection key format: "itemId" for regular items, "shulker:shulkerContentId" for shulker contents
  const [selectedItems, setSelectedItems] = useState<Map<string, { 
    itemId: string; 
    itemName: string; 
    count: number; 
    maxCount: number;
    // For items inside shulkers
    fromShulker?: boolean;
    shulkerContentId?: string;
    shulkerChestItemId?: string;
    shulkerSlotInChest?: number;
    slotInShulker?: number;
    chestX?: number;
    chestY?: number;
    chestZ?: number;
  }>>(new Map());
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  
  const { socket, subscribeTo } = useSocket();
  const botStatuses = useBotStore((state) => state.botStatuses);
  const expandedBotId = useBotStore((state) => state.expandedBotId);
  const setExpandedBot = useBotStore((state) => state.setExpandedBot);
  const connectBot = useConnectBot();
  const disconnectBot = useDisconnectBot();
  const deleteBot = useDeleteBot();
  const setVisibility = useSetBotVisibility();
  const forceReauth = useForceReauth();
  const queryClient = useQueryClient();
  
  const isOpen = expandedBotId === bot.id;
  const setIsOpen = (open: boolean) => {
    setExpandedBot(open ? bot.id : null);
  };
  
  const { data: storageSystems, refetch: refetchStorageSystems } = useStorageSystems(bot.id);
  const { data: itemsData, isLoading: itemsLoading, isFetching: itemsFetching, refetch: refetchItems } = useStorageItems(
    selectedStorageId || "",
    debouncedSearch,
    bot.id
  );
  const { data: storageStats, isLoading: statsLoading } = useStorageStats(selectedStorageId || "", bot.id);
  const startIndex = useStartIndexing();
  const stopIndex = useStopIndexing();
  const updateStorage = useUpdateStorageSystem();

  const currentStorage = storageSystems?.find((s: any) => s.id === selectedStorageId);

  const status = botStatuses[bot.id] || bot.runtimeStatus;
  const isOnline = status?.connected;
  const needsSetup = !bot.isAuthenticated && !bot.useOfflineAccount;
  const isIndexing = indexingProgress !== null && indexingProgress < 100;

  useEffect(() => {
    // Always subscribe to the bot for real-time updates
    subscribeTo(bot.id);
  }, [bot.id, subscribeTo]);

  // Listen for indexing progress and completion
  useEffect(() => {
    if (!socket) return;

    const handleIndexProgress = (data: any) => {
      // Accept events for any storage from this bot
      if (data.botId === bot.id) {
        setIndexingProgress(data.progress);
        setIndexingStatus(data.status || `${data.progress}%`);
        // Update selectedStorageId if not set
        if (!selectedStorageId && data.storageId) {
          setSelectedStorageId(data.storageId);
        }
      }
    };

    const handleIndexComplete = (data: any) => {
      if (data.botId === bot.id) {
        setIndexingProgress(100);
        setIndexingStatus("Complete!");
        setTimeout(() => {
          setIndexingProgress(null);
          setIndexingStatus("");
        }, 2000);
        refetchItems();
        refetchStorageSystems();
      }
    };

    const handleChestIndexed = (data: any) => {
      // Refresh items during indexing for live updates
      if (data.botId === bot.id) {
        refetchItems();
      }
    };

    socket.on("storage:indexProgress", handleIndexProgress);
    socket.on("storage:indexComplete", handleIndexComplete);
    socket.on("storage:chestIndexed", handleChestIndexed);

    return () => {
      socket.off("storage:indexProgress", handleIndexProgress);
      socket.off("storage:indexComplete", handleIndexComplete);
      socket.off("storage:chestIndexed", handleChestIndexed);
    };
  }, [socket, bot.id, selectedStorageId, refetchItems, refetchStorageSystems]);

  useEffect(() => {
    if (storageSystems && storageSystems.length > 0 && !selectedStorageId) {
      setSelectedStorageId(storageSystems[0].id);
    }
  }, [storageSystems, selectedStorageId]);

  const handleConnect = () => {
    if (!bot.serverHost) {
      toast.error("Please configure server settings first");
      return;
    }
    connectBot.mutate(
      {
        id: bot.id,
        data: {
          serverHost: bot.serverHost,
          serverPort: bot.serverPort,
          serverVersion: bot.serverVersion,
        },
      },
      {
        onSuccess: () => toast.success("Connecting..."),
        onError: (error) => toast.error(error.message),
      }
    );
  };

  const handleDisconnect = () => {
    disconnectBot.mutate(bot.id, {
      onSuccess: () => toast.success("Disconnected"),
      onError: (error) => toast.error(error.message),
    });
  };

  const handleStartIndex = () => {
    if (!selectedStorageId) return;
    setIndexingProgress(0);
    setIndexingStatus("Starting...");
    startIndex.mutate(selectedStorageId, {
      onSuccess: () => toast.success("Indexing started..."),
      onError: (error) => {
        toast.error(error.message);
        setIndexingProgress(null);
        setIndexingStatus("");
      },
    });
  };

  const handleDelete = () => {
    deleteBot.mutate(bot.id, {
      onSuccess: () => {
        toast.success("Bot deleted");
        setDeleteDialogOpen(false);
        if (expandedBotId === bot.id) {
          setExpandedBot(null);
        }
      },
      onError: (error) => toast.error(error.message),
    });
  };

  // Item selection helpers
  const toggleItemSelection = (itemId: string, itemName: string, totalCount: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.set(itemId, { itemId, itemName, count: Math.min(64, totalCount), maxCount: totalCount });
      }
      return next;
    });
  };

  // Toggle selection for items inside shulker boxes (aggregated - multiple sources)
  const toggleAggregatedShulkerContent = (aggregatedItem: { itemId: string; itemName: string; count: number; sources: any[] }) => {
    // Use shulkerId + itemId as the key for aggregated shulker content
    const key = `shulker-agg:${aggregatedItem.sources[0]?.shulkerChestItemId}:${aggregatedItem.itemId}`;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Add all sources to selection
        const allSources = aggregatedItem.sources.map(s => ({
          fromShulker: true,
          shulkerContentId: s.id,
          shulkerChestItemId: s.shulkerChestItemId,
          shulkerSlotInChest: s.shulkerSlotInChest,
          slotInShulker: s.slot,
          chestX: s.chestX,
          chestY: s.chestY,
          chestZ: s.chestZ,
          count: s.count,
        }));
        
        next.set(key, { 
          itemId: aggregatedItem.itemId, 
          itemName: aggregatedItem.itemName, 
          count: Math.min(64, aggregatedItem.count), 
          maxCount: aggregatedItem.count,
          fromShulker: true,
          // Store the first source for backwards compatibility
          shulkerContentId: aggregatedItem.sources[0]?.id,
          shulkerChestItemId: aggregatedItem.sources[0]?.shulkerChestItemId,
          shulkerSlotInChest: aggregatedItem.sources[0]?.shulkerSlotInChest,
          slotInShulker: aggregatedItem.sources[0]?.slot,
          chestX: aggregatedItem.sources[0]?.chestX,
          chestY: aggregatedItem.sources[0]?.chestY,
          chestZ: aggregatedItem.sources[0]?.chestZ,
        });
      }
      return next;
    });
  };

  const updateItemCount = (key: string, count: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const item = next.get(key);
      if (item) {
        next.set(key, { ...item, count: Math.max(1, Math.min(item.maxCount, count)) });
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItems(new Map());
  };

  // Get all shulker IDs from the items data
  const allShulkerIds = useMemo(() => {
    if (!itemsData?.items) return [];
    return itemsData.items
      .filter((item: any) => item.isShulkerBox && item.hasContents && item.shulkerId)
      .map((item: any) => item.shulkerId);
  }, [itemsData?.items]);

  // Toggle all shulkers open/closed with staggered animation
  const toggleAllShulkers = () => {
    if (allShulkersExpanded) {
      // Collapse all - staggered
      const ids = Array.from(expandedShulkerIds);
      ids.forEach((id, index) => {
        setTimeout(() => {
          setExpandedShulkerIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, index * 50);
      });
      setAllShulkersExpanded(false);
    } else {
      // Expand all - staggered
      allShulkerIds.forEach((id: string, index: number) => {
        setTimeout(() => {
          setExpandedShulkerIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }, index * 50);
      });
      setAllShulkersExpanded(true);
    }
  };

  const selectedItemsArray = Array.from(selectedItems.values()).map((item) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    requestedCount: item.count,
    maxCount: item.maxCount,
    // Include shulker source info if present
    fromShulker: item.fromShulker,
    shulkerContentId: item.shulkerContentId,
    shulkerChestItemId: item.shulkerChestItemId,
    shulkerSlotInChest: item.shulkerSlotInChest,
    slotInShulker: item.slotInShulker,
    chestX: item.chestX,
    chestY: item.chestY,
    chestZ: item.chestZ,
  }));

  const serverVersion = status?.serverVersion || bot.serverVersion || "1.21.4";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg overflow-hidden">
        {/* Bot Header - Always visible */}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors rounded-t-lg">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-3 min-w-0 flex-1 text-left">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="relative shrink-0">
                <Bot className="h-5 w-5" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
                    isOnline ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{bot.name}</span>
                  <Badge
                    variant={isOnline ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                  >
                    {isOnline ? "Online" : "Offline"}
                  </Badge>
                  {bot.isPublic && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 shrink-0 gap-0.5"
                    >
                      <Globe className="h-2.5 w-2.5" />
                      Public
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Server className="h-3 w-3" />
                  <span className="truncate">
                    {bot.serverHost
                      ? `${bot.serverHost}:${bot.serverPort}`
                      : "Not configured"}
                  </span>
                </div>
              </div>
              
              {/* Stats badges - shown when online, 2x stacked vertically, left aligned after bot info */}
              {isOnline && status && (
                <div className="hidden sm:flex items-center gap-1.5">
                  {/* 2x stacked stats */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="gap-1 py-0 h-4 text-[9px] px-1">
                        <Heart className="h-2.5 w-2.5" />
                        <span className="font-mono">{status.health?.toFixed(0) || 0}/20</span>
                      </Badge>
                      <Badge variant="outline" className="gap-1 py-0 h-4 text-[9px] px-1">
                        <Apple className="h-2.5 w-2.5" />
                        <span className="font-mono">{status.food?.toFixed(0) || 0}/20</span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="gap-1 py-0 h-4 text-[9px] px-1">
                        <MapPin className="h-2.5 w-2.5" />
                        <span className="font-mono">
                          {status.position
                            ? `${status.position.x}, ${status.position.y}, ${status.position.z}`
                            : "?"}
                        </span>
                      </Badge>
                      <Badge variant="outline" className="gap-1 py-0 h-4 text-[9px] px-1 max-w-[60px]">
                        <span className="truncate">{status.currentAction || "Idle"}</span>
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Status effect icons - simple icon-only badges */}
                  {status.effects && status.effects.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      {status.effects.slice(0, 6).map((effect: any, idx: number) => (
                        <StatusEffectBadge
                          key={`${effect.id}-${idx}`}
                          effectId={effect.id}
                          effectName={effect.name}
                          amplifier={effect.amplifier}
                          duration={effect.duration}
                        />
                      ))}
                      {status.effects.length > 6 && (
                        <span className="text-[10px] text-muted-foreground ml-0.5">
                          +{status.effects.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </button>
          </CollapsibleTrigger>
          
          {/* Quick actions - only show for owner */}
          {isOwner && (
            <div className="flex items-center gap-1.5 shrink-0">
              {needsSetup || !bot.serverHost ? (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs"
                  onClick={() => setSetupDialogOpen(true)}
                >
                  <Settings className="mr-1 h-3 w-3" />
                  Setup
                </Button>
              ) : isOnline ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleDisconnect}
                  disabled={disconnectBot.isPending}
                >
                  {disconnectBot.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <PowerOff className="h-3 w-3" />
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleConnect}
                  disabled={connectBot.isPending}
                >
                  {connectBot.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Power className="h-3 w-3" />
                  )}
                </Button>
              )}
              
              {/* More options dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setSetupDialogOpen(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setVisibility.mutate(
                        { id: bot.id, isPublic: !bot.isPublic },
                        {
                          onSuccess: () => {
                            toast.success(bot.isPublic ? "Bot is now private" : "Bot is now public");
                          },
                          onError: (error) => toast.error(error.message),
                        }
                      );
                    }}
                    disabled={setVisibility.isPending}
                  >
                    {bot.isPublic ? (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Make Private
                      </>
                    ) : (
                      <>
                        <Globe className="mr-2 h-4 w-4" />
                        Make Public
                      </>
                    )}
                  </DropdownMenuItem>
                  {/* Re-authenticate - only show for Microsoft auth bots */}
                  {!bot.useOfflineAccount && bot.microsoftEmail && (
                    <DropdownMenuItem
                      onSelect={() => {
                        forceReauth.mutate(bot.id, {
                          onSuccess: () => {
                            toast.success("Re-authentication started. Check for MSA code popup.");
                          },
                          onError: (error) => toast.error(error.message),
                        });
                      }}
                      disabled={forceReauth.isPending}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      {forceReauth.isPending ? "Re-authenticating..." : "Re-authenticate"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Bot
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Owner badge for public bots */}
          {!isOwner && bot.user && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                <Users className="mr-1 h-2.5 w-2.5" />
                {bot.user.username || "Unknown"}
              </Badge>
            </div>
          )}
        </div>

        {/* Setup Dialog - only for owner */}
        {isOwner && (
          <SetupBotDialog 
            botId={bot.id} 
            botName={bot.name}
            open={setupDialogOpen}
            onOpenChange={setSetupDialogOpen}
          />
        )}

        {/* Delete Confirmation Dialog - only for owner */}
        {isOwner && (
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Bot</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{bot.name}&quot;? This action cannot be undone.
                  All storage systems and indexed items associated with this bot will also be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteBot.isPending}
                >
                  {deleteBot.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Expanded Content */}
        <CollapsibleContent>
          <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
            {/* Mobile stats badges - only shown inside collapsible on small screens */}
            {isOnline && status && (
              <div className="flex items-center gap-2 flex-wrap sm:hidden">
                <Badge variant="outline" className="gap-1.5 py-1">
                  <Heart className="h-3 w-3" />
                  <span className="font-mono text-xs">{status.health?.toFixed(0) || 0}/20</span>
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1">
                  <Apple className="h-3 w-3" />
                  <span className="font-mono text-xs">{status.food?.toFixed(0) || 0}/20</span>
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1">
                  <MapPin className="h-3 w-3" />
                  <span className="font-mono text-xs">
                    {status.position
                      ? `${status.position.x}, ${status.position.y}, ${status.position.z}`
                      : "Unknown"}
                  </span>
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1">
                  <Server className="h-3 w-3" />
                  <span className="text-xs">{status.currentAction || "Idle"}</span>
                </Badge>
                {status.effects && status.effects.length > 0 && (
                  <div className="flex items-center gap-0.5">
                    {status.effects.slice(0, 4).map((effect: any, idx: number) => (
                      <StatusEffectBadge
                        key={`${effect.id}-${idx}`}
                        effectId={effect.id}
                        effectName={effect.name}
                        amplifier={effect.amplifier}
                        duration={effect.duration}
                      />
                    ))}
                    {status.effects.length > 4 && (
                      <span className="text-[10px] text-muted-foreground ml-0.5">
                        +{status.effects.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Storage & Items */}
            {storageSystems?.length === 0 ? (
              <div className="text-center py-4">
                <Box className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground mb-2">No storage systems</p>
                {isOwner && (
                  <SetupBotDialog botId={bot.id} botName={bot.name}>
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      <Plus className="mr-1 h-3 w-3" />
                      Add Storage
                    </Button>
                  </SetupBotDialog>
                )}
              </div>
            ) : (
              <>
                {/* Search & Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[150px] max-w-xs">
                    {itemsFetching && searchQuery ? (
                      <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                    ) : (
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <Input
                      placeholder="Search items & shulkers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-8 h-8 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => refetchItems()}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Refresh
                  </Button>
                  {isOwner && isOnline && selectedStorageId && (
                    <>
                      {isIndexing ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            stopIndex.mutate(selectedStorageId, {
                              onSuccess: () => {
                                toast.success("Indexing stopped");
                                setIndexingProgress(null);
                                setIndexingStatus("");
                              },
                              onError: (error) => {
                                toast.error("Failed to stop indexing");
                              },
                            });
                          }}
                          disabled={stopIndex.isPending}
                        >
                          {stopIndex.isPending ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Stopping...
                            </>
                          ) : (
                            <>
                              <Square className="mr-1 h-3 w-3 fill-current" />
                              Stop
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={handleStartIndex}
                          disabled={startIndex.isPending}
                        >
                          {startIndex.isPending ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Starting...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-1 h-3 w-3" />
                              Re-index
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  )}
                  {allShulkerIds.length > 0 && (
                    <ShulkerToggleButton
                      isOpen={allShulkersExpanded}
                      onToggle={toggleAllShulkers}
                      disabled={allShulkerIds.length === 0}
                    />
                  )}
                  {isOwner && selectedStorageId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={currentStorage?.returnToHome ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const newValue = !(currentStorage?.returnToHome ?? true);
                            updateStorage.mutate(
                              { id: selectedStorageId, data: { returnToHome: newValue } },
                              {
                                onSuccess: () => {
                                  toast.success(newValue ? "Bot will return home after tasks" : "Return home disabled");
                                  refetchStorageSystems();
                                },
                              }
                            );
                          }}
                          disabled={updateStorage.isPending}
                        >
                          <Home className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {currentStorage?.returnToHome ? "Return home enabled" : "Return home disabled"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                    <span>{itemsData?.pagination?.total || 0} items</span>
                    {itemsData?.lastIndexed && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(itemsData.lastIndexed).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Storage Stats */}
                {statsLoading ? (
                  <StorageStatsSkeleton />
                ) : storageStats && (
                  <StorageStats {...storageStats} />
                )}

                {/* Items Grid */}
                <div className="border rounded-md bg-background">
                  {itemsLoading ? (
                    <div className="flex flex-wrap gap-2 p-3">
                      {[...Array(24)].map((_, i) => (
                        <Skeleton key={i} className="w-12 h-12" />
                      ))}
                    </div>
                  ) : itemsData?.items?.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      {searchQuery ? "No items match your search" : "No items indexed yet"}
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="flex flex-wrap gap-2 p-3">
                        {itemsData?.items?.map((item: any, index: number) => {
                          const isFilledShulker = item.isShulkerBox && item.hasContents;
                          const isExpanded = expandedShulkerIds.has(item.shulkerId);
                          // Use a more unique key that combines shulkerId, itemId, and index
                          const uniqueKey = item.shulkerId || `${item.itemId}-${index}`;
                          const shulkerColors = isFilledShulker ? getShulkerColor(item.itemId) : null;
                          
                          if (isFilledShulker) {
                            // Aggregate shulker contents by itemId for display
                            const aggregatedContents: Array<{
                              itemId: string;
                              itemName: string;
                              count: number;
                              sources: any[]; // Original slot items for selection
                            }> = [];
                            
                            for (const slotItem of item.shulkerContents || []) {
                              const existing = aggregatedContents.find(a => a.itemId === slotItem.itemId);
                              if (existing) {
                                existing.count += slotItem.count;
                                existing.sources.push(slotItem);
                              } else {
                                aggregatedContents.push({
                                  itemId: slotItem.itemId,
                                  itemName: slotItem.itemName,
                                  count: slotItem.count,
                                  sources: [slotItem],
                                });
                              }
                            }
                            
                            // Filled shulker box with sliding contents
                            return (
                              <div key={uniqueKey} className="relative flex items-center">
                                {/* Shulker box button - higher z-index to be on top */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => setExpandedShulkerIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(item.shulkerId)) {
                                          next.delete(item.shulkerId);
                                        } else {
                                          next.add(item.shulkerId);
                                        }
                                        return next;
                                      })}
                                      className={`w-12 h-12 rounded-md bg-muted/30 hover:bg-muted/60 hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer flex items-center justify-center relative z-10 ${
                                        isExpanded ? "ring-2 ring-primary bg-muted/60" : ""
                                      }`}
                                    >
                                      <ItemIcon
                                        itemId={item.itemId}
                                        itemName={item.itemName}
                                        size={40}
                                        version={status?.serverVersion || bot.serverVersion || "1.21.4"}
                                      />
                                      {/* Filled indicator badge - squared with rounded corners */}
                                      <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary rounded flex items-center justify-center">
                                        <Package className="h-2.5 w-2.5 text-primary-foreground" />
                                      </span>
                                      <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-foreground drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                                        {aggregatedContents.length}
                                      </span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <div className="font-medium">{item.itemName}</div>
                                    <div className="text-muted-foreground">
                                      Contains: <span className="font-mono">{aggregatedContents.length}</span> item types
                                    </div>
                                    <div className="text-muted-foreground text-[10px]">
                                      Click to {isExpanded ? "collapse" : "expand"}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                
                                {/* Sliding shulker contents - slides from behind the shulker */}
                                <div 
                                  className="overflow-hidden"
                                  style={{
                                    width: isExpanded ? `${aggregatedContents.length * 36 + 4}px` : '0px',
                                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                  }}
                                >
                                  <div
                                    className="flex items-center gap-1 pl-1 h-12"
                                    style={{
                                      transform: isExpanded ? 'translateX(0)' : 'translateX(-100%)',
                                      opacity: isExpanded ? 1 : 0,
                                      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease-in-out',
                                    }}
                                  >
                                    {aggregatedContents.map((aggItem, idx) => {
                                      const contentKey = `shulker-agg:${aggItem.sources[0]?.shulkerChestItemId}:${aggItem.itemId}`;
                                      const isContentSelected = selectedItems.has(contentKey);
                                      
                                      return (
                                        <Tooltip key={idx}>
                                          <TooltipTrigger asChild>
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleAggregatedShulkerContent(aggItem);
                                              }}
                                              className={`w-8 h-8 rounded border-2 flex items-center justify-center relative shrink-0 transition-all ${
                                                isContentSelected 
                                                  ? "bg-green-500/20 border-green-500" 
                                                  : `bg-muted/30 hover:bg-muted/50 ${shulkerColors?.border}`
                                              }`}
                                            >
                                              <ItemIcon
                                                itemId={aggItem.itemId}
                                                itemName={aggItem.itemName}
                                                size={24}
                                                version={status?.serverVersion || bot.serverVersion || "1.21.4"}
                                              />
                                              {isContentSelected && (
                                                <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded flex items-center justify-center">
                                                  <Check className="h-2 w-2 text-white" />
                                                </span>
                                              )}
                                              <span className="absolute bottom-0 right-0 text-[8px] font-bold text-foreground drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                                                {aggItem.count > 99 ? "99+" : aggItem.count > 1 ? aggItem.count : ""}
                                              </span>
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">
                                            <div className="font-medium">{aggItem.itemName}</div>
                                            <div className="text-muted-foreground">
                                              Count: <span className="font-mono">{aggItem.count}</span>
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Regular item or empty shulker box (aggregated)
                          const isSelected = selectedItems.has(item.itemId);
                          
                          return (
                            <Tooltip key={uniqueKey}>
                              <TooltipTrigger asChild>
                                <div 
                                  className={`w-12 h-12 rounded-md hover:bg-muted/60 hover:ring-2 hover:ring-primary/50 hover:z-10 transition-all cursor-pointer flex items-center justify-center relative ${
                                    isSelected 
                                      ? "ring-2 ring-green-500 bg-green-500/10" 
                                      : "bg-muted/30"
                                  }`}
                                  onClick={() => toggleItemSelection(item.itemId, item.itemName, item.totalCount)}
                                >
                                  <ItemIcon
                                    itemId={item.itemId}
                                    itemName={item.itemName}
                                    size={40}
                                    version={serverVersion}
                                  />
                                  {isSelected && (
                                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded flex items-center justify-center">
                                      <Check className="h-2.5 w-2.5 text-white" />
                                    </span>
                                  )}
                                  <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-foreground drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                                    {item.totalCount > 999 ? `${Math.floor(item.totalCount / 1000)}k` : item.totalCount}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="font-medium">{item.itemName}</div>
                                <div className="text-muted-foreground">
                                  Total: {item.totalCount} • {item.locations?.length || 1} location{(item.locations?.length || 1) > 1 ? 's' : ''}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                {/* Selection Bar - appears when items are selected */}
                {selectedItems.size > 0 && (
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedItems.size} item{selectedItems.size > 1 ? "s" : ""} · {Array.from(selectedItems.values()).reduce((sum, i) => sum + i.count, 0)} total
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={clearSelection}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setCreateTaskDialogOpen(true)}
                      disabled={!isOnline}
                    >
                      <Package className="mr-1 h-3 w-3" />
                      {isIndexing ? "Request (Queued)" : "Request"}
                    </Button>
                  </div>
                )}

                {/* Tasks Section */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowTasks(!showTasks)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showTasks ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Active Requests
                  </button>
                  {showTasks && (
                    <TaskList botId={bot.id} serverVersion={serverVersion} />
                  )}
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>

      {/* Create Task Dialog */}
      {selectedStorageId && (
        <CreateTaskDialog
          open={createTaskDialogOpen}
          onOpenChange={setCreateTaskDialogOpen}
          botId={bot.id}
          storageSystemId={selectedStorageId}
          selectedItems={selectedItemsArray}
          onClearSelection={clearSelection}
          serverVersion={serverVersion}
          isIndexing={isIndexing}
        />
      )}
    </Collapsible>
  );
}

export default function DashboardPage() {
  const { data: bots, isLoading } = useBots();
  const { data: publicBots } = usePublicBots();
  const { socket, subscribeTo, unsubscribeFrom } = useSocket();
  const queryClient = useQueryClient();

  // Subscribe to all bots for live updates
  useEffect(() => {
    if (bots && bots.length > 0) {
      bots.forEach((bot: any) => subscribeTo(bot.id));
    }
    
    // Cleanup: unsubscribe when component unmounts or bots change
    return () => {
      if (bots && bots.length > 0) {
        bots.forEach((bot: any) => unsubscribeFrom(bot.id));
      }
    };
  }, [bots, subscribeTo, unsubscribeFrom]);

  // Listen for socket events that should trigger data refresh
  useEffect(() => {
    if (!socket) return;

    const handleBotConnected = () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    };

    const handleBotConnectionFailed = () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    };

    const handleBotDisconnected = () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    };

    const handleIndexComplete = () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["storage-items"] });
      queryClient.invalidateQueries({ queryKey: ["storage-systems"] });
    };

    const handleAuthComplete = () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    };

    const handleAuthExpired = (data: { botId: string; error: string; requiresReauth: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      toast.error(`Authentication expired for bot. Please re-authenticate.`, {
        description: data.error?.substring(0, 100),
        action: {
          label: "View",
          onClick: () => {},
        },
      });
    };

    const handleTokenRefreshed = (data: { botId: string; success: boolean }) => {
      if (data.success) {
        console.log(`Token refreshed for bot ${data.botId}`);
      }
    };

    socket.on("bot:connected", handleBotConnected);
    socket.on("bot:connectionFailed", handleBotConnectionFailed);
    socket.on("bot:status", handleBotConnected); // Status updates may indicate connect/disconnect
    socket.on("storage:indexComplete", handleIndexComplete);
    socket.on("bot:authComplete", handleAuthComplete);
    socket.on("bot:authExpired", handleAuthExpired);
    socket.on("bot:tokenRefreshed", handleTokenRefreshed);

    return () => {
      socket.off("bot:connected", handleBotConnected);
      socket.off("bot:connectionFailed", handleBotConnectionFailed);
      socket.off("bot:status", handleBotConnected);
      socket.off("storage:indexComplete", handleIndexComplete);
      socket.off("bot:authComplete", handleAuthComplete);
      socket.off("bot:authExpired", handleAuthExpired);
      socket.off("bot:tokenRefreshed", handleTokenRefreshed);
    };
  }, [socket, queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SectionCards />
        <NewBotDialog>
          <Button size="sm" className="h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Bot
          </Button>
        </NewBotDialog>
      </div>

      {/* Bot List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : bots?.length === 0 && publicBots?.length === 0 ? (
          <div className="border rounded-lg text-center py-10">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">No bots yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first storage bot to get started
            </p>
            <NewBotDialog>
              <Button size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create Bot
              </Button>
            </NewBotDialog>
          </div>
        ) : (
          <>
            {/* My Bots */}
            {bots?.map((bot: any) => <BotCard key={bot.id} bot={bot} isOwner={true} />)}
            
            {/* Public Bots (from other users) */}
            {publicBots && publicBots.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3 w-3" />
                    Public Bots
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {publicBots.map((bot: any) => <BotCard key={bot.id} bot={bot} isOwner={false} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

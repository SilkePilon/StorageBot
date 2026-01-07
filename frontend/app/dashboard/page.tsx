"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useBots, useConnectBot, useDisconnectBot, useDeleteBot, useSetBotVisibility, usePublicBots } from "@/hooks/use-bots";
import { useStorageSystems, useStorageItems, useStartIndexing, useStorageStats } from "@/hooks/use-storage";
import { useBotStore } from "@/stores/bot-store";
import { useSocket } from "@/hooks/use-socket";
import { useQueryClient } from "@tanstack/react-query";
import { SectionCards } from "@/components/section-cards";
import { NewBotDialog } from "@/components/new-bot-dialog";
import { SetupBotDialog } from "@/components/setup-bot-dialog";
import { ItemIcon } from "@/components/item-icon";
import { StorageStats, StorageStatsSkeleton } from "@/components/storage-stats";
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

function BotCard({ bot, isOwner = true }: { bot: any; isOwner?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<number | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  
  const { socket, subscribeTo } = useSocket();
  const botStatuses = useBotStore((state) => state.botStatuses);
  const expandedBotId = useBotStore((state) => state.expandedBotId);
  const setExpandedBot = useBotStore((state) => state.setExpandedBot);
  const connectBot = useConnectBot();
  const disconnectBot = useDisconnectBot();
  const deleteBot = useDeleteBot();
  const setVisibility = useSetBotVisibility();
  const queryClient = useQueryClient();
  
  const isOpen = expandedBotId === bot.id;
  const setIsOpen = (open: boolean) => {
    setExpandedBot(open ? bot.id : null);
  };
  
  const { data: storageSystems, refetch: refetchStorageSystems } = useStorageSystems(bot.id);
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useStorageItems(
    selectedStorageId || "",
    searchQuery
  );
  const { data: storageStats, isLoading: statsLoading } = useStorageStats(selectedStorageId || "", bot.id);
  const startIndex = useStartIndexing();

  const status = botStatuses[bot.id] || bot.runtimeStatus;
  const isOnline = status?.connected;
  const needsSetup = !bot.isAuthenticated && !bot.useOfflineAccount;
  const isIndexing = indexingProgress !== null && indexingProgress < 100;

  useEffect(() => {
    if (isOpen && bot.id) {
      subscribeTo(bot.id);
    }
  }, [isOpen, bot.id, subscribeTo]);

  // Listen for indexing progress and completion
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleIndexProgress = (data: any) => {
      if (data.storageId === selectedStorageId) {
        setIndexingProgress(data.progress);
        setIndexingStatus(data.status || `${data.progress}%`);
      }
    };

    const handleIndexComplete = (data: any) => {
      if (data.storageId === selectedStorageId) {
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

    const handleChestIndexed = () => {
      // Optionally refresh during indexing for live updates
      refetchItems();
    };

    socket.on("storage:indexProgress", handleIndexProgress);
    socket.on("storage:indexComplete", handleIndexComplete);
    socket.on("storage:chestIndexed", handleChestIndexed);

    return () => {
      socket.off("storage:indexProgress", handleIndexProgress);
      socket.off("storage:indexComplete", handleIndexComplete);
      socket.off("storage:chestIndexed", handleChestIndexed);
    };
  }, [socket, isOpen, selectedStorageId, refetchItems, refetchStorageSystems]);

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
              <div className="min-w-0">
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
                {bot.user.name || "Unknown"}
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
            {/* Status badges when online */}
            {isOnline && status && (
              <div className="flex items-center gap-2 flex-wrap">
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
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => refetchItems()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {isOwner && isOnline && selectedStorageId && (
                    isIndexing ? (
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={indexingProgress || 0} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {indexingStatus || `${indexingProgress}%`}
                        </span>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleStartIndex}
                        disabled={startIndex.isPending}
                      >
                        {startIndex.isPending ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3 w-3" />
                        )}
                        Re-index
                      </Button>
                    )
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
                        {itemsData?.items?.map((item: any) => (
                          <Tooltip key={item.itemId}>
                            <TooltipTrigger asChild>
                              <div className="w-12 h-12 rounded-md bg-muted/30 hover:bg-muted/60 hover:ring-2 hover:ring-primary/50 hover:z-10 transition-colors cursor-pointer flex items-center justify-center relative">
                                <ItemIcon
                                  itemId={item.itemId}
                                  itemName={item.itemName}
                                  size={40}
                                  version={status?.serverVersion || bot.serverVersion || "1.21.4"}
                                />
                                <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-foreground drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                                  {item.totalCount > 999 ? `${Math.floor(item.totalCount / 1000)}k` : item.totalCount}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <div className="font-medium">{item.itemName}</div>
                              <div className="text-muted-foreground">
                                Count: <span className="font-mono">{item.totalCount}</span>
                              </div>
                              {item.locations?.[0] && (
                                <div className="text-muted-foreground">
                                  Location: <span className="font-mono">{item.locations[0].x}, {item.locations[0].y}, {item.locations[0].z}</span>
                                </div>
                              )}
                              {item.locations?.length > 1 && (
                                <div className="text-muted-foreground text-[10px]">
                                  +{item.locations.length - 1} more locations
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function DashboardPage() {
  const { data: bots, isLoading } = useBots();
  const { data: publicBots } = usePublicBots();
  const { socket, subscribeTo } = useSocket();
  const queryClient = useQueryClient();

  // Subscribe to all bots for live updates
  useEffect(() => {
    if (bots && bots.length > 0) {
      bots.forEach((bot: any) => subscribeTo(bot.id));
    }
  }, [bots, subscribeTo]);

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

    socket.on("bot:connected", handleBotConnected);
    socket.on("bot:connectionFailed", handleBotConnectionFailed);
    socket.on("bot:status", handleBotConnected); // Status updates may indicate connect/disconnect
    socket.on("storage:indexComplete", handleIndexComplete);
    socket.on("bot:authComplete", handleAuthComplete);

    return () => {
      socket.off("bot:connected", handleBotConnected);
      socket.off("bot:connectionFailed", handleBotConnectionFailed);
      socket.off("bot:status", handleBotConnected);
      socket.off("storage:indexComplete", handleIndexComplete);
      socket.off("bot:authComplete", handleAuthComplete);
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

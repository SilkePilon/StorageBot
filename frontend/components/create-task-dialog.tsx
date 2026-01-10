"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCreateTask, useEmptyShulkers } from "@/hooks/use-tasks";
import { ItemIcon } from "@/components/item-icon";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Package,
  User,
  Box,
  Loader2,
  Minus,
  Plus,
  Trash2,
  MapPin,
  Check,
} from "lucide-react";

interface SelectedItem {
  itemId: string;
  itemName: string;
  requestedCount: number;
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
}

// Internal item with unique key for the dialog
interface DialogItem {
  key: string; // Unique key for this item entry
  itemId: string;
  itemName: string;
  requestedCount: number;
  maxCount: number;
  // Source info for shulker items (can have multiple sources if combined)
  sources: Array<{
    fromShulker?: boolean;
    shulkerContentId?: string;
    shulkerChestItemId?: string;
    shulkerSlotInChest?: number;
    slotInShulker?: number;
    chestX?: number;
    chestY?: number;
    chestZ?: number;
    count: number;
  }>;
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId: string;
  storageSystemId: string;
  selectedItems: SelectedItem[];
  onClearSelection: () => void;
  serverVersion?: string;
  isIndexing?: boolean;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  botId,
  storageSystemId,
  selectedItems,
  onClearSelection,
  serverVersion = "1.21.4",
  isIndexing = false,
}: CreateTaskDialogProps) {
  const [items, setItems] = useState<DialogItem[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<string>("DROP_TO_PLAYER");
  const [packingMode, setPackingMode] = useState<string>("OPTIMIZED");
  const [targetPlayer, setTargetPlayer] = useState("");
  const [deliveryX, setDeliveryX] = useState("");
  const [deliveryY, setDeliveryY] = useState("");
  const [deliveryZ, setDeliveryZ] = useState("");
  const [selectedShulkerIds, setSelectedShulkerIds] = useState<string[]>([]);
  const wasOpenRef = useRef(false);

  const createTask = useCreateTask();
  const { data: emptyShulkers, refetch: refetchEmptyShulkers } = useEmptyShulkers(storageSystemId);

  const isShulkerMethod = deliveryMethod === "SHULKER_DROP" || deliveryMethod === "SHULKER_CHEST";
  const needsPlayer = deliveryMethod === "DROP_TO_PLAYER" || deliveryMethod === "SHULKER_DROP";
  const needsLocation = deliveryMethod === "PUT_IN_CHEST" || deliveryMethod === "SHULKER_CHEST";

  // Calculate shulkers needed
  const totalItems = items.reduce((sum, i) => sum + i.requestedCount, 0);
  const shulkersNeeded = Math.ceil(totalItems / (27 * 64));

  // Shulker color order for consistent display
  const shulkerColorOrder = [
    "shulker_box", // undyed
    "white_shulker_box",
    "light_gray_shulker_box",
    "gray_shulker_box",
    "black_shulker_box",
    "brown_shulker_box",
    "red_shulker_box",
    "orange_shulker_box",
    "yellow_shulker_box",
    "lime_shulker_box",
    "green_shulker_box",
    "cyan_shulker_box",
    "light_blue_shulker_box",
    "blue_shulker_box",
    "purple_shulker_box",
    "magenta_shulker_box",
    "pink_shulker_box",
  ];

  // Group shulkers by color and count available
  const shulkersByColor = useMemo(() => {
    if (!emptyShulkers) return [];
    
    const grouped = new Map<string, { itemId: string; itemName: string; shulkers: any[] }>();
    
    for (const shulker of emptyShulkers) {
      const color = shulker.itemId;
      if (!grouped.has(color)) {
        grouped.set(color, {
          itemId: shulker.itemId,
          itemName: shulker.itemName,
          shulkers: [],
        });
      }
      grouped.get(color)!.shulkers.push(shulker);
    }
    
    // Sort by color order
    return Array.from(grouped.values()).sort((a, b) => {
      const aIdx = shulkerColorOrder.indexOf(a.itemId);
      const bIdx = shulkerColorOrder.indexOf(b.itemId);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [emptyShulkers]);

  // Track selected shulkers per color
  const selectedShulkersByColor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selectedShulkerIds) {
      const shulker = emptyShulkers?.find((s: any) => s.id === id);
      if (shulker) {
        counts.set(shulker.itemId, (counts.get(shulker.itemId) || 0) + 1);
      }
    }
    return counts;
  }, [selectedShulkerIds, emptyShulkers]);

  // Only initialize items when dialog opens (not on every selectedItems change)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Dialog just opened - initialize items
      const aggregated = new Map<string, DialogItem>();
      
      for (const item of selectedItems) {
        const existing = aggregated.get(item.itemId);
        const source = {
          fromShulker: item.fromShulker,
          shulkerContentId: item.shulkerContentId,
          shulkerChestItemId: item.shulkerChestItemId,
          shulkerSlotInChest: item.shulkerSlotInChest,
          slotInShulker: item.slotInShulker,
          chestX: item.chestX,
          chestY: item.chestY,
          chestZ: item.chestZ,
          count: item.requestedCount,
        };
        
        if (existing) {
          existing.requestedCount += item.requestedCount;
          existing.maxCount += item.maxCount;
          existing.sources.push(source);
        } else {
          aggregated.set(item.itemId, {
            key: item.itemId,
            itemId: item.itemId,
            itemName: item.itemName,
            requestedCount: item.requestedCount,
            maxCount: item.maxCount,
            sources: [source],
          });
        }
      }
      
      setItems(Array.from(aggregated.values()));
      refetchEmptyShulkers();
    }
    
    // Track open state
    wasOpenRef.current = open;
  }, [open, selectedItems, refetchEmptyShulkers]);

  const updateItemCount = (key: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key === key) {
          const newCount = Math.max(1, Math.min(item.maxCount, item.requestedCount + delta));
          return { ...item, requestedCount: newCount };
        }
        return item;
      })
    );
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      toast.error("No items selected");
      return;
    }

    if (needsPlayer && !targetPlayer.trim()) {
      toast.error("Please enter a player name");
      return;
    }

    if (needsLocation && (!deliveryX || !deliveryY || !deliveryZ)) {
      toast.error("Please enter delivery coordinates");
      return;
    }

    if (isShulkerMethod && selectedShulkerIds.length < shulkersNeeded) {
      toast.error(`Please select at least ${shulkersNeeded} empty shulker(s)`);
      return;
    }

    // Expand aggregated items back to individual sources for the API
    // For items with shulker sources, we need to send each source separately
    const expandedItems: any[] = [];
    for (const item of items) {
      // Check if all sources are from shulkers
      const hasShulkerSources = item.sources.some(s => s.fromShulker);
      
      if (hasShulkerSources) {
        // For shulker items, distribute the requested count across sources
        let remaining = item.requestedCount;
        for (const source of item.sources) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, source.count);
          expandedItems.push({
            itemId: item.itemId,
            itemName: item.itemName,
            requestedCount: take,
            fromShulker: source.fromShulker,
            shulkerContentId: source.shulkerContentId,
            shulkerChestItemId: source.shulkerChestItemId,
            shulkerSlotInChest: source.shulkerSlotInChest,
            slotInShulker: source.slotInShulker,
            chestX: source.chestX,
            chestY: source.chestY,
            chestZ: source.chestZ,
          });
          remaining -= take;
        }
      } else {
        // Regular item - just send it as-is
        expandedItems.push({
          itemId: item.itemId,
          itemName: item.itemName,
          requestedCount: item.requestedCount,
        });
      }
    }

    createTask.mutate(
      {
        botId,
        storageSystemId,
        deliveryMethod: deliveryMethod as any,
        packingMode: packingMode as any,
        targetPlayer: needsPlayer ? targetPlayer : undefined,
        deliveryX: needsLocation ? parseInt(deliveryX) : undefined,
        deliveryY: needsLocation ? parseInt(deliveryY) : undefined,
        deliveryZ: needsLocation ? parseInt(deliveryZ) : undefined,
        selectedShulkerIds: isShulkerMethod ? selectedShulkerIds : undefined,
        items: expandedItems,
      },
      {
        onSuccess: () => {
          toast.success("Request created");
          onClearSelection();
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const toggleShulkerSelection = (id: string) => {
    setSelectedShulkerIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // Select or deselect one shulker of a specific color
  const toggleShulkerColor = (colorGroup: { itemId: string; shulkers: any[] }) => {
    const alreadySelected = colorGroup.shulkers.filter((s) => selectedShulkerIds.includes(s.id));
    
    if (alreadySelected.length > 0) {
      // Deselect all of this color
      setSelectedShulkerIds((prev) => 
        prev.filter((id) => !colorGroup.shulkers.some((s) => s.id === id))
      );
    } else {
      // Select the first available shulker of this color
      const toSelect = colorGroup.shulkers[0];
      if (toSelect) {
        setSelectedShulkerIds((prev) => [...prev, toSelect.id]);
      }
    }
  };

  // Add more shulkers of a specific color
  const addShulkerOfColor = (colorGroup: { itemId: string; shulkers: any[] }) => {
    const alreadySelected = colorGroup.shulkers.filter((s) => selectedShulkerIds.includes(s.id));
    const available = colorGroup.shulkers.filter((s) => !selectedShulkerIds.includes(s.id));
    
    if (available.length > 0) {
      setSelectedShulkerIds((prev) => [...prev, available[0].id]);
    }
  };

  // Remove one shulker of a specific color
  const removeShulkerOfColor = (colorGroup: { itemId: string; shulkers: any[] }) => {
    const selected = colorGroup.shulkers.filter((s) => selectedShulkerIds.includes(s.id));
    
    if (selected.length > 0) {
      const toRemove = selected[selected.length - 1];
      setSelectedShulkerIds((prev) => prev.filter((id) => id !== toRemove.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col p-4 gap-3">
        <DialogHeader className="pb-0 space-y-1">
          <DialogTitle className="text-base">Item Request</DialogTitle>
          {isIndexing && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Bot is currently indexing. Your request will be queued and executed after indexing completes.
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Selected Items */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Items ({items.length})</Label>
              <span className="text-xs text-muted-foreground">{totalItems} total</span>
            </div>
            
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 border rounded bg-muted/20">
                <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No items selected</p>
                <p className="text-xs text-muted-foreground/60">Select items from storage to create a request</p>
              </div>
            ) : (
              <div className="border rounded bg-muted/20 divide-y divide-border/50">
                {items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 p-1.5 group hover:bg-muted/30"
                  >
                    <ItemIcon
                      itemId={item.itemId}
                      itemName={item.itemName}
                      size={24}
                      version={serverVersion}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1 text-xs truncate cursor-default">
                          {item.itemName}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {item.itemName}
                        {item.sources.length > 1 && (
                          <span className="text-muted-foreground ml-1">
                            ({item.sources.length} sources)
                          </span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                    
                    <div className="flex items-center gap-0.5 bg-background/60 rounded border">
                      <button
                        onClick={() => updateItemCount(item.key, -1)}
                        disabled={item.requestedCount <= 1}
                        className="h-6 w-6 flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded-l transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        value={item.requestedCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          const clamped = Math.max(1, Math.min(item.maxCount, val));
                          setItems(prev => prev.map(i => 
                            i.key === item.key ? { ...i, requestedCount: clamped } : i
                          ));
                        }}
                        className="w-10 h-6 text-xs text-center bg-transparent border-x focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min={1}
                        max={item.maxCount}
                      />
                      <button
                        onClick={() => updateItemCount(item.key, 1)}
                        disabled={item.requestedCount >= item.maxCount}
                        className="h-6 w-6 flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded-r transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    
                    <span className="text-[10px] text-muted-foreground w-8 text-right">
                      /{item.maxCount}
                    </span>
                    
                    <button
                      onClick={() => removeItem(item.key)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Method - square cards */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Delivery Method</Label>
            <RadioGroup
              value={deliveryMethod}
              onValueChange={setDeliveryMethod}
              className="grid grid-cols-4 gap-2"
            >
              <label
                className={`aspect-square flex flex-col items-center justify-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-all ${
                  deliveryMethod === "DROP_TO_PLAYER"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted/50 hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value="DROP_TO_PLAYER" className="sr-only" />
                <User className={`h-5 w-5 ${deliveryMethod === "DROP_TO_PLAYER" ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] text-center leading-tight ${deliveryMethod === "DROP_TO_PLAYER" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  To Player
                </span>
              </label>

              <label
                className={`aspect-square flex flex-col items-center justify-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-all ${
                  deliveryMethod === "PUT_IN_CHEST"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted/50 hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value="PUT_IN_CHEST" className="sr-only" />
                <Box className={`h-5 w-5 ${deliveryMethod === "PUT_IN_CHEST" ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] text-center leading-tight ${deliveryMethod === "PUT_IN_CHEST" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  To Chest
                </span>
              </label>

              <label
                className={`aspect-square flex flex-col items-center justify-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-all ${
                  deliveryMethod === "SHULKER_DROP"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted/50 hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value="SHULKER_DROP" className="sr-only" />
                <div className="relative">
                  <Package className={`h-5 w-5 ${deliveryMethod === "SHULKER_DROP" ? "text-primary" : "text-muted-foreground"}`} />
                  <User className={`h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5 ${deliveryMethod === "SHULKER_DROP" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-[10px] text-center leading-tight ${deliveryMethod === "SHULKER_DROP" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  Shulker
                </span>
              </label>

              <label
                className={`aspect-square flex flex-col items-center justify-center gap-1.5 p-3 border rounded-lg cursor-pointer transition-all ${
                  deliveryMethod === "SHULKER_CHEST"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted/50 hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value="SHULKER_CHEST" className="sr-only" />
                <div className="relative">
                  <Package className={`h-5 w-5 ${deliveryMethod === "SHULKER_CHEST" ? "text-primary" : "text-muted-foreground"}`} />
                  <Box className={`h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5 ${deliveryMethod === "SHULKER_CHEST" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-[10px] text-center leading-tight ${deliveryMethod === "SHULKER_CHEST" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  Shulker+
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Player Name - compact */}
          {needsPlayer && (
            <div className="space-y-1">
              <Label htmlFor="targetPlayer" className="text-xs font-medium text-muted-foreground">
                Player
              </Label>
              <Input
                id="targetPlayer"
                placeholder="Minecraft username"
                value={targetPlayer}
                onChange={(e) => setTargetPlayer(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Delivery Location - compact inline */}
          {needsLocation && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Location
              </Label>
              <div className="flex gap-1.5">
                <Input
                  placeholder="X"
                  type="number"
                  value={deliveryX}
                  onChange={(e) => setDeliveryX(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Y"
                  type="number"
                  value={deliveryY}
                  onChange={(e) => setDeliveryY(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Z"
                  type="number"
                  value={deliveryZ}
                  onChange={(e) => setDeliveryZ(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* Shulker Options - compact */}
          {isShulkerMethod && (
            <div className="space-y-3">
              {/* Packing Mode - inline */}
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Packing</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Order</span>
                  <Switch
                    checked={packingMode === "OPTIMIZED"}
                    onCheckedChange={(checked) =>
                      setPackingMode(checked ? "OPTIMIZED" : "SELECTION_ORDER")
                    }
                    className="scale-75"
                  />
                  <span className="text-[10px] text-muted-foreground">Optimized</span>
                </div>
              </div>

              {/* Shulkers - clean color-based selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Select Shulkers
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedShulkerIds.length} / {shulkersNeeded} needed
                    </span>
                    {selectedShulkerIds.length >= shulkersNeeded && (
                      <Badge variant="default" className="h-5 text-[10px] px-2">
                        <Check className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    )}
                  </div>
                </div>
                
                {shulkersByColor.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 border rounded-lg bg-muted/10">
                    <Package className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No empty shulkers</p>
                    <p className="text-xs text-muted-foreground/60">Add empty shulker boxes to your storage</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {shulkersByColor.map((colorGroup) => {
                      const selectedCount = selectedShulkersByColor.get(colorGroup.itemId) || 0;
                      const totalAvailable = colorGroup.shulkers.length;
                      const isSelected = selectedCount > 0;
                      
                      return (
                        <div
                          key={colorGroup.itemId}
                          className={`relative flex flex-col items-center p-2 border rounded-lg transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/50"
                              : "hover:bg-muted/50 hover:border-muted-foreground/30"
                          }`}
                        >
                          {/* Shulker Icon - click to toggle */}
                          <button
                            onClick={() => toggleShulkerColor(colorGroup)}
                            className="flex flex-col items-center gap-1 w-full"
                          >
                            <div className="relative">
                              <ItemIcon
                                itemId={colorGroup.itemId}
                                itemName={colorGroup.itemName}
                                size={32}
                                version={serverVersion}
                              />
                              {isSelected && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded flex items-center justify-center">
                                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {totalAvailable} available
                            </span>
                          </button>
                          
                          {/* Quantity controls - only show when selected */}
                          {isSelected && (
                            <div className="flex items-center gap-1 mt-1.5 bg-background/80 rounded border">
                              <button
                                onClick={() => removeShulkerOfColor(colorGroup)}
                                className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded-l transition-colors"
                              >
                                <Minus className="h-2.5 w-2.5" />
                              </button>
                              <span className="text-xs font-medium w-4 text-center">{selectedCount}</span>
                              <button
                                onClick={() => addShulkerOfColor(colorGroup)}
                                disabled={selectedCount >= totalAvailable}
                                className="h-5 w-5 flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded-r transition-colors"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div>
            {items.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setItems([])}
              >
                Clear All
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              className="h-8" 
              onClick={handleSubmit} 
              disabled={createTask.isPending || items.length === 0}
            >
              {createTask.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Request"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

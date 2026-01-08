"use client";

import { useState, useEffect, useRef } from "react";
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
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  botId,
  storageSystemId,
  selectedItems,
  onClearSelection,
  serverVersion = "1.21.4",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col p-4 gap-3">
        <DialogHeader className="pb-0 space-y-1">
          <DialogTitle className="text-base">Item Request</DialogTitle>
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

          {/* Delivery Method - compact 2x2 grid */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Delivery</Label>
            <RadioGroup
              value={deliveryMethod}
              onValueChange={setDeliveryMethod}
              className="grid grid-cols-2 gap-1.5"
            >
              <label
                className={`flex items-center gap-1.5 p-2 border rounded cursor-pointer transition-colors ${
                  deliveryMethod === "DROP_TO_PLAYER"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="DROP_TO_PLAYER" className="h-3 w-3" />
                <User className="h-3 w-3" />
                <span className="text-xs">To Player</span>
              </label>

              <label
                className={`flex items-center gap-1.5 p-2 border rounded cursor-pointer transition-colors ${
                  deliveryMethod === "PUT_IN_CHEST"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="PUT_IN_CHEST" className="h-3 w-3" />
                <Box className="h-3 w-3" />
                <span className="text-xs">To Chest</span>
              </label>

              <label
                className={`flex items-center gap-1.5 p-2 border rounded cursor-pointer transition-colors ${
                  deliveryMethod === "SHULKER_DROP"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="SHULKER_DROP" className="h-3 w-3" />
                <Package className="h-3 w-3" />
                <span className="text-xs">Shulker → Player</span>
              </label>

              <label
                className={`flex items-center gap-1.5 p-2 border rounded cursor-pointer transition-colors ${
                  deliveryMethod === "SHULKER_CHEST"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value="SHULKER_CHEST" className="h-3 w-3" />
                <Package className="h-3 w-3" />
                <span className="text-xs">Shulker → Chest</span>
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
            <div className="space-y-2">
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

              {/* Shulkers - compact grid */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Shulkers ({selectedShulkerIds.length}/{shulkersNeeded})
                  </Label>
                  {selectedShulkerIds.length >= shulkersNeeded && (
                    <Badge variant="default" className="h-4 text-[10px] px-1.5">Ready</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 p-1.5 border rounded bg-muted/20 min-h-[40px]">
                  {emptyShulkers?.map((shulker: any) => (
                    <Tooltip key={shulker.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleShulkerSelection(shulker.id)}
                          className={`w-8 h-8 rounded flex items-center justify-center transition-all ${
                            selectedShulkerIds.includes(shulker.id)
                              ? "ring-1 ring-primary bg-primary/10"
                              : "bg-muted/50 hover:bg-muted"
                          }`}
                        >
                          <ItemIcon
                            itemId={shulker.itemId}
                            itemName={shulker.itemName}
                            size={24}
                            version={serverVersion}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {shulker.itemName}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {(!emptyShulkers || emptyShulkers.length === 0) && (
                    <span className="text-[10px] text-muted-foreground p-1">
                      No empty shulkers found
                    </span>
                  )}
                </div>
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

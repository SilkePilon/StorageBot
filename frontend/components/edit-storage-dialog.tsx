"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StorageSystem {
  id: string;
  name: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
  returnToHome: boolean;
}

interface EditStorageDialogProps {
  storage: StorageSystem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: {
    name?: string;
    centerX?: number;
    centerY?: number;
    centerZ?: number;
    radius?: number;
  }) => Promise<void>;
  isPending?: boolean;
}

export function EditStorageDialog({
  storage,
  open,
  onOpenChange,
  onSave,
  isPending,
}: EditStorageDialogProps) {
  const [name, setName] = useState("");
  const [centerX, setCenterX] = useState("");
  const [centerY, setCenterY] = useState("");
  const [centerZ, setCenterZ] = useState("");
  const [radius, setRadius] = useState("");

  // Populate form when storage data is available
  useEffect(() => {
    if (storage && open) {
      setName(storage.name || "");
      setCenterX(String(storage.centerX));
      setCenterY(String(storage.centerY));
      setCenterZ(String(storage.centerZ));
      setRadius(String(storage.radius));
    }
  }, [storage, open]);

  const handleSave = async () => {
    if (!storage) return;

    if (!name.trim()) {
      toast.error("Please enter a storage name");
      return;
    }

    if (!centerX || !centerY || !centerZ) {
      toast.error("Please enter all coordinates");
      return;
    }

    const parsedRadius = parseInt(radius, 10);
    if (isNaN(parsedRadius) || parsedRadius < 1 || parsedRadius > 64) {
      toast.error("Radius must be between 1 and 64");
      return;
    }

    try {
      await onSave(storage.id, {
        name: name.trim(),
        centerX: parseInt(centerX, 10),
        centerY: parseInt(centerY, 10),
        centerZ: parseInt(centerZ, 10),
        radius: parsedRadius,
      });
      toast.success("Storage settings updated!");
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || "Failed to update storage");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Edit Storage Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            Update the storage location and search radius. The bot will use these coordinates as its home position.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Storage Name */}
          <div className="space-y-1.5">
            <Label htmlFor="storageName" className="text-xs">
              Storage Name
            </Label>
            <Input
              id="storageName"
              type="text"
              placeholder="Main Storage"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Home Location (Center Coordinates) */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Home Location (Center)
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="centerX" className="text-[10px] text-muted-foreground">
                  X
                </Label>
                <Input
                  id="centerX"
                  type="number"
                  placeholder="0"
                  value={centerX}
                  onChange={(e) => setCenterX(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="centerY" className="text-[10px] text-muted-foreground">
                  Y
                </Label>
                <Input
                  id="centerY"
                  type="number"
                  placeholder="64"
                  value={centerY}
                  onChange={(e) => setCenterY(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="centerZ" className="text-[10px] text-muted-foreground">
                  Z
                </Label>
                <Input
                  id="centerZ"
                  type="number"
                  placeholder="0"
                  value={centerZ}
                  onChange={(e) => setCenterZ(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Search Radius */}
          <div className="space-y-1.5">
            <Label htmlFor="radius" className="text-xs">
              Search Radius (blocks)
            </Label>
            <Input
              id="radius"
              type="number"
              placeholder="32"
              min={1}
              max={64}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              The bot will search for chests within this radius from the center point (1-64 blocks)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

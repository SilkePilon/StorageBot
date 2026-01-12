"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useBotTypes } from "@/hooks/use-bots";
import { toast } from "sonner";
import { Bot, Loader2, ChevronDown, ChevronUp, Wifi, CheckCircle2, Package, Wheat, Sword, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Icon mapping for bot types
const BOT_TYPE_ICON_MAP: Record<string, React.ElementType> = {
  Package: Package,
  Wheat: Wheat,
  Sword: Sword,
  Hammer: Hammer,
  Bot: Bot,
};

interface NewBotDialogProps {
  children: React.ReactNode;
  onSuccess?: (bot: any) => void;
}

export function NewBotDialog({ children, onSuccess }: NewBotDialogProps) {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const { data: botTypes, isLoading: typesLoading, isError: typesError } = useBotTypes();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedType, setSelectedType] = useState<string>("storage");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useOfflineAccount, setUseOfflineAccount] = useState(false);
  const [offlineUsername, setOfflineUsername] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdBotName, setCreatedBotName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shouldRefreshRef = useRef(false);

  const resetForm = () => {
    setName("");
    setSelectedType("storage");
    setShowAdvanced(false);
    setUseOfflineAccount(false);
    setOfflineUsername("");
    setShowSuccess(false);
    setCreatedBotName("");
    setIsSubmitting(false);
  };

  const handleClose = (isOpen: boolean) => {
    // Don't allow closing via backdrop click or escape when showing success
    // User must click "Done" button
    if (!isOpen && showSuccess) {
      return;
    }
    if (!isOpen) {
      resetForm();
    }
    setOpen(isOpen);
  };

  const handleDone = () => {
    // Refresh bots list after closing dialog
    if (shouldRefreshRef.current) {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      shouldRefreshRef.current = false;
    }
    resetForm();
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a bot name");
      return;
    }

    if (useOfflineAccount && !offlineUsername.trim()) {
      toast.error("Please enter an offline username");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/bots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          botType: selectedType,
          useOfflineAccount,
          offlineUsername: useOfflineAccount ? offlineUsername.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create bot");
      }

      const bot = await response.json();
      toast.success("Bot created!");
      setCreatedBotName(bot.name);
      setShowSuccess(true);
      shouldRefreshRef.current = true;
      onSuccess?.(bot);
    } catch (error: any) {
      toast.error(error.message);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {showSuccess ? (
          /* Success State */
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-lg">Bot Created!</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{createdBotName}</span> has been created successfully.
              </p>
            </div>
            <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
              Click the <span className="font-medium">Setup</span> button next to your bot on the dashboard to configure server connection and storage.
            </p>
            <Button size="sm" onClick={handleDone} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          /* Create Form */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                New Bot
              </DialogTitle>
              <DialogDescription>
                Create a new bot. You&apos;ll configure it after creation.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm">
                  Bot Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g., Main Storage Bot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>

              {/* Bot Type Selection */}
              <div className="space-y-2">
                <Label className="text-sm">Bot Type</Label>
                {typesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading bot types...
                  </div>
                ) : typesError ? (
                  <div className="text-sm text-destructive">
                    Failed to load bot types. Please try again.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {botTypes?.map((type) => {
                      const IconComponent = BOT_TYPE_ICON_MAP[type.icon] || Bot;
                      const isSelected = selectedType === type.type;
                      return (
                        <button
                          key={type.type}
                          type="button"
                          onClick={() => setSelectedType(type.type)}
                          className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                          }`}
                        >
                          <div className={`p-2 rounded-md ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                            <IconComponent className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium text-sm ${isSelected ? "text-primary" : ""}`}>
                                {type.name}
                              </span>
                              {isSelected && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                  Selected
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {type.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Advanced Options */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between px-0 h-7 hover:bg-transparent text-xs text-muted-foreground"
                  >
                    Advanced Options
                    {showAdvanced ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Label
                          htmlFor="offline-mode"
                          className="text-sm flex items-center gap-1.5"
                        >
                          <Wifi className="h-3.5 w-3.5" />
                          Offline Mode
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          For LAN testing without Microsoft auth
                        </p>
                      </div>
                      <Switch
                        id="offline-mode"
                        checked={useOfflineAccount}
                        onCheckedChange={setUseOfflineAccount}
                      />
                    </div>

                    {useOfflineAccount && (
                      <div className="space-y-1.5 pt-2 border-t">
                        <Label htmlFor="offlineUsername" className="text-sm">
                          Username
                        </Label>
                        <Input
                          id="offlineUsername"
                          type="text"
                          placeholder="StorageBot"
                          value={offlineUsername}
                          onChange={(e) => setOfflineUsername(e.target.value)}
                          className="h-8"
                        />
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleClose(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Create
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

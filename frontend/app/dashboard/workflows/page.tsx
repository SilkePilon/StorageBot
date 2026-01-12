"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useWorkflows,
  useCreateWorkflow,
  useDeleteWorkflow,
  useRunWorkflow,
  useUpdateWorkflow,
  useImportWorkflow,
  useDuplicateWorkflow,
  useExportWorkflow,
} from "@/hooks/use-workflows";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Play,
  Pause,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Download,
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Workflow,
  Zap,
} from "lucide-react";

export default function WorkflowsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newWorkflow, setNewWorkflow] = useState({ name: "", description: "" });

  const { data: workflows, isLoading } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const runWorkflow = useRunWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const importWorkflow = useImportWorkflow();
  const duplicateWorkflow = useDuplicateWorkflow();
  const exportWorkflow = useExportWorkflow();

  const handleCreate = async () => {
    if (!newWorkflow.name.trim()) return;
    
    try {
      const workflow = await createWorkflow.mutateAsync({
        name: newWorkflow.name,
        description: newWorkflow.description || undefined,
        definition: {
          nodes: [],
          edges: [],
          variables: {},
        },
      });
      setCreateOpen(false);
      setNewWorkflow({ name: "", description: "" });
      router.push(`/dashboard/workflows/${workflow.id}`);
    } catch (error) {
      console.error("Failed to create workflow:", error);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteWorkflow.mutateAsync(deleteId);
      setDeleteId(null);
    } catch (error) {
      console.error("Failed to delete workflow:", error);
    }
  };

  const handleRun = async (id: string) => {
    try {
      await runWorkflow.mutateAsync({ id });
    } catch (error) {
      console.error("Failed to run workflow:", error);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateWorkflow.mutateAsync({ id, data: { status: newStatus } });
    } catch (error) {
      console.error("Failed to update workflow status:", error);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateWorkflow.mutateAsync(id);
    } catch (error) {
      console.error("Failed to duplicate workflow:", error);
    }
  };

  const handleExport = async (id: string, name: string) => {
    try {
      const data = await exportWorkflow.mutateAsync(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9]/gi, "_")}.workflow.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export workflow:", error);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importWorkflow.mutateAsync(data);
    } catch (error) {
      console.error("Failed to import workflow:", error);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">Active</Badge>;
      case "INACTIVE":
        return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Inactive</Badge>;
      case "DRAFT":
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Draft</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{status}</Badge>;
    }
  };

  const getTriggerIcon = (triggerType?: string) => {
    switch (triggerType) {
      case "schedule":
        return <Clock className="h-3 w-3" />;
      case "bot_event":
        return <Zap className="h-3 w-3" />;
      case "webhook":
        return <Download className="h-3 w-3" />;
      default:
        return <Play className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Automate your bots with visual workflows
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" size="sm" className="h-8" onClick={handleImportClick}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Workflow
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workflow</DialogTitle>
                <DialogDescription>
                  Create a new workflow to automate your bots.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="My Workflow"
                    value={newWorkflow.name}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what this workflow does..."
                    value={newWorkflow.description}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createWorkflow.isPending}>
                  {createWorkflow.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Workflow Grid */}
      {workflows?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Workflow className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">No workflows yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first workflow to start automating your bots.
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows?.map((workflow: any) => (
            <Card
              key={workflow.id}
              className="group cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/dashboard/workflows/${workflow.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm truncate">{workflow.name}</CardTitle>
                    {workflow.description && (
                      <CardDescription className="line-clamp-2 mt-1 text-xs">
                        {workflow.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => router.push(`/dashboard/workflows/${workflow.id}`)}>
                        <Edit className="h-3.5 w-3.5 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRun(workflow.id)}>
                        <Play className="h-3.5 w-3.5 mr-2" />
                        Run Now
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(workflow.id, workflow.status)}>
                        {workflow.status === "ACTIVE" ? (
                          <>
                            <Pause className="h-3.5 w-3.5 mr-2" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 mr-2" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDuplicate(workflow.id)}>
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport(workflow.id, workflow.name)}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(workflow.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {getStatusBadge(workflow.status)}
                    {workflow.triggerType && (
                      <Badge variant="outline" className="gap-1 text-xs h-5 px-1.5">
                        {getTriggerIcon(workflow.triggerType)}
                        {workflow.triggerType}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {workflow.lastRunStatus && (
                      <span className="flex items-center gap-1">
                        {workflow.lastRunStatus === "COMPLETED" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : workflow.lastRunStatus === "FAILED" ? (
                          <XCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                      </span>
                    )}
                    <span>
                      {workflow.runCount || 0} runs
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this workflow? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteWorkflow.isPending}>
              {deleteWorkflow.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

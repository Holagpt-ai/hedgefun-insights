import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import type { TradeTag } from "@/hooks/useJournalTrades";

const PRESET_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#6366f1"];

interface Props {
  open: boolean;
  onClose: () => void;
  tags: TradeTag[];
  onAddTag: (name: string, color: string) => void;
  isPending: boolean;
}

export function ManageTagsDialog({ open, onClose, tags, onAddTag, isPending }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const handleAdd = () => {
    if (!name.trim()) return;
    onAddTag(name.trim(), color);
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
          <DialogDescription>Create custom tags to categorize your trades.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label>Tag Name</Label>
            <div className="flex gap-2 mt-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Swing Trade" maxLength={30} className="flex-1" />
              <Button size="sm" onClick={handleAdd} disabled={isPending || !name.trim()} className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground gap-1">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {tags.length > 0 && (
            <div>
              <Label>Existing Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tags.map((tag) => (
                  <span key={tag.id} className="px-2.5 py-1 rounded-full text-xs font-medium text-primary-foreground" style={{ backgroundColor: tag.color }}>
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

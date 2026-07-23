import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Props {
  onAdd: (symbol: string) => void;
  disabled?: boolean;
}

export function V2AddSymbol({ onAdd, disabled }: Props) {
  const [val, setVal] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = val.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(t)) return;
    onAdd(t);
    setVal("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value.toUpperCase())}
        placeholder="Add ticker (e.g. AAPL)"
        maxLength={15}
        className="h-9 max-w-[220px]"
      />
      <Button type="submit" size="sm" disabled={disabled || !val.trim()}>
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </form>
  );
}

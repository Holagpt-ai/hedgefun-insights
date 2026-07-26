import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

interface Props {
  onAdd: (symbol: string) => void;
  disabled?: boolean;
  /** Optional handoff symbol — prefills and focuses the input; user still must click Add. */
  initialSymbol?: string | null;
}

export function V2AddSymbol({ onAdd, disabled, initialSymbol }: Props) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialSymbol) return;
    const t = initialSymbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(t)) return;
    setVal(t);
    // Focus after paint; ignore in non-DOM test envs.
    queueMicrotask(() => inputRef.current?.focus());
  }, [initialSymbol]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = val.trim().toUpperCase();
    if (!SYMBOL_RE.test(t)) return;
    onAdd(t);
    setVal("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value.toUpperCase())}
        placeholder="Add ticker (e.g. AAPL)"
        maxLength={15}
        className="h-9 max-w-[220px]"
        aria-label="Add ticker"
      />
      <Button type="submit" size="sm" disabled={disabled || !val.trim()}>
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </form>
  );
}

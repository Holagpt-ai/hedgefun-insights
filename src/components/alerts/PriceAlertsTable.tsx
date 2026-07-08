import { Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { conditionLabel, formatAlertValue, type PriceAlert } from "@/config/price-alerts.config";

interface Props {
  alerts: PriceAlert[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (alert: PriceAlert) => void;
  onDelete: (id: string) => void;
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (enabled
          ? "bg-accent-blue-light text-accent-blue"
          : "bg-muted text-muted-foreground")
      }
    >
      <span className={"h-1.5 w-1.5 rounded-full " + (enabled ? "bg-accent-blue" : "bg-muted-foreground/60")} />
      {enabled ? "Preview · active" : "Disabled"}
    </span>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function PriceAlertsTable({ alerts, onToggle, onEdit, onDelete }: Props) {
  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border bg-surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                <th className="text-left px-4 py-2.5 font-medium">Condition</th>
                <th className="text-left px-4 py-2.5 font-medium">Value</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Created</th>
                <th className="text-left px-4 py-2.5 font-medium">Note</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-foreground">{a.symbol}</td>
                  <td className="px-4 py-3 text-foreground">{conditionLabel(a.condition)}</td>
                  <td className="px-4 py-3 text-foreground">{formatAlertValue(a.condition, a.value)}</td>
                  <td className="px-4 py-3"><StatusPill enabled={a.enabled} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={a.note ?? ""}>
                    {a.note ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={a.enabled}
                        onCheckedChange={(v) => onToggle(a.id, v)}
                        aria-label={a.enabled ? "Disable alert" : "Enable alert"}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(a)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => onDelete(a.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          Preview — alerts are not delivered yet.
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-surface-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{a.symbol}</span>
                  <StatusPill enabled={a.enabled} />
                </div>
                <div className="text-sm text-foreground mt-1">
                  {conditionLabel(a.condition)} · {formatAlertValue(a.condition, a.value)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Created {fmtDate(a.createdAt)}</div>
                {a.note && (
                  <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{a.note}</div>
                )}
              </div>
              <Switch
                checked={a.enabled}
                onCheckedChange={(v) => onToggle(a.id, v)}
                aria-label={a.enabled ? "Disable alert" : "Enable alert"}
              />
            </div>
            <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => onEdit(a)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground text-center pt-1">
          Preview — alerts are not delivered yet.
        </p>
      </div>
    </div>
  );
}

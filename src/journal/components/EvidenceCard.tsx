import { cn } from "@/lib/utils";
import { useJournalT } from "../i18n";

export function EvidenceCard({
  title,
  body,
  links,
  tone = "brand",
  demo,
}: {
  title: string;
  body: string;
  links?: { label: string; href: string }[];
  tone?: "gain" | "warn" | "brand" | "loss";
  demo?: boolean;
}) {
  const t = useJournalT();
  return (
    <div className={cn("journal-ai-block", `journal-ai-${tone}`)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">{title}</div>
        {demo ? <span className="journal-badge journal-badge-warn">{t("coach.demoLabel")}</span> : null}
      </div>
      <p className="text-xs mt-1 leading-relaxed">{body}</p>
      {links?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-[11px] font-semibold text-accent-blue hover:underline">
              → {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

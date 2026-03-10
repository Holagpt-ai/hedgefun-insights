import { useLanguage } from "@/contexts/LanguageContext";

interface StubProps {
  titleKey?: string;
  title: string;
  description: string;
}

export default function StubPage({ title, description }: StubProps) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-[1.375rem] font-bold text-foreground">{title}</h1>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent-blue-light text-accent-blue">
          Coming Soon
        </span>
      </div>
      <p className="text-sm text-text-secondary">{description}</p>
    </div>
  );
}

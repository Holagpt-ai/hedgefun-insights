import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const copy = {
  en: {
    title: "Free AI Trading Journal for Stocks, Options and Crypto",
    subtitle:
      "Record executions, calculate deterministic P&L, review process, and carry one behavior change into the next session. No broker connection required.",
    cta: "Start My Free Journal",
    login: "Log in",
    bullets: [
      "Stocks, equity options, and crypto spot",
      "Manual entry and CSV import",
      "Multiple accounts, executions, and partial exits",
      "Calendar, Daily Review, Notebook, and Playbooks",
      "Reports, Analytics, and evidence-based AI Coach",
      "Private by default with user-scoped security",
    ],
    note: "Illustrative product screens. Demo Workspace data is labeled and never mixed with your journal.",
    faqTitle: "FAQ",
    faqs: [
      { q: "Is the Journal free?", a: "Yes. Every authenticated Stocksist user gets the complete Journal with no Pro lock." },
      { q: "Do I need a broker connection?", a: "No. Log trades manually or import a CSV. Broker and exchange sync remain Coming Soon." },
      { q: "Does AI invent P&L?", a: "No. A versioned calculation engine is the source of financial truth. AI explains evidence." },
    ],
  },
  es: {
    title: "Diario de trading con IA gratis para acciones, opciones y cripto",
    subtitle:
      "Registra ejecuciones, calcula P&L determinista, revisa el proceso y lleva un cambio de conducta a la siguiente sesión. No se requiere bróker.",
    cta: "Empezar mi diario gratis",
    login: "Iniciar sesión",
    bullets: [
      "Acciones, opciones sobre acciones y cripto spot",
      "Entrada manual e importación CSV",
      "Varias cuentas, ejecuciones y salidas parciales",
      "Calendario, revisión diaria, cuaderno y playbooks",
      "Informes, analítica y Coach de IA basado en evidencia",
      "Privado por defecto con seguridad por usuario",
    ],
    note: "Pantallas ilustrativas. Los datos del espacio de demostración están etiquetados y nunca se mezclan con tu diario.",
    faqTitle: "Preguntas frecuentes",
    faqs: [
      { q: "¿El diario es gratis?", a: "Sí. Cada usuario autenticado de Stocksist recibe el diario completo sin bloqueo Pro." },
      { q: "¿Necesito conectar un bróker?", a: "No. Registra operaciones manualmente o importa un CSV. La sincronización con brókers y exchanges sigue como Próximamente." },
      { q: "¿La IA inventa el P&L?", a: "No. Un motor de cálculo versionado es la fuente de verdad financiera. La IA explica evidencia." },
    ],
  },
} as const;

export default function TradingJournalPublicPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const t = copy[language] ?? copy.en;
  const href = user ? "/dashboard/journal/onboarding" : "/signup?next=/dashboard/journal/onboarding";

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-blue">Stocksist Trading Journal</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-accent-blue hover:bg-accent-blue-hover">
            <Link to={href}>{t.cta}</Link>
          </Button>
          {!user ? (
            <Button asChild variant="outline">
              <Link to="/login?next=/dashboard/journal">{t.login}</Link>
            </Button>
          ) : null}
        </div>
      </header>
      <ul className="grid gap-2 text-sm">
        {t.bullets.map((item) => (
          <li key={item} className="rounded-lg border border-border bg-surface-card px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t.note}</p>
      <section>
        <h2 className="text-lg font-semibold mb-3">{t.faqTitle}</h2>
        <dl className="space-y-3">
          {t.faqs.map((item) => (
            <div key={item.q} className="rounded-lg border border-border bg-surface-card p-3">
              <dt className="font-semibold">{item.q}</dt>
              <dd className="text-sm text-muted-foreground mt-1">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

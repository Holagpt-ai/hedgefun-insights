import type { HomepageCalendarTab } from "@/config/homepage-v21";

export type HomepageV21Lang = "en" | "es";

type HomepageV21CopyBundle = {
  heroTitlePrefix: string;
  heroTitleEmphasis: string;
  heroSub: string;
  heroSearchPlaceholder: string;
  heroSearchButton: string;
  heroCreateAccount: string;
  trendingLabel: string;
  basicsLink: string;
  searchNoResults: string;
  searchSearching: string;
  calendarTitle: string;
  calendarEconomicUnavailable: string;
  calendarNoEvents: (tab: HomepageCalendarTab) => string;
  calendarFeedError: string;
  calendarViewFull: string;
  calendarViewEarnings: string;
  calendarCatalystV4Soon: string;
  calendarHandoffDate: string;
  calendarToday: string;
  calendarHoliday: string;
  calendarEarlyClose: string;
  moversPriceFilterAll: string;
  moversPriceFilterGt1: string;
  moversPriceFilterGt10: string;
  newsMore: string;
  newsFeatured: string;
  newsTitle: string;
  newsMoreLink: string;
  newsUnavailable: string;
  newsEmpty: string;
  adReserved: string;
  moversTitle: string;
  moversViewAll: string;
  toolsTitle: string;
  footerNewsletterNote: string;
  footerNewsletterDeferred: string;
};

const en: HomepageV21CopyBundle = {
  heroTitlePrefix: "Stock Market Intelligence for",
  heroTitleEmphasis: "Every Investor",
  heroSub:
    "Research stocks, track session movers, and follow the catalysts that matter.",
  heroSearchPlaceholder: "Search a company or ticker to start your analysis",
  heroSearchButton: "Search",
  heroCreateAccount: "Create free account",
  trendingLabel: "Trending:",
  basicsLink: "New here? Start with the basics →",
  searchNoResults: "No results for",
  searchSearching: "Searching…",
  calendarTitle: "Calendar",
  calendarEconomicUnavailable:
    "Economic releases are not available on the homepage yet. Check back after the macro data feed is connected.",
  calendarNoEvents: (tab: HomepageCalendarTab) =>
    tab === "earnings" ? "No earnings on this day." : "No catalyst events on this day.",
  calendarFeedError: "Calendar is temporarily unavailable.",
  calendarViewFull: "View full calendar →",
  calendarViewEarnings: "View earnings calendar →",
  calendarCatalystV4Soon: "Full catalyst calendar — coming in V4",
  calendarHandoffDate: "Selected date",
  calendarToday: "Today",
  calendarHoliday: "Market holiday",
  calendarEarlyClose: "Early close",
  moversPriceFilterAll: "All prices",
  moversPriceFilterGt1: "Price > $1",
  moversPriceFilterGt10: "Price > $10",
  newsMore: "More News:",
  newsFeatured: "Featured",
  newsTitle: "Market News",
  newsMoreLink: "More news →",
  newsUnavailable: "Market news is temporarily unavailable.",
  newsEmpty: "No recent headlines.",
  adReserved: "Reserved · not activated",
  moversTitle: "Market Movers",
  moversViewAll: "View all movers →",
  toolsTitle: "Tools",
  footerNewsletterNote:
    "Daily market news in bullet point format. Subscription delivery is still rolling out; we’ll confirm by email when your signup is active.",
  footerNewsletterDeferred:
    "Newsletter delivery is not fully live yet — visit the newsletter page for the latest status.",
};

export const HOMEPAGE_V21_TOOL_COPY = {
  en: {
    watchlistDesc: "Your tickers, alerts and price moves in one personal list that follows you everywhere.",
    watchlistGo: "Open Watchlist",
    screenerDesc: "Filter thousands of stocks by price, sector, momentum and value to find your next idea.",
    screenerGo: "Run a screen",
    moversDesc: "The session’s biggest verified gainers and losers — and the catalyst behind each move.",
    moversGo: "See movers",
    calendarsDesc: "Earnings, economic data and catalysts in one place.",
    calendarsGo: "View calendars",
    trendingDesc: "The tickers and stories other investors are watching right now, ranked by attention.",
    trendingGo: "See what’s trending",
    proDesc: "Dashboard, Market Radar and AI Analyst — verified movers with the news behind them.",
    proGo: "Explore Pro",
  },
  es: {
    watchlistDesc: "Tus tickers, alertas y movimientos en una lista personal que te acompaña.",
    watchlistGo: "Abrir seguimiento",
    screenerDesc: "Filtra miles de acciones por precio, sector, momentum y valor.",
    screenerGo: "Ejecutar filtro",
    moversDesc: "Los mayores ganadores y perdedores verificados de la sesión.",
    moversGo: "Ver movimientos",
    calendarsDesc: "Ganancias, datos macro y catalizadores en un solo lugar.",
    calendarsGo: "Ver calendarios",
    trendingDesc: "Los tickers y temas que otros inversores siguen ahora, por atención.",
    trendingGo: "Ver tendencias",
    proDesc: "Panel, Market Radar y analista IA — movimientos verificados con contexto.",
    proGo: "Explorar Pro",
  },
} as const;

const es: HomepageV21CopyBundle = {
  heroTitlePrefix: "Inteligencia bursátil para",
  heroTitleEmphasis: "cada inversor",
  heroSub:
    "Investiga acciones, sigue los movimientos de la sesión y los catalizadores relevantes.",
  heroSearchPlaceholder: "Busca una empresa o ticker para comenzar tu análisis",
  heroSearchButton: "Buscar",
  heroCreateAccount: "Crear cuenta gratis",
  trendingLabel: "Tendencias:",
  basicsLink: "¿Nuevo aquí? Empieza con lo básico →",
  searchNoResults: "Sin resultados para",
  searchSearching: "Buscando…",
  calendarTitle: "Calendario",
  calendarEconomicUnavailable:
    "Los datos económicos aún no están disponibles en la página de inicio.",
  calendarNoEvents: (tab: HomepageCalendarTab) =>
    tab === "earnings" ? "No hay ganancias este día." : "No hay catalizadores este día.",
  calendarFeedError: "El calendario no está disponible temporalmente.",
  calendarViewFull: "Ver calendario completo →",
  calendarViewEarnings: "Ver calendario de ganancias →",
  calendarCatalystV4Soon: "Calendario de catalizadores — próximamente (V4)",
  calendarHandoffDate: "Fecha seleccionada",
  calendarToday: "Hoy",
  calendarHoliday: "Feriado bursátil",
  calendarEarlyClose: "Cierre anticipado",
  moversPriceFilterAll: "Todos los precios",
  moversPriceFilterGt1: "Precio > $1",
  moversPriceFilterGt10: "Precio > $10",
  newsMore: "Más noticias:",
  newsFeatured: "Destacado",
  newsTitle: "Noticias del mercado",
  newsMoreLink: "Más noticias →",
  newsUnavailable: "Las noticias no están disponibles temporalmente.",
  newsEmpty: "No hay titulares recientes.",
  adReserved: "Reservado · sin activar",
  moversTitle: "Movimientos del mercado",
  moversViewAll: "Ver todos los movimientos →",
  toolsTitle: "Herramientas",
  footerNewsletterNote:
    "Noticias diarias del mercado. La entrega aún está en despliegue; confirmaremos por correo cuando tu registro esté activo.",
  footerNewsletterDeferred:
    "La newsletter aún no está totalmente activa — visita la página de newsletter para el estado actual.",
};

export function homepageV21Copy(lang: HomepageV21Lang) {
  return lang === "es" ? es : en;
}
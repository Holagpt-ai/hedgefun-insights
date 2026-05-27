import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "es";

type Translations = Record<string, Record<Language, string>>;

const translations: Translations = {
  home: { en: "Home", es: "Inicio" },
  watchlist: { en: "Watchlist", es: "Lista de seguimiento" },
  stocks: { en: "Stocks", es: "Acciones" },
  ipos: { en: "IPOs", es: "OPVs" },
  etfs: { en: "ETFs", es: "ETFs" },
  news: { en: "News", es: "Noticias" },
  trending: { en: "Trending", es: "Tendencias" },
  articles: { en: "Articles", es: "Artículos" },
  technicalChart: { en: "Technical Chart", es: "Gráfico técnico" },
  marketMovers: { en: "Market Movers", es: "Movimientos del mercado" },
  marketNewsletter: { en: "Market Newsletter", es: "Boletín del mercado" },
  hedgefunPro: { en: "HedgeFun Pro", es: "HedgeFun Pro" },
  tools: { en: "Tools", es: "Herramientas" },
  screener: { en: "Screener", es: "Buscador" },
  account: { en: "Account", es: "Cuenta" },
  logIn: { en: "Log In", es: "Iniciar sesión" },
  signUp: { en: "Sign Up", es: "Registrarse" },
  signOut: { en: "Sign Out", es: "Cerrar sesión" },
  myAccount: { en: "My Account", es: "Mi cuenta" },
  myWatchlist: { en: "My Watchlist", es: "Mi lista" },
  accountSettings: { en: "Account Settings", es: "Configuración" },
  manageBilling: { en: "Manage Billing", es: "Facturación" },
  searchPlaceholder: { en: "Search stocks...", es: "Buscar acciones..." },
  stockScreener: { en: "Stock Screener", es: "Filtro de acciones" },
  stockJournal: { en: "Stock Journal", es: "Diario de operaciones" },
  earningsCalendar: { en: "Earnings Calendar", es: "Calendario de ganancias" },
  dividends: { en: "Dividends", es: "Dividendos" },
  ipoList: { en: "IPO List", es: "Lista de OPV" },
  splitHistory: { en: "Split History", es: "Historial de splits" },
  recentIpos: { en: "Recent IPOs", es: "OPVs recientes" },
  ipoCalendar: { en: "IPO Calendar", es: "Calendario de OPV" },
  ipoStatistics: { en: "IPO Statistics", es: "Estadísticas de OPV" },
  ipoNews: { en: "IPO News", es: "Noticias de OPV" },
  ipoScreener: { en: "IPO Screener", es: "Filtro de OPV" },
  etfScreener: { en: "ETF Screener", es: "Filtro ETF" },
  newLaunches: { en: "New Launches", es: "Nuevos lanzamientos" },
  etfProviders: { en: "ETF Providers", es: "Proveedores de ETF" },
  topGainers: { en: "Top Gainers", es: "Mayores alzas" },
  topLosers: { en: "Top Losers", es: "Mayores bajas" },
  mostActive: { en: "Most Active", es: "Más activos" },
  preMarket: { en: "Pre-Market", es: "Pre-apertura" },
  afterHours: { en: "After-Hours", es: "Post-cierre" },
  advertisement: { en: "Advertisement", es: "Publicidad" },
  stockExchanges: { en: "Stock Exchanges", es: "Bolsas de valores" },
  comparisonTool: { en: "Comparison Tool", es: "Herramienta de comparación" },
  byIndustry: { en: "By Industry", es: "Por industria" },
  stockLists: { en: "Stock Lists", es: "Listas de acciones" },
  topAnalysts: { en: "Top Analysts", es: "Mejores analistas" },
  topStocks: { en: "Top Stocks", es: "Mejores acciones" },
  corporateActions: { en: "Corporate Actions", es: "Acciones corporativas" },
  heroTitle: { en: "Search for a stock to start your analysis", es: "Busca una acción para comenzar tu análisis" },
  heroSubtitle: { en: "Get real-time prices, financials, news, and analysis for any stock.", es: "Obtén precios en tiempo real, financieros, noticias y análisis de cualquier acción." },
  trendingLabel: { en: "Trending:", es: "Tendencias:" },
  signInGoogle: { en: "Sign in with Google", es: "Iniciar sesión con Google" },
  newsletterDesc: { en: "Daily market news in bullet point format.", es: "Noticias del mercado diarias en formato de viñetas." },
  emailPlaceholder: { en: "Enter your email", es: "Ingresa tu correo" },
  subscribe: { en: "Subscribe", es: "Suscribirse" },
  allRightsReserved: { en: "All rights reserved.", es: "Todos los derechos reservados." },
  lightMode: { en: "Light", es: "Claro" },
  darkMode: { en: "Dark", es: "Oscuro" },
  freeNewsletter: { en: "Free Newsletter", es: "Boletín gratuito" },
  getSupport: { en: "Get Support", es: "Obtener soporte" },
  downloadApp: { en: "Download App", es: "Descargar app" },
  createAccount: { en: "Create Account", es: "Crear cuenta" },
  sitemap: { en: "Sitemap", es: "Mapa del sitio" },
  advertise: { en: "Advertise", es: "Publicidad" },
  faq: { en: "FAQ", es: "Preguntas frecuentes" },
  about: { en: "About", es: "Acerca de" },
  contactUs: { en: "Contact Us", es: "Contáctanos" },
  termsOfUse: { en: "Terms of Use", es: "Términos de uso" },
  privacyPolicy: { en: "Privacy Policy", es: "Política de privacidad" },
  dataDisclaimer: { en: "Data Disclaimer", es: "Aviso de datos" },
  affiliateProgram: { en: "Affiliate Program", es: "Programa de afiliados" },
  footerSections: { en: "SECTIONS", es: "SECCIONES" },
  footerServices: { en: "SERVICES", es: "SERVICIOS" },
  footerWebsite: { en: "WEBSITE", es: "SITIO WEB" },
  footerCompany: { en: "COMPANY", es: "EMPRESA" },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("hedgefun-lang") as Language) || "en";
    }
    return "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("hedgefun-lang", lang);
  };

  const t = (key: string): string => {
    return translations[key]?.[language] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

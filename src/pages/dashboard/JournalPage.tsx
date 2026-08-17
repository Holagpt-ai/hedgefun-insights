import { Navigate, useSearchParams } from "react-router-dom";

/** Legacy dashboard journal route — preserved as a redirect so old links keep working. */
export default function JournalPage() {
  const [params] = useSearchParams();
  const symbol = params.get("symbol");
  const to = symbol ? `/dashboard/journal/trades/new?symbol=${encodeURIComponent(symbol)}` : "/dashboard/journal";
  return <Navigate to={to} replace />;
}

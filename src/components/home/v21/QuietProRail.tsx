import { Link } from "react-router-dom";
import { Crown } from "lucide-react";

export function QuietProRail() {
  return (
    <div className="rail-pro rounded-[14px] bg-gradient-to-br from-[var(--hp-navy)] to-[#0f2038] p-4 text-[#dbe6f5] shadow-sm">
      <h3 className="flex items-center gap-2 text-base font-extrabold text-white">
        <Crown className="h-4 w-4 text-amber-300" />
        Stocksist Pro
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[#aebdd2]">
        Deeper screeners, extended history, and workspace tools — when you are ready to upgrade.
      </p>
      <p className="rp-price mt-2 text-xs">
        From <b>$29</b> / month · preview pricing
      </p>
      <Link
        to="/pro"
        className="btn mt-3 flex w-full items-center justify-center rounded-lg bg-[var(--hp-blue)] py-2 text-sm font-bold text-white"
      >
        See Pro →
      </Link>
    </div>
  );
}
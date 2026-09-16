import { useMemo, useState } from "react";
import {
  DEFAULT_TRADER_LENS_PRESET_ID,
  parseTraderLensPriceInput,
  resolveTraderLensBounds,
  type TraderLensPresetId,
} from "@/config/scanner-presets.config";

export function useTraderLens() {
  const [presetId, setPresetId] = useState<TraderLensPresetId>(DEFAULT_TRADER_LENS_PRESET_ID);
  const [customMinInput, setCustomMinInput] = useState("2");
  const [customMaxInput, setCustomMaxInput] = useState("20");

  const customMin = parseTraderLensPriceInput(customMinInput);
  const customMax = parseTraderLensPriceInput(customMaxInput);
  const bounds = useMemo(
    () => resolveTraderLensBounds(presetId, customMin, customMax),
    [presetId, customMin, customMax],
  );

  const selectPreset = (next: TraderLensPresetId) => {
    setPresetId(next);
    if (next === "momentum_2_20") {
      setCustomMinInput("2");
      setCustomMaxInput("20");
      return;
    }
    if (next === "band_1_10") {
      setCustomMinInput("1");
      setCustomMaxInput("10");
      return;
    }
    if (next === "band_5_20") {
      setCustomMinInput("5");
      setCustomMaxInput("20");
      return;
    }
    if (next === "band_10_50") {
      setCustomMinInput("10");
      setCustomMaxInput("50");
      return;
    }
    if (next === "all_movers") {
      setCustomMinInput("");
      setCustomMaxInput("");
    }
  };

  const setMinInput = (value: string) => {
    setCustomMinInput(value);
    if (presetId !== "custom") setPresetId("custom");
  };

  const setMaxInput = (value: string) => {
    setCustomMaxInput(value);
    if (presetId !== "custom") setPresetId("custom");
  };

  const resetLens = () => {
    setPresetId(DEFAULT_TRADER_LENS_PRESET_ID);
    setCustomMinInput("2");
    setCustomMaxInput("20");
  };

  return {
    presetId,
    customMinInput,
    customMaxInput,
    bounds,
    selectPreset,
    setMinInput,
    setMaxInput,
    resetLens,
  };
}

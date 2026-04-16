"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DRILL_SOURCE_ORDER, formatDrillSourceLabel, type DrillSourceKind } from "@/lib/drill-source";
import { searchDrillsByOrigin } from "@/lib/workflow/drill-selector-search";
import type { AvailableDrillDisplayOption } from "@/lib/workflow/available-drills";

type DrillOriginSelectorProps = {
  selectedSource: DrillSourceKind;
  onSelectedSourceChange: (source: DrillSourceKind) => void;
  selectedDrillKey: string;
  onSelectedDrillKeyChange: (key: string) => void;
  drillOptionsBySource: Map<DrillSourceKind, AvailableDrillDisplayOption[]>;
  fallbackKey: string;
  freestyleLabel: string;
  disabled?: boolean;
  sourceDisabled?: boolean;
  drillDisabled?: boolean;
  labelClassName?: string;
  inputClassName?: string;
  helperClassName?: string;
};

export function DrillOriginSelector({
  selectedSource,
  onSelectedSourceChange,
  selectedDrillKey,
  onSelectedDrillKeyChange,
  drillOptionsBySource,
  fallbackKey,
  freestyleLabel,
  disabled,
  sourceDisabled,
  drillDisabled,
  labelClassName,
  inputClassName,
  helperClassName
}: DrillOriginSelectorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleOptions = useMemo(() => drillOptionsBySource.get(selectedSource) ?? [], [drillOptionsBySource, selectedSource]);
  const selectedOption = useMemo(
    () => visibleOptions.find((option) => option.key === selectedDrillKey) ?? null,
    [selectedDrillKey, visibleOptions]
  );

  const filteredOptions = useMemo(() => searchDrillsByOrigin(visibleOptions, query), [query, visibleOptions]);

  const freestyleSearchText = `${freestyleLabel} no drill freestyle overlay`.toLowerCase();
  const showFreestyleOption = query.trim().length === 0 || freestyleSearchText.includes(query.trim().toLowerCase());
  const entries = useMemo(() => {
    const items: Array<
      | { type: "freestyle"; key: string; label: string }
      | { type: "drill"; key: string; label: string; metadataMatch: boolean }
    > = [];
    if (showFreestyleOption) {
      items.push({ type: "freestyle", key: fallbackKey, label: freestyleLabel });
    }
    for (const result of filteredOptions) {
      items.push({ type: "drill", key: result.option.key, label: result.option.displayLabel, metadataMatch: result.metadataMatch });
    }
    return items;
  }, [fallbackKey, filteredOptions, freestyleLabel, showFreestyleOption]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, Math.max(entries.length - 1, 0)));
  }, [entries.length, isOpen]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function commitSelection(key: string) {
    onSelectedDrillKeyChange(key);
    setIsOpen(false);
  }

  const selectedDrillLabel = selectedDrillKey === fallbackKey ? freestyleLabel : (selectedOption?.displayLabel ?? freestyleLabel);

  return (
    <>
      <label className={labelClassName}>
        <span>Drill Origin</span>
        <select
          className={inputClassName}
          value={selectedSource}
          onChange={(event) => onSelectedSourceChange(event.target.value as DrillSourceKind)}
          disabled={disabled || sourceDisabled}
        >
          {DRILL_SOURCE_ORDER.map((source) => (
            <option key={source} value={source}>
              {formatDrillSourceLabel(source)}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        <span>Drill</span>
        <div ref={wrapperRef} style={{ position: "relative" }}>
          <input
            type="text"
            className={inputClassName}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={isOpen ? query : selectedDrillLabel}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onChange={(event) => {
              if (!isOpen) {
                setIsOpen(true);
              }
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (!isOpen) {
                  setIsOpen(true);
                  return;
                }
                setActiveIndex((index) => Math.min(index + 1, Math.max(entries.length - 1, 0)));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                if (!isOpen) {
                  setIsOpen(true);
                  return;
                }
                setActiveIndex((index) => Math.max(index - 1, 0));
                return;
              }
              if (event.key === "Enter" && isOpen) {
                event.preventDefault();
                const active = entries[activeIndex];
                if (active) {
                  commitSelection(active.key);
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setIsOpen(false);
                return;
              }
              if (event.key === "Tab") {
                setIsOpen(false);
              }
            }}
            disabled={disabled || drillDisabled}
            placeholder="Search drills"
          />
          {isOpen ? (
            <div
              id={listboxId}
              role="listbox"
              style={{
                position: "absolute",
                top: "calc(100% + 0.35rem)",
                left: 0,
                right: 0,
                zIndex: 25,
                border: "1px solid var(--border)",
                borderRadius: "0.6rem",
                background: "var(--surface)",
                maxHeight: "min(260px, 48vh)",
                overflowY: "auto",
                padding: "0.3rem"
              }}
            >
              {entries.length === 0 ? (
                <p className={helperClassName} style={{ margin: 0, padding: "0.35rem 0.45rem" }}>
                  No {formatDrillSourceLabel(selectedSource).toLowerCase()} drills match your search.
                </p>
              ) : (
                entries.map((entry, index) => {
                  const selected = selectedDrillKey === entry.key;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commitSelection(entry.key)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderRadius: "0.45rem",
                        background: active ? "var(--accent-soft)" : "transparent",
                        color: "inherit",
                        padding: "0.45rem 0.5rem",
                        display: "grid",
                        gap: "0.2rem",
                        cursor: "pointer"
                      }}
                    >
                      <span style={{ fontSize: "0.86rem" }}>{entry.label}</span>
                      {entry.type === "drill" && entry.metadataMatch ? <span className={helperClassName}>Metadata match</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </label>
    </>
  );
}

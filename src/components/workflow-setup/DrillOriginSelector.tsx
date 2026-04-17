"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DRILL_SOURCE_ORDER, formatDrillSourceLabel, type DrillSourceKind } from "@/lib/drill-source";
import { searchDrillsByOrigin } from "@/lib/workflow/drill-selector-search";
import type { AvailableDrillDisplayOption } from "@/lib/workflow/available-drills";

type BaseFieldProps = {
  labelClassName?: string;
  inputClassName?: string;
  helperClassName?: string;
  disabled?: boolean;
};

type DrillOriginSelectFieldProps = BaseFieldProps & {
  selectedSource: DrillSourceKind;
  onSelectedSourceChange: (source: DrillSourceKind) => void;
};

type DrillComboboxFieldProps = BaseFieldProps & {
  selectedSource: DrillSourceKind;
  selectedDrillKey: string;
  onSelectedDrillKeyChange: (key: string) => void;
  drillOptionsBySource: Map<DrillSourceKind, AvailableDrillDisplayOption[]>;
  fallbackKey: string;
  freestyleLabel: string;
};

const MOBILE_MEDIA_QUERY = "(max-width: 760px)";

export function DrillOriginSelectField({
  selectedSource,
  onSelectedSourceChange,
  labelClassName,
  inputClassName,
  disabled
}: DrillOriginSelectFieldProps) {
  return (
    <label className={labelClassName}>
      <span>Drill Origin</span>
      <select
        className={inputClassName}
        value={selectedSource}
        onChange={(event) => onSelectedSourceChange(event.target.value as DrillSourceKind)}
        disabled={disabled}
      >
        {DRILL_SOURCE_ORDER.map((source) => (
          <option key={source} value={source}>
            {formatDrillSourceLabel(source)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DrillComboboxField({
  selectedSource,
  selectedDrillKey,
  onSelectedDrillKeyChange,
  drillOptionsBySource,
  fallbackKey,
  freestyleLabel,
  labelClassName,
  inputClassName,
  helperClassName,
  disabled
}: DrillComboboxFieldProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
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
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateViewportMode = () => setIsMobileViewport(media.matches);
    updateViewportMode();
    media.addEventListener("change", updateViewportMode);
    return () => media.removeEventListener("change", updateViewportMode);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, Math.max(entries.length - 1, 0)));
  }, [entries.length, isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobileViewport) {
      return;
    }
    mobileSearchInputRef.current?.focus();
  }, [isMobileViewport, isOpen]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function commitSelection(key: string) {
    onSelectedDrillKeyChange(key);
    setIsOpen(false);
  }

  const selectedDrillLabel = selectedDrillKey === fallbackKey ? freestyleLabel : (selectedOption?.displayLabel ?? freestyleLabel);

  const listbox = (
    <div
      id={listboxId}
      role="listbox"
      className={`drill-combobox-listbox ${isMobileViewport ? "drill-combobox-listbox--mobile" : "drill-combobox-listbox--desktop"}`}
    >
      {entries.length === 0 ? (
        <p className={helperClassName} style={{ margin: 0, padding: "0.45rem 0.55rem" }}>
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
              className={`drill-combobox-option ${selected ? "is-selected" : ""} ${active ? "is-active" : ""}`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => commitSelection(entry.key)}
            >
              <span className="drill-combobox-option-label">{entry.label}</span>
              {entry.type === "drill" && entry.metadataMatch ? <span className={helperClassName}>Metadata match</span> : null}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <label className={labelClassName}>
      <span>Drill</span>
      <div
        ref={wrapperRef}
        data-combobox-open={isOpen ? "true" : "false"}
        data-mobile-combobox={isMobileViewport ? "true" : "false"}
        className="drill-combobox-anchor"
        style={{ position: "relative", zIndex: isOpen && !isMobileViewport ? 120 : 1, isolation: "isolate" }}
      >
        {isMobileViewport ? (
          <button
            type="button"
            className={`${inputClassName ?? ""} drill-combobox-mobile-trigger`}
            onClick={() => setIsOpen(true)}
            disabled={disabled}
            aria-expanded={isOpen}
            aria-controls={listboxId}
          >
            <span>{selectedDrillLabel}</span>
            <span aria-hidden="true">▾</span>
          </button>
        ) : (
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
            disabled={disabled}
            placeholder="Search drills"
          />
        )}
        {isOpen && isMobileViewport ? (
          <div className="drill-combobox-mobile-overlay" role="presentation">
            <button type="button" className="drill-combobox-mobile-backdrop" aria-label="Close drill picker" onClick={() => setIsOpen(false)} />
            <section className="drill-combobox-mobile-sheet" role="dialog" aria-modal="true" aria-label="Choose a drill">
              <header className="drill-combobox-mobile-header">
                <strong>Choose a drill</strong>
                <button type="button" className="studio-button" onClick={() => setIsOpen(false)}>
                  Done
                </button>
              </header>
              <input
                ref={mobileSearchInputRef}
                type="text"
                className={inputClassName}
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-autocomplete="list"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, Math.max(entries.length - 1, 0)));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const active = entries[activeIndex];
                    if (active) {
                      commitSelection(active.key);
                    }
                  }
                }}
                placeholder="Search drills"
              />
              {listbox}
            </section>
          </div>
        ) : null}
        {isOpen && !isMobileViewport ? listbox : null}
      </div>
    </label>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DrillSourceKind } from "@/lib/drill-source";
import {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  loadAvailableDrillOptions,
  persistSelectedDrillKey,
  resolveSelectedSourceForKey,
  resolveWorkflowDrillKey,
  type AvailableDrillOption
} from "@/lib/workflow/available-drills";

export function useAvailableDrills(input: {
  session: unknown | null;
  isConfigured: boolean;
  requestedDrillKey?: string | null;
  storageKey: string;
  fallbackKey: string;
  defaultSource: DrillSourceKind;
}) {
  const [drillOptions, setDrillOptions] = useState<AvailableDrillOption[]>([]);
  const [selectedDrillKey, setSelectedDrillKey] = useState<string>(input.fallbackKey);
  const [drillOptionsLoading, setDrillOptionsLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<DrillSourceKind>(input.defaultSource);

  const drillOptionGroups = useMemo(() => buildDrillOptionGroups(drillOptions), [drillOptions]);

  const refreshDrillOptions = useCallback(async () => {
    setDrillOptionsLoading(true);
    const options = await loadAvailableDrillOptions({ session: input.session, isConfigured: input.isConfigured });
    setDrillOptions(options);
    setSelectedDrillKey((current) => {
      const resolvedKey = resolveWorkflowDrillKey({
        options,
        requestedDrillKey: input.requestedDrillKey,
        currentKey: current,
        storageKey: input.storageKey,
        fallbackKey: input.fallbackKey
      });
      setSelectedSource((existingSource) =>
        resolveSelectedSourceForKey({
          options,
          selectedKey: resolvedKey,
          fallbackKey: input.fallbackKey,
          defaultSource: existingSource
        })
      );
      return resolvedKey;
    });
    setDrillOptionsLoading(false);
  }, [input.fallbackKey, input.isConfigured, input.requestedDrillKey, input.session, input.storageKey]);

  useEffect(() => {
    void refreshDrillOptions();
  }, [refreshDrillOptions]);

  useEffect(() => {
    persistSelectedDrillKey(input.storageKey, selectedDrillKey);
  }, [input.storageKey, selectedDrillKey]);

  useEffect(() => {
    setSelectedDrillKey((current) =>
      ensureVisibleDrillSelection({
        selectedKey: current,
        selectedSource,
        groupedOptions: drillOptionGroups,
        fallbackKey: input.fallbackKey
      })
    );
  }, [drillOptionGroups, input.fallbackKey, selectedSource]);

  return {
    drillOptions,
    drillOptionGroups,
    drillOptionsLoading,
    selectedDrillKey,
    setSelectedDrillKey,
    selectedSource,
    setSelectedSource,
    refreshDrillOptions
  };
}

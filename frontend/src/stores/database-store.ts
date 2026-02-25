import { create } from 'zustand';

// Types for database integration
export type DatabaseStep = 'connect' | 'select' | 'preview' | 'importing';

export type SSLMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export type DataSelectMode = 'table' | 'query';

export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_mode: SSLMode;
}

export interface TableIdentifier {
  schema_name: string;
  name: string;
}

export interface TableInfo {
  schema_name: string;
  name: string;
  row_count_estimate: number;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
}

export interface ColumnMapping {
  source: string; // DB column
  target: string; // AXIS column (id, query, actual_output, etc.)
}

export interface FilterCondition {
  column: string;
  value: string;
}

export interface FilterConfig {
  column: string;
  label: string;
}

export interface ActiveFilter {
  column: string;
  label: string;
  value: string | null;
  distinctValues: string[];
}

interface DatabaseState {
  // Wizard step
  step: DatabaseStep;

  // Connection state
  handle: string | null;
  connectionVersion: string | null;

  // Tables state
  tables: TableInfo[];
  selectedTable: TableIdentifier | null;
  tableSearchQuery: string;

  // Data selection mode
  dataSelectMode: DataSelectMode;
  sqlQuery: string;

  // Config from defaults (YAML)
  configuredTables: string[];
  configuredFilters: FilterConfig[];
  configuredColumnRenameMap: Record<string, string>;
  configuredQuery: string | null;

  // Active filters (populated from configuredFilters + distinct values)
  activeFilters: ActiveFilter[];

  // Preview state
  previewData: Record<string, unknown>[];
  dedupeOnId: boolean;
  rowLimit: number;

  // Loading/error state
  isLoading: boolean;
  error: string | null;

  // Actions
  setStep: (step: DatabaseStep) => void;
  setHandle: (handle: string | null, version?: string | null) => void;
  setTables: (tables: TableInfo[]) => void;
  setSelectedTable: (table: TableIdentifier | null) => void;
  setTableSearchQuery: (query: string) => void;
  setDataSelectMode: (mode: DataSelectMode) => void;
  setSqlQuery: (query: string) => void;
  setConfigFromDefaults: (config: {
    tables: string[];
    filters: FilterConfig[];
    column_rename_map: Record<string, string>;
    query: string | null;
  }) => void;
  initializeFilters: (configs: FilterConfig[]) => void;
  setFilterValue: (column: string, value: string | null) => void;
  setFilterDistinctValues: (column: string, values: string[]) => void;
  setPreviewData: (data: Record<string, unknown>[]) => void;
  setDedupeOnId: (dedupe: boolean) => void;
  setRowLimit: (limit: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  goBack: () => void;
}

const initialState = {
  step: 'connect' as DatabaseStep,
  handle: null as string | null,
  connectionVersion: null as string | null,
  tables: [] as TableInfo[],
  selectedTable: null as TableIdentifier | null,
  tableSearchQuery: '',
  dataSelectMode: 'table' as DataSelectMode,
  sqlQuery: '',
  configuredTables: [] as string[],
  configuredFilters: [] as FilterConfig[],
  configuredColumnRenameMap: {} as Record<string, string>,
  configuredQuery: null as string | null,
  activeFilters: [] as ActiveFilter[],
  previewData: [] as Record<string, unknown>[],
  dedupeOnId: true,
  rowLimit: 10000,
  isLoading: false,
  error: null as string | null,
};

export const useDatabaseStore = create<DatabaseState>()((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step, error: null }),

  setHandle: (handle, version = null) =>
    set({
      handle,
      connectionVersion: version,
      step: handle ? 'select' : 'connect',
      error: null,
    }),

  setTables: (tables) => set({ tables }),

  setSelectedTable: (selectedTable) =>
    set({
      selectedTable,
      previewData: [],
      activeFilters: get().configuredFilters.map((f) => ({
        column: f.column,
        label: f.label,
        value: null,
        distinctValues: [],
      })),
    }),

  setTableSearchQuery: (tableSearchQuery) => set({ tableSearchQuery }),

  setDataSelectMode: (dataSelectMode) => set({ dataSelectMode }),

  setSqlQuery: (sqlQuery) => set({ sqlQuery }),

  setConfigFromDefaults: (config) => {
    const updates: Partial<DatabaseState> = {
      configuredTables: config.tables,
      configuredFilters: config.filters,
      configuredColumnRenameMap: config.column_rename_map,
      configuredQuery: config.query,
    };
    // If a query is configured, default to SQL mode
    if (config.query) {
      updates.dataSelectMode = 'query';
      updates.sqlQuery = config.query;
    }
    set(updates);
  },

  initializeFilters: (configs) =>
    set({
      activeFilters: configs.map((f) => ({
        column: f.column,
        label: f.label,
        value: null,
        distinctValues: [],
      })),
    }),

  setFilterValue: (column, value) =>
    set((state) => ({
      activeFilters: state.activeFilters.map((f) => (f.column === column ? { ...f, value } : f)),
    })),

  setFilterDistinctValues: (column, values) =>
    set((state) => ({
      activeFilters: state.activeFilters.map((f) =>
        f.column === column ? { ...f, distinctValues: values } : f
      ),
    })),

  setPreviewData: (previewData) => set({ previewData }),

  setDedupeOnId: (dedupeOnId) => set({ dedupeOnId }),

  setRowLimit: (rowLimit) => set({ rowLimit }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  reset: () => set(initialState),

  goBack: () => {
    const { step } = get();
    switch (step) {
      case 'select':
        set({ step: 'connect', handle: null, connectionVersion: null });
        break;
      case 'preview':
        set({ step: 'select', previewData: [] });
        break;
      case 'importing':
        // Can't go back during import
        break;
      default:
        break;
    }
  },
}));

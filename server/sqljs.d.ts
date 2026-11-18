declare module 'sql.js/dist/sql-wasm-inline.js' {
  const initSqlJs: (config?: Record<string, unknown>) => Promise<unknown>;
  export default initSqlJs;
}

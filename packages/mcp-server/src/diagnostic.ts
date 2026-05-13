/**
 * StartupDiagnostic carries a non-fatal startup failure into the running
 * MCP server. The server stays alive (so the MCP client sees a healthy
 * stdio process) and exposes `nomos_status` + `broker_unavailable`
 * placeholder tools instead of dying — keeping the broker as the
 * advertised authority even when the control plane is unreachable.
 */
export type DiagnosticPhase = 'config' | 'fetch_tools' | 'no_integrations';

export interface StartupDiagnostic {
  phase: DiagnosticPhase;
  message: string;
  hint: string;
}

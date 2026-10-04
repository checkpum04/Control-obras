import { Component, type ReactNode } from 'react';

/** Si una pantalla falla, se muestra un aviso con salida en vez de una pantalla en blanco. Los datos no se tocan. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error) {
    try { localStorage.setItem('obra.lastError', `${new Date().toISOString()} ${error.message}`); } catch { /* nada */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="empty">
          <p className="empty-title">Algo ha fallado en esta pantalla</p>
          <p>Tus datos están a salvo. Vuelve al inicio o recarga la app.</p>
          <p className="muted small">{this.state.error.message}</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => { location.hash = '#/'; this.setState({ error: null }); }}>Ir al inicio</button>
            <button className="btn btn-ghost" onClick={() => location.reload()}>Recargar</button>
          </div>
        </div>
      </div>
    );
  }
}

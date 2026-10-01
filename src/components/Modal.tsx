import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export const FeedbackContext = createContext<string | null>(null);
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close?: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const error = useContext(FeedbackContext);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => { if (d.open) d.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { if (!close) e.preventDefault(); else close(); }} onClick={e => { if (e.target === ref.current && close) close(); }} aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2>{close && <button className="icon-button" title="Close" aria-label="Close" onClick={close}><X size={20} /></button>}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {children}
  </dialog>;
}

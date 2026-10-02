import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Field form dengan label, petunjuk, dan pesan error inline yang terhubung ke input (aria-describedby). */
export function Field({ id, label, error, hint, required, className, children }: {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden>*</span>}
      </Label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

/** Atribut aksesibilitas untuk input di dalam Field. */
export const fieldProps = (id: string, error?: string, hint?: boolean) => ({
  id,
  name: id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

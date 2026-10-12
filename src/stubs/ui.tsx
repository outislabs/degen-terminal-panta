// stub: lives in private Degen Terminal codebase
// The real app uses shadcn/ui components and a clsx + tailwind-merge `cn`.
import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({ variant: _v, size: _s, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline"; size?: "sm" | "default" }) {
  return <button {...p} />;
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} />;
}

export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} />;
}

export function Checkbox({ checked, onCheckedChange, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; className?: string }) {
  return <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} className={className} />;
}

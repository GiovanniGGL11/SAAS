'use client';

import { PlusIcon, XIcon } from 'lucide-react';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';

/** Outros serviços no mesmo atendimento (corte + barba), feitos em seguida ao primeiro. */
export function ExtraServicesField({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: ComboboxOption[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((serviceId, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="text-label-secondary w-4 text-center text-[13px]">+</span>
          <div className="min-w-0 flex-1">
            <Combobox
              options={options}
              value={serviceId}
              onChange={(next) => onChange(value.map((v, i) => (i === index ? next : v)))}
              placeholder="Selecionar serviço"
              searchPlaceholder="Buscar serviço..."
            />
          </div>
          <button
            type="button"
            aria-label="Remover serviço"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="text-label-secondary hover:text-foreground rounded-full p-1"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ))}
      {value.length < 5 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...value, ''])}
          className="text-system-blue flex items-center gap-1 self-start text-[13px] font-medium hover:underline disabled:opacity-40"
        >
          <PlusIcon className="size-3.5" />
          Adicionar outro serviço
        </button>
      )}
    </div>
  );
}

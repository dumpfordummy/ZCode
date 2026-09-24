import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";

export function GraphSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className="block space-y-1 text-ui-sm text-foreground-subtle">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} data-testid={testId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} data-value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

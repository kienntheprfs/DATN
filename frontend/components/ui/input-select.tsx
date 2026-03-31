"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputSelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function InputSelect({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  icon,
  children,
  className,
  disabled,
}: InputSelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");

  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const handleValueChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  const currentValue = value ?? internalValue;

  const getDisplayText = () => {
    if (!currentValue) return null;
    
    const childrenArray = React.Children.toArray(children);
    const selectedItem = childrenArray.find((child) => {
      if (React.isValidElement(child) && child.props.value === currentValue) {
        return true;
      }
      return false;
    });
    
    if (React.isValidElement(selectedItem)) {
      return selectedItem.props.children;
    }
    return currentValue;
  };

  const displayText = getDisplayText();

  return (
    <div className={cn(
      "relative flex h-9 w-full items-center rounded-lg border border-input bg-transparent text-sm transition-colors",
      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "has-data-[slot=select-trigger]:rounded-none has-data-[slot=select-trigger]:border-0 has-data-[slot=select-trigger]:ring-0 has-data-[slot=select-trigger]:focus-within:ring-0",
      className
    )}>
      {icon && (
        <div className="flex items-center justify-center pl-3 text-muted-foreground">
          {icon}
        </div>
      )}
      <SelectPrimitive.Root 
        value={currentValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger 
          data-slot="select-trigger"
          className={cn(
            "flex-1 h-full border-0 bg-transparent pl-3 pr-8 py-2 text-sm outline-none focus:ring-0",
            !icon && "pl-3"
          )}
        >
          {currentValue ? (
            <span className="text-foreground">{displayText}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Icon asChild className="absolute right-2 top-1/2 -translate-y-1/2">
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground pointer-events-none" />
        </SelectPrimitive.Icon>
        <SelectPrimitive.Content>
          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Root>
    </div>
  );
}

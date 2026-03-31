"use client";

import * as React from "react";
import { Tabs as UITabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface VerticalTabsProps {
  defaultValue?: string;
  className?: string;
  children: React.ReactNode;
}

export function VerticalTabs({ defaultValue, className, children }: VerticalTabsProps) {
  return (
    <UITabs 
      orientation="vertical" 
      defaultValue={defaultValue}
      className={cn("flex flex-col xl:flex-row gap-6 w-full", className)}
    >
      {children}
    </UITabs>
  );
}

interface VerticalTabsListProps {
  className?: string;
  children: React.ReactNode;
}

export function VerticalTabsList({ className, children }: VerticalTabsListProps) {
  return (
    <TabsList className={cn(
      "inline-flex lg:flex-col gap-1 p-1 bg-muted/50 rounded-xl border border-border/50 w-fit lg:w-auto",
      className
    )}>
      {children}
    </TabsList>
  );
}

interface VerticalTabsTriggerProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export function VerticalTabsTrigger({ value, className, children }: VerticalTabsTriggerProps) {
  return (
    <TabsTrigger 
      value={value} 
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium w-full lg:w-auto",
        "data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:font-semibold",
        className
      )}
    >
      {children}
    </TabsTrigger>
  );
}

export { TabsContent };

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
      className={cn("flex flex-col xl:flex-row gap-3 w-full", className)}
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
      "inline-flex lg:flex-col gap-1 p-1 bg-muted rounded-lg w-fit lg:w-48 shrink-0",
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
        "relative inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium w-full lg:w-auto text-muted-foreground",
        "hover:bg-muted hover:text-foreground",
        "data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm",
        className
      )}
    >
      {children}
    </TabsTrigger>
  );
}

export { TabsContent };

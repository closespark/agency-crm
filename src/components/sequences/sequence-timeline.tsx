"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SequenceStep {
  stepNumber: number;
  channel: "email" | "linkedin" | "call";
  delayDays: number;
  // New-style strategy fields (copy generated at enrollment time)
  angle?: string;
  goal?: string;
  objectionToAddress?: string;
  tone?: string;
  // Legacy fields (pre-written copy)
  subject?: string;
  body?: string;
  notes?: string;
}

interface SequenceTimelineProps {
  steps: SequenceStep[];
  currentStep?: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

const channelConfig: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  email: {
    icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
    label: "Email",
    color: "text-blue-600",
  },
  linkedin: {
    icon: "M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z",
    label: "LinkedIn",
    color: "text-sky-700",
  },
  call: {
    icon: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z",
    label: "Call",
    color: "text-green-600",
  },
};

function ChannelIcon({
  channel,
  className,
}: {
  channel: string;
  className?: string;
}) {
  const config = channelConfig[channel] || channelConfig.email;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={cn("h-5 w-5", config.color, className)}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
    </svg>
  );
}

function truncateBody(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function SequenceTimeline({
  steps,
  currentStep,
  onStepClick,
  className,
}: SequenceTimelineProps) {
  return (
    <div className={cn("relative", className)}>
      {steps.map((step, index) => {
        const config = channelConfig[step.channel] || channelConfig.email;
        const isActive = currentStep !== undefined && currentStep === index;
        const isCompleted = currentStep !== undefined && currentStep > index;

        return (
          <div key={index} className="relative flex gap-4">
            {/* Vertical line */}
            {index < steps.length - 1 && (
              <div className="absolute left-[19px] top-10 h-full w-0.5 bg-zinc-200 dark:bg-zinc-700" />
            )}

            {/* Step circle */}
            <div className="relative z-10 flex-shrink-0">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2",
                  isActive
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                    : isCompleted
                      ? "border-green-500 bg-green-50 dark:bg-green-950"
                      : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
                )}
              >
                <ChannelIcon channel={step.channel} />
              </div>
            </div>

            {/* Step content */}
            <div
              className={cn(
                "mb-6 flex-1 rounded-lg border p-4 transition-colors",
                isActive
                  ? "border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                onStepClick && "cursor-pointer hover:border-blue-300 dark:hover:border-blue-700"
              )}
              onClick={() => onStepClick?.(index)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Step {step.stepNumber}
                </span>
                <Badge variant="secondary">{config.label}</Badge>
                {step.delayDays > 0 && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Wait {step.delayDays} day{step.delayDays !== 1 ? "s" : ""}
                  </span>
                )}
                {isActive && <Badge variant="default">Current</Badge>}
                {isCompleted && <Badge variant="success">Done</Badge>}
              </div>

              {/* New-style strategy steps */}
              {step.angle ? (
                <>
                  <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {step.angle}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Goal: {step.goal}
                  </p>
                  {step.objectionToAddress && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      Objection: {step.objectionToAddress}
                    </p>
                  )}
                  {step.tone && (
                    <p className="mt-1 text-xs italic text-zinc-400 dark:text-zinc-500">
                      Tone: {step.tone}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                    Copy generated per-contact at enrollment time using full intelligence
                  </p>
                </>
              ) : (
                <>
                  {/* Legacy pre-written steps */}
                  {step.subject && (
                    <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {step.subject}
                    </p>
                  )}
                  {step.body && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {truncateBody(step.body)}
                    </p>
                  )}
                  {step.notes && (
                    <p className="mt-2 text-xs italic text-zinc-400 dark:text-zinc-500">
                      Note: {step.notes}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <Reveal className={cn(align === "center" && "text-center")}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && (
        <p className={cn("mt-4 max-w-2xl text-base leading-relaxed text-muted", align === "center" && "mx-auto")}>
          {description}
        </p>
      )}
    </Reveal>
  );
}

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:py-24", className)}>
      {children}
    </section>
  );
}

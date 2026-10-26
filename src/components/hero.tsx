import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { DecorIcon } from "@/components/decor-icon";
import { FullWidthDivider } from "@/components/full-width-divider";
import { ArrowRightIcon, LogInIcon } from "lucide-react";
import { appHref } from "@/platform/brand";
import { PlanPreview } from "@/platform/pages/PlanPreview";

/** Logos posés autour du titre, en chips. `invert` pour les marques noires sur fond sombre. */
const PARTNERS = [
	{ name: "Claude", src: "/partners/claude.png", invert: false, className: "lg:-left-44 lg:top-0 lg:-rotate-6" },
	{ name: "OpenAI", src: "/partners/openai.png", invert: true, className: "lg:-right-44 lg:-top-2 lg:rotate-6" },
	{ name: "COROS", src: "/partners/coros.png", invert: false, className: "lg:-left-36 lg:bottom-4 lg:rotate-3" },
	{ name: "Garmin", src: "/partners/garmin.png", invert: true, className: "lg:-right-36 lg:bottom-6 lg:-rotate-3" },
];

function PartnerChip({ name, src, invert, className }: (typeof PARTNERS)[number]) {
	return (
		<span
			className={cn(
				"flex items-center gap-2 rounded-full border bg-card/80 py-1.5 pr-3.5 pl-1.5 shadow-sm backdrop-blur-sm",
				"lg:absolute",
				className
			)}
		>
			<span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-background">
				<img
					alt=""
					className={cn("size-full object-contain", invert && "p-1 invert", name === "COROS" && "scale-110")}
					src={src}
				/>
			</span>
			<span className="font-medium text-sm">{name}</span>
		</span>
	);
}

export function HeroSection() {
	return (
		<section>
			<div className="relative flex flex-col items-center justify-center gap-5 px-4 py-12 md:px-4 md:py-24 lg:py-28">
				{/* X Faded Borders & Shades */}
				<div
					aria-hidden="true"
					className="absolute inset-0 -z-1 size-full overflow-hidden"
				>
					<div
						className={cn(
							"absolute -inset-x-20 inset-y-0 z-0 rounded-full",
							"bg-[radial-gradient(ellipse_at_center,theme(--color-foreground/.1),transparent,transparent)]",
							"blur-[50px]"
						)}
					/>
					<div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
					<div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
					<div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
					<div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
				</div>
				<a
					className={cn(
						"group mx-auto flex w-fit items-center gap-3 rounded-sm border bg-card p-1 shadow",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out"
					)}
					href={appHref("/onboarding")}
				>
					<div className="rounded-xs border bg-card px-1.5 py-0.5 shadow-sm">
						<p className="font-mono text-xs">BETA</p>
					</div>

					<span className="text-xs">free training plans during the beta</span>
					<span className="block h-5 border-l" />

					<div className="pr-1">
						<ArrowRightIcon className="size-3 -translate-x-0.5 duration-150 ease-out group-hover:translate-x-0.5" />
					</div>
				</a>

				<div className="relative flex flex-col items-center gap-5">
					<h1
						className={cn(
							"font-heading max-w-3xl text-balance text-center font-semibold text-4xl text-foreground tracking-tight md:text-6xl lg:text-7xl",
							"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out"
						)}
					>
						Forget generic running plans, it’s time for <span className="italic">Agentic running</span>
					</h1>
					<div
						className={cn(
							"flex flex-wrap justify-center gap-2 lg:contents",
							"fade-in animate-in fill-mode-backwards delay-300 duration-700"
						)}
						aria-label="Works with"
					>
						{PARTNERS.map((p) => (
							<PartnerChip key={p.name} {...p} />
						))}
					</div>
				</div>

				<p
					className={cn(
						"max-w-xl text-center text-muted-foreground text-sm tracking-wide sm:text-lg",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out"
					)}
				>
					AI agents read your watch, build your plan around your real paces, push every session to your wrist and
					rewrite the next week from how you actually felt.
				</p>

				<div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
					<Button asChild variant="outline">
						<a href={appHref("/connexion")}>
							<LogInIcon data-icon="inline-start" /> Sign in
						</a>
					</Button>
					<Button asChild>
						<a href={appHref("/onboarding")}>
							Build my plan <ArrowRightIcon data-icon="inline-end" />
						</a>
					</Button>
				</div>
			</div>
			<div className="relative">
				<DecorIcon className="size-4" position="top-left" />
				<DecorIcon className="size-4" position="top-right" />
				<DecorIcon className="size-4" position="bottom-left" />
				<DecorIcon className="size-4" position="bottom-right" />

				<FullWidthDivider className="-top-px" />
				<PlanPreview />
				<FullWidthDivider className="-bottom-px" />
			</div>
		</section>
	);
}

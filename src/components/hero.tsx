import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { DecorIcon } from "@/components/decor-icon";
import { FullWidthDivider } from "@/components/full-width-divider";
import { ArrowRightIcon, LogInIcon } from "lucide-react";
import { appHref } from "@/platform/brand";
import { PlanPreview } from "@/platform/pages/PlanPreview";

/** Logos intégrés au titre : les montres à côté de « running plans », les IA à côté de « Agentic running ». */
const LOGOS = {
	claude: { name: "Claude", src: "/partners/claude.png", invert: false },
	chatgpt: { name: "ChatGPT", src: "/partners/openai.png", invert: true },
	coros: { name: "COROS", src: "/partners/coros.png", invert: false },
	garmin: { name: "Garmin", src: "/partners/garmin.png", invert: true },
};

/** Pastille de logo à la taille du texte du titre, légèrement inclinée. */
function InlineLogo({ logo, tilt }: { logo: (typeof LOGOS)[keyof typeof LOGOS]; tilt: string }) {
	return (
		<span
			className={cn(
				"mx-[0.06em] inline-flex size-[0.82em] translate-y-[0.08em] items-center justify-center overflow-hidden rounded-[0.22em] border bg-card align-baseline shadow-sm",
				tilt
			)}
			title={logo.name}
		>
			<img alt={logo.name} className={cn("size-full object-contain", logo.invert && "p-[0.12em] invert")} src={logo.src} />
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
						<p className="text-xs">BETA</p>
					</div>

					<span className="text-xs">free training plans during the beta</span>
					<span className="block h-5 border-l" />

					<div className="pr-1">
						<ArrowRightIcon className="size-3 -translate-x-0.5 duration-150 ease-out group-hover:translate-x-0.5" />
					</div>
				</a>

				<h1
					className={cn(
						"font-heading max-w-4xl text-balance text-center font-semibold text-4xl text-foreground tracking-tight md:text-6xl lg:text-7xl",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out"
					)}
				>
					Forget generic running plans{" "}
					<span className="whitespace-nowrap">
						<InlineLogo logo={LOGOS.coros} tilt="-rotate-6" />
						<InlineLogo logo={LOGOS.garmin} tilt="rotate-3" />
					</span>
					, it’s time for Agentic running{" "}
					<span className="whitespace-nowrap">
						<InlineLogo logo={LOGOS.claude} tilt="rotate-6" />
						<InlineLogo logo={LOGOS.chatgpt} tilt="-rotate-3" />
					</span>
				</h1>

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

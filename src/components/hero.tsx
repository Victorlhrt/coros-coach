import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import { appHref } from "@/platform/brand";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Logos qui défilent dans le titre : les IA qui écrivent le plan, les montres qui le portent. */
const LOGOS = [
	{ name: "Claude", src: "/partners/claude.png", invert: false },
	{ name: "ChatGPT", src: "/partners/openai.png", invert: true },
	{ name: "COROS", src: "/partners/coros.png", invert: false },
	{ name: "Garmin", src: "/partners/garmin.png", invert: true },
];

/** Une pastille à la taille du texte qui pivote d'un logo à l'autre (immobile si l'animation est réduite). */
function RotatingLogo() {
	const reduce = useReducedMotion();
	const [index, setIndex] = useState(0);
	useEffect(() => {
		if (reduce) return;
		const t = window.setInterval(() => setIndex((i) => (i + 1) % LOGOS.length), 1800);
		return () => window.clearInterval(t);
	}, [reduce]);
	const logo = LOGOS[index];
	return (
		<span
			aria-label={LOGOS.map((l) => l.name).join(", ")}
			className="relative mx-[0.08em] inline-flex size-[0.9em] translate-y-[0.1em] [perspective:400px]"
			role="img"
		>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.span
					animate={{ rotateY: 0, opacity: 1, scale: 1 }}
					className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[0.24em] border bg-card shadow-lg"
					exit={{ rotateY: -90, opacity: 0, scale: 0.9 }}
					initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
					key={logo.name}
					transition={{ type: "spring", visualDuration: 0.5, bounce: 0.2 }}
				>
					<img alt="" className={cn("size-full object-contain", logo.invert && "p-[0.14em] invert")} src={logo.src} />
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

/** Deux poses d'un coureur (repère 24), alternées quand il court. */
const RUNNER_POSES = [
	"M14 4.5a2 2 0 1 0 0-.01M13 7.5l-2 6M12.6 9 9 10.5 8 8.5M12.6 9l2.6 2.4 2-1M11 13.5l3 3-1 4M11 13.5l-3 2.5-3-1",
	"M14 4.5a2 2 0 1 0 0-.01M13 7.5l-2 6M12.6 9l-2.6 2.6 1 2M12.6 9l3-.6 1.4-2M11 13.5l1.4 4 3 1.5M11 13.5l-2 4v4",
];

/**
 * Bouton principal du hero : « Build my plan » avec un petit coureur. Il trottine au survol ; au clic,
 * il sprinte hors du bouton en laissant des traînées, le bouton se remplit, puis l'onboarding s'ouvre.
 */
function RunCta({ href }: { href: string }) {
	const reduce = useReducedMotion();
	const [hover, setHover] = useState(false);
	const [launch, setLaunch] = useState(false);
	const [pose, setPose] = useState(0);
	const running = hover || launch;

	useEffect(() => {
		if (!running || reduce) return;
		const t = window.setInterval(() => setPose((p) => 1 - p), launch ? 70 : 140);
		return () => window.clearInterval(t);
	}, [running, launch, reduce]);

	return (
		<a
			className="group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-full bg-primary pr-4 pl-6 font-medium text-base text-primary-foreground shadow-lg outline-none ring-ring/50 focus-visible:ring-[3px]"
			href={href}
			onClick={(e) => {
				if (reduce || launch) return;
				e.preventDefault();
				setLaunch(true);
				window.setTimeout(() => window.location.assign(href), 750);
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			{/* Remplissage qui balaie le bouton au départ */}
			<motion.span
				aria-hidden="true"
				animate={{ scaleX: launch ? 1 : 0 }}
				className="absolute inset-0 origin-left bg-black/10"
				initial={false}
				transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
			/>
			<motion.span animate={{ x: launch ? -6 : 0, opacity: launch ? 0.6 : 1 }} className="relative" transition={{ duration: 0.3 }}>
				{launch ? "Let’s go" : "Build my plan"}
			</motion.span>
			<span className="relative flex size-8 items-center justify-center">
				{/* Traînées de vitesse derrière le coureur */}
				{[0, 1, 2].map((i) => (
					<motion.span
						key={i}
						aria-hidden="true"
						animate={running ? { scaleX: [0, 1, 0], opacity: [0, 0.8, 0] } : { scaleX: 0, opacity: 0 }}
						className="absolute right-[22px] h-[2px] w-2.5 origin-right rounded-full bg-primary-foreground"
						style={{ top: 10 + i * 5 }}
						transition={{ duration: launch ? 0.35 : 0.6, repeat: running ? Infinity : 0, delay: i * 0.08 }}
					/>
				))}
				<motion.svg
					animate={launch ? { x: 70, opacity: 0 } : { x: 0, opacity: 1, y: hover ? [0, -1.5, 0] : 0 }}
					aria-hidden="true"
					className="size-6"
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2.2"
					transition={launch ? { duration: 0.55, ease: [0.55, 0, 1, 0.45] } : { y: { duration: 0.28, repeat: hover ? Infinity : 0 } }}
					viewBox="0 0 24 24"
				>
					<path d={RUNNER_POSES[running ? pose : 0]} />
				</motion.svg>
			</span>
		</a>
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
						"font-heading max-w-5xl text-balance text-center font-semibold text-4xl text-foreground tracking-tight md:text-5xl lg:text-6xl",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out"
					)}
				>
					Forget generic running plans, it’s time for <span className="whitespace-nowrap">Agentic running <RotatingLogo /></span>
				</h1>

				<p
					className={cn(
						"max-w-3xl text-center text-muted-foreground text-sm tracking-wide sm:text-lg",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out"
					)}
				>
					AI agents read your watch, build your plan around your real paces, push every session to your wrist and
					rewrite the next week from how you actually felt.
				</p>

				<div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
					<RunCta href={appHref("/onboarding")} />
				</div>
			</div>
		</section>
	);
}

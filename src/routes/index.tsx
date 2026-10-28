import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Fingerprint, KeyRound } from "lucide-react";
import { z } from "zod";
import { DemoControls } from "#/components/home/demo-controls";
import { Button } from "#/components/ui/button";
import { useTRPC } from "#/integrations/trpc/react";
import { sessionDateSchema, todaySessionDate } from "#/lib/date";
import { DEFAULT_ROOM, parseRoom, roomCodeSchema } from "#/lib/room";

const homeSearchSchema = z.object({
	room: roomCodeSchema.optional().catch(undefined),
	date: sessionDateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/")({
	validateSearch: homeSearchSchema,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			context.trpc.attendance.demoCatalog.queryOptions(),
		);
	},
	component: Home,
});

function Home() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const trpc = useTRPC();
	const { data: catalogRooms } = useSuspenseQuery(
		trpc.attendance.demoCatalog.queryOptions(),
	);

	const todayDate = todaySessionDate();
	const room = search.room ?? DEFAULT_ROOM;
	const date = search.date ?? todayDate;
	const isCustomDate = date !== todayDate;
	const isCustomized = room !== DEFAULT_ROOM || isCustomDate;

	const { label, building, floor, room: roomNumber } = parseRoom(room);

	const updateSelection = (nextRoom: string, nextDate: string) => {
		const normalizedRoom = nextRoom.toLowerCase();
		void navigate({
			to: "/",
			search: {
				room: normalizedRoom !== DEFAULT_ROOM ? normalizedRoom : undefined,
				date: nextDate !== todayDate ? nextDate : undefined,
			},
			replace: true,
		});
	};

	return (
		<div className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-x-hidden py-8">
			<AmbientBackground />

			<main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 text-center">
				<div className="mb-3 animate-fade-down motion-reduce:animate-none">
					<div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-surface-container-high/60 px-3.5 py-1.5 shadow-sm backdrop-blur-md">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
							<span className="relative inline-flex size-2 rounded-full bg-primary" />
						</span>
						<span className="font-mono font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
							{isCustomized
								? "Demo Session Selected"
								: "Active Physical Location"}
						</span>
					</div>
				</div>

				<div className="relative my-1 animate-zoom-glow select-none [animation-delay:150ms] motion-reduce:animate-none">
					<div className="animate-float-gentle motion-reduce:animate-none">
						<div
							aria-hidden
							className="-z-10 pointer-events-none absolute inset-0 scale-110 bg-linear-to-r from-primary via-primary-container to-[#006591] opacity-25 blur-3xl"
						/>
						<h1 className="font-display font-extrabold text-[clamp(4.5rem,17vw,10.5rem)] text-foreground leading-[0.95] tracking-tight drop-shadow-[0_4px_24px_rgba(11,28,48,0.06)]">
							{label}
						</h1>
					</div>
				</div>

				<p className="mt-2 mb-6 animate-fade-up font-mono font-semibold text-[13px] text-foreground tracking-wide [animation-delay:300ms] motion-reduce:animate-none">
					Building {building} · Floor {floor} · Room {roomNumber}
				</p>

				<DemoControls
					rooms={catalogRooms}
					selectedRoom={room}
					selectedDate={date}
					todayDate={todayDate}
					onSelectRoom={(nextRoom) => updateSelection(nextRoom, date)}
					onSelectDate={(nextDate) => updateSelection(room, nextDate)}
					onReset={() => updateSelection(DEFAULT_ROOM, todayDate)}
				/>

				<div className="flex w-full max-w-md animate-fade-up flex-col items-center gap-3 px-4 [animation-delay:450ms] motion-reduce:animate-none">
					<Button
						asChild
						className="btn-shimmer group h-auto w-full animate-glow-pulse gap-3.5 rounded-xl border border-white/20 bg-linear-to-r from-primary-container via-[#4338ca] to-primary px-8 py-4 text-white shadow-lg shadow-primary-container/25 transition-all duration-300 hover:from-primary hover:to-[#312e81] hover:shadow-primary/35 hover:shadow-xl active:scale-[0.98] motion-reduce:animate-none"
					>
						<Link
							to="/attendance/$roomId"
							params={{ roomId: room }}
							search={{ date: isCustomDate ? date : undefined }}
						>
							<span className="flex items-center justify-center rounded-lg bg-white/15 p-1.5 transition-all duration-200 group-hover:scale-105 group-hover:bg-white/25">
								<Fingerprint className="size-6" />
							</span>
							<span className="font-display font-semibold text-lg">
								Let’s Check In
							</span>
							<ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1.5" />
						</Link>
					</Button>

					<Button
						asChild
						variant="outline"
						className="w-full rounded-xl border-border/60 bg-card/70 py-5 font-medium backdrop-blur-sm hover:bg-card"
					>
						<Link
							to="/register"
							search={{
								room: room !== DEFAULT_ROOM ? room : undefined,
								date: isCustomDate ? date : undefined,
								from: isCustomized ? "home" : undefined,
							}}
						>
							<KeyRound className="size-4 text-primary" />
							Register Student Passkey
						</Link>
					</Button>
				</div>
			</main>
		</div>
	);
}

function AmbientBackground() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
		>
			<div className="architectural-grid absolute inset-0 opacity-75" />
			<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/4 left-1/2">
				<div className="size-155 animate-orb-1 rounded-full bg-linear-to-tr from-[#4f46e5]/20 via-[#3525cd]/12 to-transparent blur-[120px] motion-reduce:animate-none" />
			</div>
			<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/3">
				<div className="size-155 animate-orb-2 rounded-full bg-linear-to-tr from-[#39b8fd]/15 via-[#006591]/10 to-transparent blur-[130px] motion-reduce:animate-none" />
			</div>
			<div className="absolute right-1/4 bottom-1/4">
				<div className="size-155 animate-orb-3 rounded-full bg-linear-to-tr from-[#7c3aed]/14 via-[#4d44e3]/10 to-transparent blur-[140px] motion-reduce:animate-none" />
			</div>
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--background)_100%)] opacity-60" />
		</div>
	);
}

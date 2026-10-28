import { Link } from "@tanstack/react-router";
import { Fingerprint, KeyRound } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import type { PendingStudent } from "#/hooks/use-passkey-check-in";
import { cn } from "#/lib/utils";

export function StudentCard({
	student,
	room,
	date,
	leaving,
	onCheckIn,
}: {
	student: PendingStudent;
	room: string;
	date?: string;
	/** Plays the exit animation once the student has checked in. */
	leaving?: boolean;
	onCheckIn: (student: PendingStudent) => void;
}) {
	return (
		<Card
			className={cn(
				"group gap-0 overflow-hidden rounded-lg py-0 shadow-none transition-all duration-200 hover:shadow-md",
				"fade-in-0 slide-in-from-bottom-2 animate-in duration-300",
				leaving &&
					"zoom-out-95 fade-out-0 pointer-events-none animate-out fill-mode-forwards",
			)}
		>
			<div className="relative aspect-4/3 overflow-hidden border-b bg-secondary">
				{student.photoUrl ? (
					<img
						src={student.photoUrl}
						alt={student.name}
						width={480}
						height={360}
						loading="lazy"
						className={cn(
							"size-full object-cover object-[center_30%] transition-transform duration-300 group-hover:scale-105",
							!student.isRegistered && "opacity-85",
						)}
					/>
				) : (
					<div className="flex size-full items-center justify-center font-display font-bold text-5xl text-primary/40">
						{initials(student.name)}
					</div>
				)}
				{student.isRegistered ? (
					<Badge className="absolute top-2.5 left-2.5 gap-1.5 rounded border-0 bg-amber-500/90 font-mono font-semibold text-[10px] text-white uppercase backdrop-blur-sm">
						<span className="size-1.5 rounded-full bg-white" />
						Awaiting
					</Badge>
				) : (
					<Badge
						variant="secondary"
						className="absolute top-2.5 left-2.5 gap-1.5 rounded border border-border/60 bg-background/85 font-mono font-semibold text-[10px] text-muted-foreground uppercase backdrop-blur-sm"
					>
						<span className="size-1.5 rounded-full bg-muted-foreground/70" />
						No Passkey
					</Badge>
				)}
			</div>

			<div className="flex flex-1 flex-col gap-3 p-4">
				<div className="min-w-0">
					<h3 className="truncate font-semibold text-base leading-snug transition-colors group-hover:text-primary">
						{student.name}
					</h3>
					{student.department && (
						<p className="mt-0.5 truncate text-muted-foreground text-xs">
							{student.department}
						</p>
					)}
				</div>

				<div className="flex items-center justify-between border-border/60 border-t pt-2.5 font-mono text-[11px]">
					<span className="text-muted-foreground uppercase tracking-wider">
						Student ID
					</span>
					<span className="font-medium text-foreground">
						{student.studentId}
					</span>
				</div>

				{student.isRegistered ? (
					<Button
						type="button"
						onClick={() => onCheckIn(student)}
						className="mt-auto w-full font-semibold shadow-sm active:scale-[0.98]"
					>
						<Fingerprint />
						Check In
					</Button>
				) : (
					<Button
						asChild
						variant="outline"
						className="mt-auto w-full font-semibold active:scale-[0.98]"
					>
						<Link to="/register" search={{ q: student.studentId, room, date }}>
							<KeyRound className="size-4 text-primary" />
							Register Passkey
						</Link>
					</Button>
				)}
			</div>
		</Card>
	);
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

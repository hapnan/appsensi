import { DoorOpen, Fingerprint, ShieldCheck } from "lucide-react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import type { CheckInMode, PendingStudent } from "#/hooks/use-passkey-check-in";

export type CheckInPhase = "confirm" | "verifying";

export function CheckInDialog({
	open,
	phase,
	mode,
	student,
	roomLabel,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	phase: CheckInPhase;
	mode: CheckInMode | null;
	student: PendingStudent | null;
	roomLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const verifying = phase === "verifying";

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				// The dialog can't be dismissed while the passkey ceremony runs.
				if (!next && !verifying) onCancel();
			}}
		>
			<AlertDialogContent className="gap-5 sm:max-w-120">
				{verifying ? (
					<VerifyingStep mode={mode} studentName={student?.name ?? ""} />
				) : (
					<>
						<AlertDialogHeader className="flex flex-row items-center gap-3 text-left">
							<div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted text-primary">
								<Fingerprint className="size-7" />
							</div>
							<div className="grid gap-0.5">
								<AlertDialogTitle className="font-bold font-display">
									Confirm check-in
								</AlertDialogTitle>
								<AlertDialogDescription className="text-xs">
									You'll be asked to verify with your passkey.
								</AlertDialogDescription>
							</div>
						</AlertDialogHeader>

						<div className="space-y-2 rounded-md border bg-background p-3.5">
							<p className="text-foreground text-xs">
								Record attendance for this session:
							</p>
							<p className="flex items-center gap-1.5 font-display font-semibold text-base text-primary">
								<DoorOpen className="size-4" />
								Room {roomLabel}
							</p>
							<div className="flex items-center justify-between gap-3 border-t pt-2 text-muted-foreground text-xs">
								<span className="flex min-w-0 items-center gap-2">
									{student?.photoUrl && (
										<img
											src={student.photoUrl}
											alt=""
											className="size-6 rounded-full object-cover"
										/>
									)}
									<span className="truncate">
										Student: <strong>{student?.name}</strong>
									</span>
								</span>
								<span className="shrink-0 font-mono text-[11px] text-outline">
									{student?.studentId}
								</span>
							</div>
						</div>

						<AlertDialogFooter className="border-t pt-4">
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<Button
								type="button"
								onClick={onConfirm}
								className="font-bold active:scale-[0.98]"
							>
								<ShieldCheck />
								Confirm &amp; Check In
							</Button>
						</AlertDialogFooter>
					</>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
}

function VerifyingStep({
	mode,
	studentName,
}: {
	mode: CheckInMode | null;
	studentName: string;
}) {
	const copy =
		mode === "register"
			? {
					title: "Creating your passkey…",
					body: `First check-in for ${studentName}. Follow your device's prompt to save a passkey — you'll use it for future check-ins.`,
				}
			: {
					title: "Verifying WebAuthn Passkey credential…",
					body: "Touch your Touch ID sensor or activate your hardware security key now to sign the session assertion.",
				};

	return (
		<div
			className="flex flex-col items-center gap-6 px-4 py-6 text-center"
			aria-live="polite"
		>
			<div className="relative flex size-24 items-center justify-center">
				<div className="absolute inset-0 animate-aura rounded-full bg-primary/10 motion-reduce:animate-none" />
				<div className="size-20 animate-spin rounded-full border-4 border-secondary border-t-primary" />
				<Fingerprint className="absolute size-8 text-primary" />
			</div>
			<div className="space-y-2">
				<AlertDialogTitle className="font-bold font-display text-lg">
					{copy.title}
				</AlertDialogTitle>
				<AlertDialogDescription className="mx-auto max-w-[320px] text-xs">
					{copy.body}
				</AlertDialogDescription>
			</div>
		</div>
	);
}

import { Fingerprint, KeyRound, Mail } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { RegistrationStudent } from "#/hooks/use-passkey-registration";

export type RegisterPhase = "form" | "creating";

const emailSchema = z.email("Please enter a valid email address.");

export function RegisterDialog({
	open,
	phase,
	student,
	onClose,
	onSubmit,
}: {
	open: boolean;
	phase: RegisterPhase;
	student: RegistrationStudent | null;
	onClose: () => void;
	onSubmit: (email: string) => void;
}) {
	const emailInputId = useId();
	const [email, setEmail] = useState("");
	const [validationError, setValidationError] = useState<string | null>(null);

	const creating = phase === "creating";

	// Reset email form whenever the modal opens.
	useEffect(() => {
		if (open) {
			setEmail(student?.email ?? "");
			setValidationError(null);
		}
	}, [open, student?.email]);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const parsed = emailSchema.safeParse(email.trim());
		if (!parsed.success) {
			setValidationError(
				parsed.error.issues[0]?.message ??
					"Please enter a valid email address.",
			);
			return;
		}
		setValidationError(null);
		onSubmit(parsed.data);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && !creating) onClose();
			}}
		>
			<DialogContent showCloseButton={!creating} className="gap-5 sm:max-w-120">
				{creating ? (
					<CreatingPasskeyStep
						studentName={student?.name ?? ""}
						username={student?.username ?? ""}
					/>
				) : (
					<form onSubmit={handleSubmit} className="grid gap-5" noValidate>
						<DialogHeader className="flex flex-row items-center gap-3 text-left">
							<div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted text-primary">
								<KeyRound className="size-6" />
							</div>
							<div className="grid gap-1">
								<DialogTitle className="font-bold font-display">
									Register Passkey
								</DialogTitle>
								<DialogDescription className="text-xs">
									Enter an email address to create a WebAuthn account for this
									student.
								</DialogDescription>
							</div>
						</DialogHeader>

						<div className="space-y-2 rounded-md border bg-muted/40 p-3.5 text-xs">
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Name</span>
								<strong className="truncate font-medium text-foreground">
									{student?.name}
								</strong>
							</div>
							<div className="flex items-center justify-between gap-3 border-t pt-2">
								<span className="text-muted-foreground">Username</span>
								<span className="font-medium font-mono text-[11px] text-primary">
									{student?.username}
								</span>
							</div>
						</div>

						<div className="grid gap-2">
							<Label htmlFor={emailInputId}>Email Address</Label>
							<div className="relative">
								<Mail className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-outline" />
								<Input
									id={emailInputId}
									type="email"
									autoComplete="email"
									autoFocus
									placeholder="student@university.ac.id"
									value={email}
									aria-invalid={Boolean(validationError)}
									onChange={(event) => {
										setEmail(event.target.value);
										if (validationError) setValidationError(null);
									}}
									className="pl-9"
								/>
							</div>
							{validationError ? (
								<p className="font-medium text-destructive text-xs">
									{validationError}
								</p>
							) : (
								<p className="text-[11px] text-muted-foreground">
									Sent with username{" "}
									<code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-foreground">
										{student?.username}
									</code>{" "}
									in the request body.
								</p>
							)}
						</div>

						<DialogFooter className="border-t pt-4">
							<Button type="button" variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								className="font-semibold active:scale-[0.98]"
							>
								<Fingerprint />
								Register
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function CreatingPasskeyStep({
	studentName,
	username,
}: {
	studentName: string;
	username: string;
}) {
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
				<DialogTitle className="font-bold font-display text-lg">
					Creating your passkey…
				</DialogTitle>
				<DialogDescription className="mx-auto max-w-[340px] text-xs">
					Follow your device or browser prompt to save a passkey for{" "}
					<strong>{studentName}</strong> (
					<span className="font-mono">{username}</span>).
				</DialogDescription>
			</div>
		</div>
	);
}

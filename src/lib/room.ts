import { z } from "zod";

/** Room shown when no `?room=` search param is provided. */
export const DEFAULT_ROOM = "h.2.4";

/**
 * A room code in `building.floor.room` format, e.g. `h.2.4`.
 * Codes are normalised to lower case so `H.2.4` and `h.2.4` are the same room.
 */
export const roomCodeSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z]+\.\d+\.\d+$/, "Room must use the building.floor.room format");

export function parseRoom(code: string) {
	const [building = "", floor = "", room = ""] = code.split(".");
	return {
		code,
		label: code.toUpperCase(),
		building: building.toUpperCase(),
		floor,
		room,
	};
}

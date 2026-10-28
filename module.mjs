// @ts-check
import { module } from "@prisma/composer";
import appsensiService from "./service.mjs";

export default module("appsensi", ({ provision }) => {
  provision(appsensiService);
});

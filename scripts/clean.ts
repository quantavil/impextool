import { rmSync } from "node:fs";

// bun build keeps old hashed files, so the folder is emptied first and dist/ only ever holds the current build.
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
